/* ============================================================
   ALMACENAMIENTO DEL ESTADO DE LA APP (dependencias, espacios,
   necesidades, proyectos, eventos, auditoría, usuarios).

   Dos niveles, para que la app abra instantánea Y esté sincronizada
   entre dispositivos:
   1) localStorage: copia local, instantánea, funciona sin conexión.
   2) Cloudflare (mismo Worker, /api/state): copia compartida, la
      misma para cualquiera que entre a SINDI desde cualquier lado.

   Al abrir la app se usa primero la copia local (instantáneo) y en
   segundo plano se busca la del servidor; si hay una más nueva, se
   reemplaza y se vuelve a dibujar. Cada cambio se guarda local al
   toque y se manda al servidor con una demora corta (debounce) para
   no golpear la red en cada tecla.

   Los ARCHIVOS/FOTOS (binarios) NO se guardan acá: viajan aparte a
   Cloudflare R2 a través de /api/storage (ver js/api.js y worker.js).
   ============================================================ */
const DB_KEY = 'sindi-db-v1';

function emptyDB(){
  return {
    stations: [], spaces: [], needs: [], projects: [], events: [], requests: [], files: [], audit: [],
    users: [], // cuentas de usuario (login, Ajustes, Personal)
    maintenance: [], // tareas periódicas (Mantenimiento)
    tasks: [], // tareas puntuales de trabajo (Tareas)
    seq: { need:0, project:0 },
    updatedAt: null, // se usa para decidir cuál copia es más nueva (local vs. servidor)
  };
}

function loadDB(){
  try{
    const raw = localStorage.getItem(DB_KEY);
    if(!raw) return emptyDB();
    const parsed = JSON.parse(raw);
    return Object.assign(emptyDB(), parsed);
  }catch(e){
    return emptyDB();
  }
}

let saveTimer = null;
function saveDB(DB, onSaved){
  DB.updatedAt = new Date().toISOString();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(()=>{
    try{
      localStorage.setItem(DB_KEY, JSON.stringify(DB));
      if(onSaved) onSaved(true);
    }catch(e){
      if(onSaved) onSaved(false);
    }
  }, 300);
}

/* ---- Sincronización con el servidor (Cloudflare) ---- */

// Trae el estado compartido. Devuelve null si todavía no hay ninguno
// guardado en el servidor (primera vez que se usa la app) o si falló
// la conexión (se sigue trabajando con la copia local sin problema).
async function fetchServerDB(){
  try{
    const res = await fetch('/api/state');
    const data = await res.json();
    if(data && data.ok && data.state) return data.state;
    return null;
  }catch(e){
    console.error('[SINDI] No se pudo traer el estado del servidor:', e);
    return null;
  }
}

let syncTimer = null;
// Manda la copia actual al servidor, con una demora corta para agrupar
// varios cambios seguidos en un solo pedido de red.
function syncDBToServer(DB){
  clearTimeout(syncTimer);
  syncTimer = setTimeout(async ()=>{
    try{
      const res = await fetch('/api/state', { method:'POST', body: JSON.stringify(DB) });
      const data = await res.json();
      if(!data || !data.ok){
        console.error('[SINDI] El servidor no pudo guardar el estado:', data && data.error);
      }
    }catch(e){
      console.error('[SINDI] No se pudo sincronizar con el servidor (sin conexión?):', e);
    }
  }, 1500);
}
