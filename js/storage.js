/* ============================================================
   ALMACENAMIENTO DEL ESTADO DE LA APP — SOLO EN EL SERVIDOR.

   Todos los datos (dependencias, espacios, necesidades, proyectos,
   eventos, usuarios, auditoría, etc.) viven en Cloudflare (Worker +
   R2). Este dispositivo NO guarda ninguna copia de los datos: al abrir
   la app se descargan del servidor, y cada cambio se manda al servidor.
   Así todos ven lo mismo, desde cualquier dispositivo y lugar.

   Lo único que se recuerda en el dispositivo es de UI (quién está
   logueado y en qué pantalla estás), para que al recargar no te lleve
   al inicio. Ver saveNav()/restoreNav() en app-core.js.

   Cómo se evitan pisadas entre dispositivos:
   - No se manda la base entera, sino SOLO lo que cambió (registros
     nuevos/modificados y ids borrados). El Worker lo aplica sobre la
     versión más nueva del servidor (ver worker.js).
   - La app consulta cada pocos segundos si hubo cambios de otros y los
     incorpora sin perder lo que uno esté editando.
   ============================================================ */

const LEGACY_DB_KEY = 'sindi-db-v1'; // copia local de versiones anteriores (solo se lee para migrar)
const POLL_MS = 8000;

function emptyDB(){
  return {
    stations: [], spaces: [], needs: [], projects: [], events: [], requests: [], files: [], audit: [],
    users: [], // cuentas de usuario (login, Ajustes, Personal)
    maintenance: [], // tareas periódicas (Mantenimiento)
    tasks: [], // tareas puntuales de trabajo (Tareas)
    purchases: [], // compras
    seq: { need:0, project:0 },
    updatedAt: null,
  };
}

function cloneDB(o){ return JSON.parse(JSON.stringify(o)); }

/* ---- Diferencias entre dos versiones de la base (por registro, usando "id") ---- */
function diffDB(base, cur){
  if(!base) return null;
  const collections = {};
  const keys = new Set([...Object.keys(base), ...Object.keys(cur)]);
  keys.forEach(key=>{
    if(!Array.isArray(cur[key]) && !Array.isArray(base[key])) return;
    const baseMap = new Map();
    (base[key]||[]).forEach(it=>{ if(it && it.id) baseMap.set(it.id, JSON.stringify(it)); });
    const upsert = [], seen = new Set();
    (cur[key]||[]).forEach(it=>{
      if(!it || !it.id) return;
      seen.add(it.id);
      if(baseMap.get(it.id) !== JSON.stringify(it)) upsert.push(it);
    });
    const remove = [];
    baseMap.forEach((_, id)=>{ if(!seen.has(id)) remove.push(id); });
    if(upsert.length || remove.length) collections[key] = { upsert, remove };
  });
  const seq = {};
  Object.keys(cur.seq||{}).forEach(k=>{
    if((Number(cur.seq[k])||0) > (Number((base.seq||{})[k])||0)) seq[k] = cur.seq[k];
  });
  if(!Object.keys(collections).length && !Object.keys(seq).length) return null;
  return { collections, seq };
}

// Aplica un patch sobre una copia de la base (mismo criterio que el Worker).
function applyPatchLocal(state, patch){
  const out = state;
  const cols = (patch && patch.collections) || {};
  Object.keys(cols).forEach(name=>{
    const c = cols[name] || {};
    const removeSet = new Set(c.remove || []);
    const list = (Array.isArray(out[name]) ? out[name] : []).filter(it=>it && !removeSet.has(it.id));
    const index = new Map(list.map((it,i)=>[it.id, i]));
    (c.upsert || []).forEach(it=>{
      if(!it || !it.id) return;
      if(index.has(it.id)) list[index.get(it.id)] = it;
      else { index.set(it.id, list.length); list.push(it); }
    });
    out[name] = list;
  });
  out.seq = Object.assign({}, out.seq || {});
  Object.keys((patch && patch.seq) || {}).forEach(k=>{
    out.seq[k] = Math.max(Number(out.seq[k])||0, Number(patch.seq[k])||0);
  });
  return out;
}

// Pasa el contenido de "target" a la base global DB CONSERVANDO los objetos
// existentes (mismo id = mismo objeto, actualizado por dentro). Importante:
// hay pantallas que, mientras suben una foto, tienen una referencia a un
// registro; si se reemplazara el objeto, ese cambio se perdería.
function mergeIntoDB(DBref, target){
  Object.keys(target).forEach(key=>{
    const val = target[key];
    if(Array.isArray(val)){
      const current = new Map((DBref[key]||[]).map(it=>[it && it.id, it]));
      DBref[key] = val.map(item=>{
        const existing = item && current.get(item.id);
        if(!existing) return item;
        if(JSON.stringify(existing) !== JSON.stringify(item)){
          Object.keys(existing).forEach(k=>{ delete existing[k]; });
          Object.assign(existing, item);
        }
        return existing;
      });
    } else {
      DBref[key] = val;
    }
  });
}

function comparableDB(d){
  const c = Object.assign({}, d);
  Object.keys(c).forEach(k=>{ if(k.charAt(0)==='_') delete c[k]; });
  delete c.updatedAt;
  return JSON.stringify(c);
}

/* ---- Estado de la sincronización ---- */
let SYNCED = null;          // última copia conocida del servidor
let SERVER_REV = 0;         // revisión de esa copia
let syncInFlight = false;
let syncAgain = false;
let syncTimer = null;
let retryTimer = null;
let retryCount = 0;
let syncStatus = 'ok';      // ok | pending | saving | error
let pendingRender = false;
let bootDone = false;       // recién después del arranque se puede redibujar por cambios remotos

function setSyncStatus(s){
  syncStatus = s;
  const el = document.getElementById('sync-status');
  if(!el) return;
  const map = {
    ok:      ['● Sincronizado', 'ok'],
    pending: ['● Guardando…', 'warn'],
    saving:  ['● Guardando…', 'warn'],
    error:   ['● Sin conexión — reintentando', 'danger'],
  };
  el.textContent = map[s][0];
  el.className = 'sync-pill ' + map[s][1];
}

// Compatibilidad: todo el código llama persist() -> saveDB(DB).
function saveDB(DBref){
  DBref.updatedAt = new Date().toISOString();
  scheduleSync(600);
}

function scheduleSync(delay){
  clearTimeout(syncTimer);
  setSyncStatus('pending');
  syncTimer = setTimeout(runSync, delay);
}

async function runSync(){
  if(!SYNCED) return; // todavía no se cargó nada del servidor
  if(syncInFlight){ syncAgain = true; return; }
  const patch = diffDB(SYNCED, DB);
  if(!patch){ setSyncStatus('ok'); return; }

  syncInFlight = true;
  setSyncStatus('saving');
  const sent = cloneDB(DB);
  try{
    const res = await fetch('/api/state', {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ patch }),
    });
    const data = await res.json();
    if(!data || !data.ok) throw new Error((data && data.error) || ('Error ' + res.status));
    adoptServerState(data.state, data.rev, sent);
    retryCount = 0;
    toast('Guardado');
  }catch(e){
    console.error('[SINDI] No se pudo guardar en el servidor:', e);
    setSyncStatus('error');
    retryCount++;
    if(retryCount === 1) toast('No se pudo guardar en el servidor. Se reintenta solo.');
    clearTimeout(retryTimer);
    retryTimer = setTimeout(runSync, Math.min(3000 * Math.pow(2, retryCount-1), 30000));
  }finally{
    syncInFlight = false;
    if(syncAgain){ syncAgain = false; scheduleSync(200); }
    else if(syncStatus !== 'error'){
      // Si mientras se guardaba hubo más cambios, se manda otra tanda.
      if(diffDB(SYNCED, DB)) scheduleSync(200); else setSyncStatus('ok');
    }
  }
}

// Incorpora una copia del servidor. Los cambios locales todavía no
// enviados (respecto de "baseForLocal", o de la última copia conocida)
// se vuelven a aplicar encima, así no se pierde lo que uno estaba haciendo.
function adoptServerState(serverState, rev, baseForLocal){
  const local = diffDB(baseForLocal || SYNCED, DB);
  const target = local ? applyPatchLocal(cloneDB(serverState), local) : cloneDB(serverState);
  const changed = comparableDB(target) !== comparableDB(DB);
  mergeIntoDB(DB, target);
  SYNCED = cloneDB(serverState);
  SERVER_REV = rev;
  if(changed) requestRender();
}

// Vuelve a dibujar, salvo que haya un modal abierto o se esté escribiendo
// en un campo: en ese caso se difiere hasta que termine.
function userIsEditing(){
  if(document.getElementById('modal-wrap')) return true;
  const a = document.activeElement;
  return !!(a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && document.getElementById('app').contains(a));
}
function requestRender(){
  if(!bootDone) return;
  if(userIsEditing()){ pendingRender = true; return; }
  pendingRender = false;
  render();
}
function flushPendingRender(){ if(pendingRender && !userIsEditing()) requestRender(); }

async function pollServer(){
  if(!SYNCED || syncInFlight) return;
  try{
    const res = await fetch('/api/state?full=1&since=' + SERVER_REV, { cache:'no-store' });
    const data = await res.json();
    if(syncInFlight) return;
    if(data && data.ok && data.changed && data.state && data.rev > SERVER_REV){
      adoptServerState(data.state, data.rev, null);
    }
  }catch(e){ /* sin conexión: se reintenta en el próximo ciclo */ }
}

/* ---- Carga inicial (siempre desde el servidor) ---- */
async function fetchServerState(){
  const res = await fetch('/api/state?full=1', { cache:'no-store' });
  const data = await res.json();
  if(!data || !data.ok) throw new Error((data && data.error) || ('Respuesta inesperada (' + res.status + ')'));
  return data; // { state|null, rev }
}

// Copia local de versiones anteriores de SINDI: se sube UNA vez al servidor
// (solo lo que el servidor no tenga) y se borra del dispositivo.
function readLegacyLocal(){
  try{
    const raw = localStorage.getItem(LEGACY_DB_KEY);
    return raw ? JSON.parse(raw) : null;
  }catch(e){ return null; }
}
function legacyPatchAgainst(serverState, legacy){
  const collections = {};
  Object.keys(legacy).forEach(key=>{
    if(!Array.isArray(legacy[key])) return;
    const known = new Set((serverState[key]||[]).map(it=>it && it.id));
    const knownNames = key==='users' ? new Set((serverState.users||[]).map(u=>u.name)) : null;
    const upsert = legacy[key].filter(it=>{
      if(!it || !it.id || known.has(it.id)) return false;
      if(knownNames && knownNames.has(it.name)) return false; // mismo usuario con otro id
      return true;
    });
    if(upsert.length) collections[key] = { upsert, remove: [] };
  });
  return { collections, seq: legacy.seq || {} };
}

async function loadInitialDB(){
  const { state, rev } = await fetchServerState();
  const legacy = readLegacyLocal();

  if(state){
    DB = Object.assign(emptyDB(), state);
    SYNCED = cloneDB(state);
    SERVER_REV = rev;
    if(legacy){
      applyPatchLocal(DB, legacyPatchAgainst(state, legacy));
      ensureUsersSeeded();
      await runSync();
      if(!diffDB(SYNCED, DB)) try{ localStorage.removeItem(LEGACY_DB_KEY); }catch(e){}
    } else {
      ensureUsersSeeded();
    }
    return;
  }

  // El servidor no tiene datos todavía (primer uso): se parte de la copia
  // local vieja, si existe, o de una base vacía con los usuarios iniciales.
  DB = Object.assign(emptyDB(), legacy || {});
  ensureUsersSeeded();
  const res = await fetch('/api/state', {
    method:'POST', headers:{ 'Content-Type':'application/json' },
    body: JSON.stringify({ mode:'init', state: DB }),
  });
  const data = await res.json();
  if(!data || !data.ok) throw new Error((data && data.error) || 'No se pudo inicializar el servidor');
  DB = Object.assign(emptyDB(), data.state);
  SYNCED = cloneDB(data.state);
  SERVER_REV = data.rev;
  if(legacy) try{ localStorage.removeItem(LEGACY_DB_KEY); }catch(e){}
}

/* ---- Guardar antes de cerrar / al pasar a segundo plano ---- */
window.addEventListener('visibilitychange', ()=>{
  if(document.visibilityState === 'hidden' && SYNCED && diffDB(SYNCED, DB)){ clearTimeout(syncTimer); runSync(); }
  if(document.visibilityState === 'visible') pollServer();
});
window.addEventListener('beforeunload', e=>{
  if(SYNCED && (syncInFlight || diffDB(SYNCED, DB))){ e.preventDefault(); e.returnValue = ''; }
});
window.addEventListener('online', ()=>{ if(SYNCED) runSync(); });
