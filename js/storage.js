/* ============================================================
   ALMACENAMIENTO DEL ESTADO DE LA APP (dependencias, espacios,
   necesidades, proyectos, eventos, auditoría).
   Se guarda en localStorage del navegador, por dispositivo.
   Los ARCHIVOS/FOTOS (binarios) NO se guardan acá: viajan a
   Cloudflare R2 a través del Worker (ver js/api.js y worker.js).
   ============================================================ */
const DB_KEY = 'sindi-db-v1';

function emptyDB(){
  return {
    stations: [], spaces: [], needs: [], projects: [], events: [], requests: [], files: [], audit: [],
    users: [], // cuentas de usuario (login, Ajustes, Personal)
    maintenance: [], // tareas periódicas (Mantenimiento)
    tasks: [], // tareas puntuales de trabajo (Tareas)
    seq: { need:0, project:0 },
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
