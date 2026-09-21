/* ============================================================
   GESTOR DOCUMENTAL: apartado "ARCHIVOS" (documentación general
   del dependencia) y "Archivos del proyecto" (reutiliza el mismo
   componente). Todo se sube a Cloudflare R2 vía el Worker del
   propio dominio; acá solo se guarda el metadato (nombre, url,
   descripción).
   ============================================================ */

const FILE_CATEGORIES = [
  {key:'DOCUMENTACION', label:'Documentación'},
  {key:'PLANOS', label:'Planos'},
  {key:'INFORMES', label:'Informes'},
  {key:'CERTIFICADOS', label:'Certificados'},
  {key:'OTROS', label:'Otros'},
];
const ALLOWED_FILE_TYPES = '.pdf,.jpg,.jpeg,.png';

function renderFiles(){
  const activeCat = renderFiles._activeCat || 'DOCUMENTACION';
  const folderPath = ['ARCHIVOS', activeCat];
  const html = `
    <div class="file-cat-tabs">
      ${FILE_CATEGORIES.map(c=>`<div class="detail-tab ${activeCat===c.key?'active':''}" onclick="renderFiles._activeCat='${c.key}'; render();">${c.label}</div>`).join('')}
    </div>
    <div class="card">${renderFileManager({ folderPath, storeKey:'archivos:'+activeCat, emptyMsg:'Sin archivos en esta categoría todavía.' })}</div>`;
  renderShell(html, 'Archivos', 'Gestor documental del dependencia: documentación, planos, informes, certificados y otros archivos.');
  wireFileManagerEvents({ folderPath, storeKey:'archivos:'+activeCat });
}

/* ---- Componente reutilizable de gestor de archivos ----
   refreshFnName (opcional): nombre de función global, en texto, para
   volver a pintar SOLO este componente después de subir/quitar un
   archivo cuando vive dentro de un modal (que no se re-renderiza con
   el render() de la página). Ver uso en app-materials-purchases.js. */
function renderFileManager({ folderPath, storeKey, emptyMsg, refreshFnName }){
  const files = DB.files.filter(f=>f.storeKey===storeKey);
  return `
    <label class="dropzone" style="display:block;margin-bottom:6px;">
      + Agregar archivo (PDF, JPG, PNG)
      <input id="file-mgr-input" type="file" accept="${ALLOWED_FILE_TYPES}" multiple style="display:none;">
    </label>
    <div style="margin-bottom:14px;"></div>
    ${files.length===0 ? `<div class="empty">${esc(emptyMsg||'Sin archivos.')}</div>` :
      files.map(f=>`<div class="file-row">
        <a href="${esc(f.viewUrl || f.url)}" target="_blank" class="file-thumb-link" title="Ver ${esc(f.name)}">
          <img src="${esc(f.url)}" alt="" class="file-thumb" loading="lazy" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
          <span class="file-thumb-fallback">${/\.pdf$/i.test(f.name||'')?'PDF':'ARCH'}</span>
        </a>
        <div class="file-row-info">
          <a href="${esc(f.viewUrl || f.url)}" target="_blank">${esc(f.name)}</a>
          <div class="fr-meta">${esc(f.description||'')} ${f.uploadedAt? '· '+new Date(f.uploadedAt).toLocaleDateString('es-AR') : ''}</div>
        </div>
        <button class="btn btn-ghost btn-sm" onclick="removeFileMeta('${f.id}').then(function(){${refreshFnName||''}})">Quitar</button>
      </div>`).join('')}`;
}
function wireFileManagerEvents({ folderPath, storeKey, onDone }){
  const input = document.getElementById('file-mgr-input');
  if(input){ input.addEventListener('change', ()=> uploadFilesToManager(input, folderPath, storeKey, onDone)); }
}
// Sube una lista de archivos (File[]) a la carpeta indicada y registra su
// metadato en DB.files bajo "storeKey". No redibuja: quien llama decide.
async function uploadFileList(files, folderPath, storeKey){
  if(!files || files.length===0) return;
  toast('Subiendo ' + files.length + ' archivo(s)...');
  let ok = 0;
  for(const file of files){
    try{
      const result = await driveUploadFile({ file, folderPath, description:'' });
      DB.files.push({
        id: result.fileId || uid(), storeKey, category: folderPath[folderPath.length-1],
        name: file.name, url: result.url || '', viewUrl: result.viewUrl || '', description:'',
        uploadedAt: new Date().toISOString(), storedIn:'r2',
      });
      ok++;
    }catch(err){
      toast('Error al subir ' + file.name + ': ' + err.message, true);
    }
  }
  logAudit('UPLOAD','File', `${files.length} archivo(s) en ${folderPath.join('/')}`);
  persist();
  return ok;
}
async function uploadFilesToManager(inputEl, folderPath, storeKey, onDone){
  const files = Array.from(inputEl.files||[]);
  if(files.length===0) return;
  await uploadFileList(files, folderPath, storeKey);
  render();
  if(onDone) onDone();
}
async function removeFileMeta(id){
  const f = DB.files.find(x=>x.id===id);
  if(!f) return;
  if(!confirm(`¿Quitar \"${f.name}\"? Se borra también del servidor y no se puede recuperar.`)) return;
  try{
    await deleteStoredFiles([f]);
  }catch(err){
    toast('No se pudo borrar del servidor: ' + err.message, true);
    return; // el registro se conserva: no se pierde la referencia al archivo
  }
  DB.files = DB.files.filter(x=>x.id!==id);
  logAudit('DELETE','File', f.name);
  persist(); render();
  toast('Archivo borrado');
}
