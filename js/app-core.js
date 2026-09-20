/* ============================================================
   NÚCLEO: utilidades, estado global, login, shell/navegación,
   reloj y dashboard.
   ============================================================ */

function uid(){ return 'id-' + Math.random().toString(36).slice(2,10) + Date.now().toString(36); }
function esc(s){ return (s==null?'':String(s)).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function m2(n){ return (Number(n)||0).toLocaleString('es-AR',{minimumFractionDigits:2, maximumFractionDigits:2}); }
// Inversión de un proyecto: se carga en millones de pesos (ej: 125 -> "$125 millones").
function formatInvestment(n){
  const v = Number(n)||0;
  if(!v) return '—';
  return '$' + v.toLocaleString('es-AR') + ' millones';
}
// Badge visual de prioridad, reutilizado en el Panel General y en los listados.
function priorityBadge(pr){
  if(!pr) return '';
  const cls = pr==='ALTA' ? 'danger' : pr==='MEDIA' ? 'warn' : 'ok';
  return `<span class="badge ${cls}">${esc(pr)}</span>`;
}
// Nombre de carpeta de Drive de un proyecto: "<código> - <nombre>", siempre con
// el código adelante para no perder trazabilidad con la ficha aunque cambie el nombre.
function projectFolderSegment(p){ return `${p.code} - ${p.name}`; }
// Espacio relevado que originó el proyecto (vía la necesidad de origen).
function projectSpaceName(p){
  const need = p.needId ? DB.needs.find(n=>n.id===p.needId) : null;
  const space = need && need.spaceId ? DB.spaces.find(s=>s.id===need.spaceId) : null;
  return space ? space.name : '—';
}
function pad3(n){ return String(n).padStart(3,'0'); }
function todayISO(){ const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); } // fecha LOCAL (no UTC)
function nowTimeStr(){ return new Date().toTimeString().slice(0,5); }
function nowClockStr(){ const d = new Date(); const t = d.toTimeString().slice(0,5); return window.innerWidth <= 380 ? t : d.toLocaleDateString('es-AR') + ' · ' + t; } // en celulares muy angostos, solo la hora
function slugify(s){ return (s||'').toString().trim().replace(/\s+/g,'_').replace(/[^\w\-]/g,'').slice(0,40); }

/* ============================================================
   USUARIOS
   Base inicial: 5 perfiles fijos con contraseña "0405" (editable
   por cada uno desde Ajustes). A partir de acá se pueden dar de
   alta nuevos usuarios con usuario y contraseña propios: dejan
   de depender de la contraseña compartida.
   DB.users es la fuente de verdad; SEED_USERS solo se usa una
   vez, la primera vez que se abre la app, para poblarla.
   ============================================================ */
const SEED_USERS = ['Leonardo Villarreal','Micaela Mercado','Ulises Sayago','Nicolás Cabral','Victoria Torres'];
const DEFAULT_PASSWORD = '0405';
// Única clasificación de usuario admitida en SINDI: Miembro o Colaborador.
// (No crear categorías nuevas como Inspector/Supervisor/Fiscalizador.)
const USER_ROLES = [
  {key:'MIEMBRO', label:'Miembro'},
  {key:'COLABORADOR', label:'Colaborador'},
];
function userRoleLabel(r){ const f = USER_ROLES.find(x=>x.key===r); return f ? f.label : (r||'—'); }

function ensureUsersSeeded(){
  if(!Array.isArray(DB.users)) DB.users = [];
  if(DB.users.length===0){
    // Ids fijos (derivados del nombre): si dos dispositivos crean la base inicial
    // a la vez, el servidor los reconoce como los mismos usuarios y no se duplican.
    DB.users = SEED_USERS.map(name=>({
      id: 'user-' + slugify(name), name, password: DEFAULT_PASSWORD, area:'', role:'MIEMBRO', photo:'', fixed:true,
    }));
    saveDB(DB); // sin toast: alta silenciosa de la base inicial
  }
}
function allUserNames(){ return DB.users.map(u=>u.name); }
function findUserByName(name){ return DB.users.find(u=>u.name===name); }
function findUserById(id){ return DB.users.find(u=>u.id===id); }
function avatarHtml(user, size){
  size = size || 34;
  const initials = (user?.name||'?').split(/\s+/).map(w=>w[0]).slice(0,2).join('').toUpperCase();
  if(user?.photo){
    return `<img src="${esc(user.photo)}" alt="${esc(user.name)}" style="width:${size}px;height:${size}px;border-radius:50%;object-fit:cover;border:1px solid var(--line);">`;
  }
  return `<div style="width:${size}px;height:${size}px;border-radius:50%;background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:center;font-size:${Math.round(size*0.38)}px;font-weight:700;">${esc(initials)}</div>`;
}
function sessionAvatarHtml(){
  const user = session ? findUserById(session.id) : null;
  return avatarHtml(user, 32);
}

const app = document.getElementById('app');
const toastEl = document.getElementById('toast');
let toastTimer = null;
function toast(msg, isError){
  clearTimeout(toastTimer);
  toastEl.textContent = msg;
  toastEl.classList.toggle('is-error', !!isError);
  toastEl.classList.add('show');
  // Tocar el mensaje siempre lo cierra al toque.
  toastEl.onclick = () => { toastEl.classList.remove('show'); clearTimeout(toastTimer); };
  if(isError){
    // Los errores NO se cierran solos: se quedan fijos hasta que los
    // toques, para poder leerlos con calma. Además se copian solos al
    // portapapeles para poder pegarlos y mandarlos tal cual.
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(msg).catch(()=>{});
    }
  } else {
    toastTimer = setTimeout(()=>toastEl.classList.remove('show'), 1600);
  }
}

/* ===================== ESTADO ===================== */
let DB = emptyDB();
let session = null; // { name, role }
let route = 'dashboard';
let detailState = { spaceId: null, tab: 'general' };
let projectDetailState = { projectId: null, returnRoute: 'projects' };
// Navegación de Espacios: dependencia → nivel → relevamientos.
let spacesNav = { stationId: null, level: null };
let stationDetailState = { stationId: null };
let modal = null;

/* ===================== ARRANQUE ===================== */
function renderBoot(msg){
  app.innerHTML = `
    <div class="login-screen">
      <div class="login-card" style="max-width:360px;text-align:center;">
        <div class="login-title">SINDI</div>
        <p class="login-sub" style="margin-top:14px;">${esc(msg)}</p>
      </div>
    </div>`;
}
function renderBootError(err){
  app.innerHTML = `
    <div class="login-screen">
      <div class="login-card" style="max-width:420px;text-align:center;">
        <div class="login-title">SINDI</div>
        <p class="login-sub" style="margin:14px 0 6px;">No se pudieron cargar los datos del servidor.</p>
        <p class="login-sub" style="font-size:11.5px;margin:0 0 18px;">Revisá tu conexión a internet. Los datos no se guardan en este dispositivo, así que se necesita conexión para abrir la app.</p>
        <pre style="white-space:pre-wrap;word-break:break-word;font-size:11px;background:#12161c;border-radius:8px;padding:10px;color:#e2b6b0;margin:0 0 16px;text-align:left;">${esc(String(err && err.message || err))}</pre>
        <button class="btn btn-primary" style="width:100%;" onclick="init()">Reintentar</button>
      </div>
    </div>`;
}

let appStarted = false;
async function init(){
  // Al recargar, no se muestra ningún pantallazo mientras carga: si los
  // datos llegan rápido (caso normal), se pasa directo de la pantalla en
  // blanco al contenido final, sin flash de una pantalla intermedia. Solo
  // si tarda de verdad se muestra el aviso, para no dejar la app "colgada"
  // sin feedback en una conexión lenta.
  const bootTimer = setTimeout(()=> renderBoot('Cargando datos…'), 700);
  try{
    await loadInitialDB();
  }catch(e){
    clearTimeout(bootTimer);
    console.error('[SINDI] Error al cargar los datos:', e);
    renderBootError(e);
    return;
  }
  clearTimeout(bootTimer);
  restoreNav();
  bootDone = true;
  render();

  if(appStarted) return; // los temporizadores se crean una sola vez
  appStarted = true;
  setInterval(()=>{ const c = document.getElementById('clock'); if(c) c.textContent = nowClockStr(); }, 5000);
  // Cada pocos segundos se consulta si otro dispositivo cambió algo.
  setInterval(()=>{ pollServer(); }, POLL_MS);
  setInterval(flushPendingRender, 2000);
  checkDueNotifications();
  setInterval(checkDueNotifications, NOTIF_CHECK_MS);
}

function persist(){ saveDB(DB); }

/* ===================== NOTIFICACIONES (eventos y tareas de hoy) =====================
   Aviso local (sin servidor push) de los eventos de hoy y de las tareas
   propias pendientes para hoy. Funciona mientras la app está abierta —
   en la pestaña o en segundo plano — en Android y en iPhone instalado
   como app ("Compartir → Agregar a inicio", iOS 16.4+). No llega si la
   app está completamente cerrada: eso requeriría notificaciones push
   desde un servidor, que todavía no está configurado. */
const NOTIF_CHECK_MS = 5 * 60 * 1000; // se revisa cada 5 minutos
const NOTIF_ENABLED_KEY = 'sindi-notif-enabled';
const NOTIFIED_KEY = 'sindi-notified-v1';
function notificationsSupported(){ return typeof Notification !== 'undefined'; }
function notificationsEnabled(){ return localStorage.getItem(NOTIF_ENABLED_KEY) === '1'; }
function loadNotified(){
  try{ return JSON.parse(localStorage.getItem(NOTIFIED_KEY) || '{}'); }catch(e){ return {}; }
}
function markNotified(key){
  const n = loadNotified();
  n[key] = todayISO();
  const cutoff = new Date(Date.now() - 3*24*3600*1000).toISOString().slice(0,10);
  Object.keys(n).forEach(k=>{ if(n[k] < cutoff) delete n[k]; });
  try{ localStorage.setItem(NOTIFIED_KEY, JSON.stringify(n)); }catch(e){}
}
function wasNotifiedToday(key){ return loadNotified()[key] === todayISO(); }
async function showLocalNotification(title, body, tag){
  if(!notificationsSupported() || Notification.permission !== 'granted') return;
  try{
    if('serviceWorker' in navigator){
      const reg = await navigator.serviceWorker.ready;
      reg.showNotification(title, { body, tag, icon:'/icons/icon-192.png', badge:'/icons/favicon-64.png' });
    } else {
      new Notification(title, { body, tag, icon:'/icons/icon-192.png' });
    }
  }catch(e){ console.warn('[SINDI] No se pudo mostrar la notificación:', e); }
}
async function enableNotifications(){
  if(!notificationsSupported()){ toast('Este navegador no soporta notificaciones'); return; }
  try{
    const perm = await Notification.requestPermission();
    if(perm === 'granted'){
      localStorage.setItem(NOTIF_ENABLED_KEY, '1');
      toast('Notificaciones activadas');
      checkDueNotifications();
    } else {
      toast('No se concedió el permiso de notificaciones');
    }
  }catch(e){ toast('No se pudo activar: ' + e.message, true); }
  render();
}
function disableNotifications(){
  localStorage.setItem(NOTIF_ENABLED_KEY, '0');
  toast('Notificaciones desactivadas');
  render();
}
function checkDueNotifications(){
  if(!session || !DB || !notificationsSupported()) return;
  if(Notification.permission !== 'granted' || !notificationsEnabled()) return;
  const today = todayISO();
  (DB.events||[]).filter(e=>e.date===today).forEach(e=>{
    const key = 'ev:'+e.id;
    if(wasNotifiedToday(key)) return;
    showLocalNotification('Evento hoy: ' + e.title, (e.time ? `A las ${e.time}. ` : '') + (e.place || e.type || ''), key);
    markNotified(key);
  });
  (DB.tasks||[]).filter(t=>t.status==='PENDIENTE' && t.date===today && t.responsible===session.name).forEach(t=>{
    const key = 'tk:'+t.id;
    if(wasNotifiedToday(key)) return;
    showLocalNotification('Tarea para hoy', t.description || 'Tenés una tarea programada', key);
    markNotified(key);
  });
}

/* ===================== NAVEGACIÓN RECORDADA =====================
   Solo se guarda en el dispositivo QUIÉN está logueado y EN QUÉ
   PANTALLA está (nada de datos). Así, al recargar la página se vuelve
   exactamente a donde se estaba, en vez de ir al inicio. */
const NAV_KEY = 'sindi-nav-v1';
const SESSION_MAX_HOURS = 24; // pasado este tiempo sin usar la app, vuelve a pedir la contraseña
function saveNav(){
  try{
    if(!session){ localStorage.removeItem(NAV_KEY); return; }
    localStorage.setItem(NAV_KEY, JSON.stringify({
      ts: Date.now(), userId: session.id, route, detailState, projectDetailState, spacesNav, stationDetailState,
    }));
  }catch(e){}
}
function restoreNav(){
  let nav = null;
  try{ nav = JSON.parse(localStorage.getItem(NAV_KEY) || 'null'); }catch(e){}
  if(!nav || !nav.userId || (Date.now() - (nav.ts||0)) > SESSION_MAX_HOURS*3600*1000) return;
  const user = findUserById(nav.userId);
  if(!user) return;
  session = { id: user.id, name: user.name, role: user.role };
  if(NAV.some(n=>n.key===nav.route)) route = nav.route;
  // Solo se restauran las fichas abiertas si el registro todavía existe.
  if(nav.detailState && DB.spaces.some(x=>x.id===nav.detailState.spaceId)) detailState = nav.detailState;
  if(nav.projectDetailState && DB.projects.some(x=>x.id===nav.projectDetailState.projectId)) projectDetailState = nav.projectDetailState;
  if(nav.stationDetailState && DB.stations.some(x=>x.id===nav.stationDetailState.stationId)) stationDetailState = nav.stationDetailState;
  if(nav.spacesNav) spacesNav = nav.spacesNav;
}
function logAudit(action, entity, description){
  DB.audit.unshift({ id: uid(), ts: new Date().toISOString(), user: session?.name || 'Sistema', action, entity, description });
  DB.audit = DB.audit.slice(0, 200);
}
function nextCode(prefix, key){
  DB.seq[key] = (DB.seq[key]||0) + 1;
  return prefix + '-' + pad3(DB.seq[key]);
}

/* ===================== LOGIN ===================== */
let loginPick = null; // nombre elegido
function renderLogin(){
  ensureUsersSeeded();
  const profiles = allUserNames();
  app.innerHTML = `
    <div class="login-screen">
      <div class="login-card" style="max-width:360px;text-align:center;">
        <div class="login-title">SINDI</div>
        <label class="field" style="text-align:left;margin-top:28px;">
          <span>Seleccionar miembro</span>
          <select id="li-user" onchange="pickLoginProfile(this.value)">
            <option value="">Elegí tu perfil…</option>
            ${profiles.map(p=>`<option value="${esc(p)}" ${loginPick===p?'selected':''}>${esc(p)}</option>`).join('')}
          </select>
        </label>
        ${loginPick ? `
          <label class="field" style="text-align:left;"><span>Contraseña</span><input id="li-pass" type="password" placeholder="••••" onkeydown="if(event.key==='Enter') doLogin();"></label>
          <button class="btn btn-primary" style="width:100%;" onclick="doLogin()">Ingresar</button>
        ` : ''}
      </div>
    </div>`;
  const passEl = document.getElementById('li-pass');
  if(passEl) passEl.focus();
}
function pickLoginProfile(p){ loginPick = p || null; render(); }
function doLogin(){
  const pass = document.getElementById('li-pass').value;
  const user = findUserByName(loginPick);
  if(!user){ toast('Perfil no encontrado'); return; }
  if(pass !== user.password){ toast('Contraseña incorrecta'); return; }
  session = { id: user.id, name: user.name, role: user.role };
  loginPick = null;
  route = 'dashboard';
  render();
}
function doLogout(){ session = null; loginPick = null; render(); }

/* ===================== SHELL / NAV ===================== */
const NAV = [
  {key:'dashboard', label:'Inicio'},
  {key:'stations', label:'Dependencias'},
  {key:'spaces', label:'Espacios y relevamientos'},
  {key:'needs', label:'Necesidades'},
  {key:'projects', label:'Proyectos'},
  {key:'completed-projects', label:'Completados'},
  {key:'purchases', label:'Compras'},
  {key:'files', label:'Archivos'},
  {key:'events', label:'Eventos'},
  {key:'requests', label:'Pedidos'},
  {key:'maintenance', label:'Mantenimiento'},
  {key:'tasks', label:'Tareas'},
  {key:'personal', label:'Personal'},
  {key:'audit', label:'Auditoría'},
  {key:'settings', label:'Ajustes'},
];

let navOpen = false;
function toggleNav(){ navOpen = !navOpen; syncNavDom(); }
function closeNav(){ if(navOpen){ navOpen = false; syncNavDom(); } }
function syncNavDom(){
  const sb = document.querySelector('.sidebar');
  const ov = document.querySelector('.nav-overlay');
  if(sb) sb.classList.toggle('open', navOpen);
  if(ov) ov.classList.toggle('show', navOpen);
}

function renderShell(innerHtml, pageTitle, pageSub){
  document.body.classList.toggle('is-dash', route==='dashboard');
  app.innerHTML = `
    <div class="shell ${route==='dashboard'?'dash':''}">
      <div class="nav-overlay ${navOpen?'show':''}" onclick="closeNav()"></div>
      <aside class="sidebar ${navOpen?'open':''}">
        <div class="brand"><img class="brand-logo" src="icons/logo-bomberos.png" alt="Logo Bomberos"> SINDI</div>
        <div class="brand-sub">${esc(ORG_NAME)}</div>
        <nav>${NAV.map(n=>`<div class="nav-item ${route===n.key?'active':''}" onclick="closeNav(); goRoute('${n.key}')">${esc(n.label)}</div>`).join('')}</nav>
      </aside>
      <div class="main">
        <div class="topbar">
          <div style="display:flex;align-items:center;gap:10px;">
            <button class="nav-toggle" onclick="toggleNav()" aria-label="Abrir menú">☰</button>
            <div class="mono" id="clock" style="font-size:14px;color:var(--ink-soft);font-weight:600;">${nowClockStr()}</div>
          </div>
          <div style="display:flex;align-items:center;gap:12px;">
            <div style="text-align:right;" class="topbar-username">
              <div style="font-size:13px;font-weight:600;">${esc(session.name)}</div>
              <div style="font-size:10.5px;color:var(--ink-soft);">${esc(userRoleLabel(session.role))}</div>
            </div>
            ${sessionAvatarHtml()}
            <span id="sync-status" class="sync-pill ok">● Sincronizado</span>
            <button class="btn btn-ghost btn-sm" onclick="goRoute('settings')">Ajustes</button>
            <button class="btn btn-danger" onclick="doLogout()">Salir</button>
          </div>
        </div>
        <div class="content">
          ${pageTitle ? `<h1 class="page-title">${esc(pageTitle)}</h1>` : ''}
          ${pageSub ? `<p class="page-sub">${esc(pageSub)}</p>` : ''}
          ${innerHtml}
        </div>
      </div>
    </div>`;
  setSyncStatus(syncStatus);
}
function goRoute(key){ dashCal = { y:null, m:null, sel:null }; route = key; navOpen = false; detailState = { spaceId:null, tab:'general' }; projectDetailState = { projectId:null, returnRoute:'projects' }; stationDetailState = { stationId:null }; spacesNav = { stationId:null, level:null }; render(); }

/* ===================== INICIO (panel general) ===================== */
function computeSurfaceTotals(){
  const t = { CUBIERTA:0, SEMICUBIERTA:0, DESCUBIERTA:0 };
  DB.spaces.filter(s=>s.active!==false).forEach(s=>{ t[s.surfaceType] = (t[s.surfaceType]||0) + (Number(s.surfaceM2)||0); });
  return { ...t, total: t.CUBIERTA + t.SEMICUBIERTA + t.DESCUBIERTA };
}
function stationSurfaceTotal(stationId){
  return DB.spaces.filter(s=>s.active!==false && s.stationId===stationId).reduce((sum,s)=> sum + (Number(s.surfaceM2)||0), 0);
}
function stationNameById(id){
  const s = DB.stations.find(x=>x.id===id);
  return s ? s.name : 'Sin dependencia asignado';
}
// Clave de orden de carga (más reciente primero) para las tarjetas de
// "últimos 3 registros" del Panel General. Cada módulo tiene su propio
// campo de fecha/hora, así que se normaliza acá en un único lugar.
function loadOrderKey(x){
  return x.createdAtISO || `${x.createdAt||x.date||''}T${x.createdAtTime||x.time||'00:00'}`;
}
function lastLoaded(list, n){ return list.slice().sort((a,b)=> loadOrderKey(b).localeCompare(loadOrderKey(a))).slice(0, n); }

/* El panel general (renderDashboard) vive en js/app-dashboard.js */


/* ===================== MODAL genérico ===================== */
function renderModal(innerHtml){
  const wrap = document.createElement('div');
  wrap.className = 'modal-wrap';
  wrap.id = 'modal-wrap';
  wrap.innerHTML = `<div class="modal">${innerHtml}</div>`;
  document.body.appendChild(wrap);
}
function closeModal(){
  const el = document.getElementById('modal-wrap');
  if(el) el.remove();
  modal = null;
}
