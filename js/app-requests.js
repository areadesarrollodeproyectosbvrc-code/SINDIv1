/* ============================================================
   PEDIDOS: misma lógica de alta/listado/borrado que "Eventos".
   Cada pedido registra quién lo hizo (Jefatura, un área puntual
   o un nombre libre), por qué medio se realizó, quién lo recibió,
   fecha, descripción y nivel de atención. Se puede adjuntar
   documentación (PDF / JPG) al crear el pedido o después, desde
   "Adjuntos". Los archivos viven en R2 bajo PEDIDOS/<id del pedido>.
   ============================================================ */
const REQUEST_ORIGIN_TYPES = [
  {key:'JEFATURA', label:'Jefatura'},
  {key:'AREA', label:'Un área en particular'},
  {key:'LIBRE', label:'Nombre libre'},
];
const REQUEST_CHANNELS = ['Presencial','Teléfono','WhatsApp','Email','Nota escrita','Otro'];
const REQUEST_LEVELS = ['BAJO','MEDIO','ALTO'];
function requestLevelBadgeClass(lvl){ return lvl==='ALTO' ? 'danger' : lvl==='MEDIO' ? 'warn' : 'ok'; }
function requestOriginLabel(r){
  if(r.originType==='JEFATURA') return 'Jefatura';
  if(r.originType==='AREA') return `Área: ${r.originDetail||'—'}`;
  return r.originDetail || 'Sin especificar';
}

/* ---- Adjuntos de pedidos ---- */
function requestFolderPath(r){ return ['PEDIDOS', r.id]; }
function requestFiles(r){ return DB.files.filter(f=>f.storeKey==='request:'+r.id); }
let requestPendingFiles = []; // archivos elegidos en el modal "Nuevo pedido", todavía sin subir
function requestFileAllowed(file){ return /\.(pdf|jpe?g|png)$/i.test(file.name||''); }
function renderRequestPendingFiles(){
  const box = document.getElementById('m-req-files-list');
  if(!box) return;
  box.innerHTML = requestPendingFiles.map((f,i)=>`
    <div class="file-row" style="padding:6px 0;">
      <div class="file-row-info"><span style="font-size:12.5px;">${esc(f.name)}</span></div>
      <button type="button" class="btn btn-ghost btn-sm" onclick="removeRequestPendingFile(${i})">Quitar</button>
    </div>`).join('');
}
function onRequestFilesPicked(input){
  const picked = Array.from(input.files||[]);
  const rejected = picked.filter(f=>!requestFileAllowed(f));
  picked.filter(requestFileAllowed).forEach(f=>requestPendingFiles.push(f));
  input.value = '';
  if(rejected.length) toast('Solo se pueden adjuntar PDF o JPG: ' + rejected.map(f=>f.name).join(', '));
  renderRequestPendingFiles();
}
function removeRequestPendingFile(i){ requestPendingFiles.splice(i,1); renderRequestPendingFiles(); }

// Ventana para ver / agregar / quitar la documentación de un pedido ya creado.
function openRequestFilesModal(id){
  const r = DB.requests.find(x=>x.id===id);
  if(!r) return;
  modal = { type:'request-files', requestId:id };
  renderModal(`
    <h2>Documentación adjunta</h2>
    <div style="font-size:13px;color:var(--ink-soft);margin-bottom:12px;">${esc(r.description)}</div>
    <div id="req-files-wrap"></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Cerrar</button>
    </div>`);
  refreshRequestFiles(r);
}
function refreshRequestFiles(r){
  const wrap = document.getElementById('req-files-wrap');
  if(!wrap) return;
  const folderPath = requestFolderPath(r);
  const storeKey = 'request:'+r.id;
  wrap.innerHTML = renderFileManager({
    folderPath, storeKey, emptyMsg:'Este pedido todavía no tiene documentación adjunta.',
    refreshFnName:`refreshRequestFilesById('${r.id}')`,
  });
  wireFileManagerEvents({ folderPath, storeKey, onDone: ()=>refreshRequestFiles(r) });
}
function refreshRequestFilesById(id){
  const r = DB.requests.find(x=>x.id===id);
  if(r) refreshRequestFiles(r);
}

function openRequestModal(){
  modal = { type:'request' };
  requestPendingFiles = [];
  renderModal(`
    <h2>Nuevo pedido</h2>
    <div class="row2">
      <label class="field light"><span>Quién lo hizo</span>
        <select id="m-req-origin-type" onchange="document.getElementById('m-req-origin-detail-wrap').style.display = this.value==='JEFATURA' ? 'none':'block';">
          ${REQUEST_ORIGIN_TYPES.map(t=>`<option value="${t.key}">${t.label}</option>`).join('')}
        </select>
      </label>
      <label class="field light"><span>Fecha del pedido</span><input id="m-req-date" type="date" value="${todayISO()}"></label>
    </div>
    <div id="m-req-origin-detail-wrap">
      <label class="field light"><span>Área / Nombre</span><input id="m-req-origin-detail" type="text" placeholder="Ej: Área Logística, o el nombre de la persona"></label>
    </div>
    <div class="row2">
      <label class="field light"><span>Medio por el que se realizó</span>
        <select id="m-req-channel">${REQUEST_CHANNELS.map(c=>`<option value="${c}">${c}</option>`).join('')}</select>
      </label>
      <label class="field light"><span>Quién lo recibió</span>
        <select id="m-req-received-by">
          <option value="">Sin asignar</option>
          ${allUserNames().map(u=>`<option value="${esc(u)}">${esc(u)}</option>`).join('')}
        </select>
      </label>
    </div>
    <label class="field light"><span>Descripción del pedido</span><textarea id="m-req-desc" rows="3"></textarea></label>
    <label class="field light"><span>Nivel de atención</span>
      <select id="m-req-level">
        <option value="BAJO">Bajo</option>
        <option value="MEDIO" selected>Medio</option>
        <option value="ALTO">Alto</option>
      </select>
    </label>
    <div class="field light">
      <span>Documentación adjunta (PDF, JPG) — opcional</span>
      <label class="dropzone" style="display:block;">
        + Agregar archivos
        <input id="m-req-files" type="file" accept="${ALLOWED_FILE_TYPES}" multiple style="display:none;" onchange="onRequestFilesPicked(this)">
      </label>
      <div id="m-req-files-list"></div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="saveRequest()">Crear pedido</button>
    </div>`);
}
async function saveRequest(){
  const originType = document.getElementById('m-req-origin-type').value;
  const originDetail = document.getElementById('m-req-origin-detail').value.trim();
  const channel = document.getElementById('m-req-channel').value;
  const receivedBy = document.getElementById('m-req-received-by').value;
  const date = document.getElementById('m-req-date').value;
  const description = document.getElementById('m-req-desc').value.trim();
  const level = document.getElementById('m-req-level').value;
  if(!date || !description){ toast('Completá al menos fecha y descripción'); return; }
  if(originType!=='JEFATURA' && !originDetail){ toast('Indicá el área o el nombre de quién hizo el pedido'); return; }
  const req = { id: uid(), originType, originDetail, channel, receivedBy, date, description, level, createdAtISO: new Date().toISOString(), projectId: null, resolved:false, resolvedNote:'', resolvedBy:'', resolvedAtISO:null };
  DB.requests.push(req);
  logAudit('CREATE','Request', description.slice(0,60));
  persist();
  const filesToUpload = requestPendingFiles.slice();
  requestPendingFiles = [];
  closeModal(); render();
  if(filesToUpload.length){
    const ok = await uploadFileList(filesToUpload, requestFolderPath(req), 'request:'+req.id);
    render();
    if(ok < filesToUpload.length) toast('Algunos archivos no se pudieron adjuntar. Podés volver a intentarlo desde "Adjuntos".', true);
  }
}
async function deleteRequest(id){
  const r = DB.requests.find(x=>x.id===id);
  if(!r) return;
  const files = requestFiles(r);
  const extra = files.length ? ` Se borran también sus ${files.length} archivo(s) adjunto(s) del servidor.` : '';
  if(!confirm('¿Eliminar este pedido?' + extra)) return;
  try{
    if(files.length) await deleteStoredFiles(files);
  }catch(err){
    toast('No se pudieron borrar los adjuntos del servidor: ' + err.message, true);
    return; // el pedido se conserva: no se pierde la referencia a los archivos
  }
  DB.files = DB.files.filter(f=>!files.includes(f));
  DB.requests = DB.requests.filter(x=>x.id!==id);
  logAudit('DELETE','Request', r.description.slice(0,60));
  persist(); render();
}
function openResolveRequestModal(id){
  const r = DB.requests.find(x=>x.id===id);
  if(!r) return;
  modal = { type:'resolve-request' };
  renderModal(`
    <h2>Marcar pedido como resuelto</h2>
    <div style="font-size:13px;color:var(--ink-soft);margin-bottom:10px;">${esc(r.description)}</div>
    <label class="field light"><span>Descripción breve de la resolución</span><textarea id="m-req-resolve-note" rows="3" placeholder="Ej: Se envió el material solicitado el 12/03"></textarea></label>
    <label class="field light"><span>Resuelto por</span>
      <select id="m-req-resolve-user">
        <option value="">Sin asignar</option>
        ${allUserNames().map(u=>`<option value="${esc(u)}">${esc(u)}</option>`).join('')}
      </select>
    </label>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="resolveRequest('${id}')">Marcar como resuelto</button>
    </div>`);
}
function resolveRequest(id){
  const r = DB.requests.find(x=>x.id===id);
  if(!r) return;
  const note = document.getElementById('m-req-resolve-note').value.trim();
  const user = document.getElementById('m-req-resolve-user').value;
  if(!note){ toast('Agregá una breve descripción de cómo se resolvió'); return; }
  r.resolved = true;
  r.resolvedNote = note;
  r.resolvedBy = user;
  r.resolvedAtISO = new Date().toISOString();
  logAudit('UPDATE','Request', `Resuelto: ${r.description.slice(0,50)}`);
  persist(); closeModal(); render();
}
function reopenRequest(id){
  const r = DB.requests.find(x=>x.id===id);
  if(!r || !confirm('¿Reabrir este pedido? Volverá a aparecer como pendiente en el Inicio.')) return;
  r.resolved = false; r.resolvedNote=''; r.resolvedBy=''; r.resolvedAtISO=null;
  logAudit('UPDATE','Request', `Reabierto: ${r.description.slice(0,50)}`);
  persist(); render();
}
function requestRowHtml(r, withDelete){
  const linkedProject = r.projectId ? DB.projects.find(p=>p.id===r.projectId) : null;
  const attachCount = requestFiles(r).length;
  return `<div style="padding:10px 0;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;gap:10px;">
    <div>
      <span class="badge ${requestLevelBadgeClass(r.level)}">${esc(r.level)}</span>
      ${r.resolved ? `<span class="badge ok" style="margin-left:6px;">Resuelto</span>` : ''}
      <span style="font-size:11.5px;color:var(--ink-soft);margin-left:8px;">${esc(r.date)} · ${esc(requestOriginLabel(r))}${r.channel?' · Medio: '+esc(r.channel):''}${r.receivedBy?' · Recibió: '+esc(r.receivedBy):''}</span>
      <div style="font-size:13px;margin-top:4px;">${esc(r.description)}</div>
      ${r.resolved ? `<div style="font-size:12px;margin-top:4px;color:var(--ok);">Resolución: ${esc(r.resolvedNote||'')}${r.resolvedBy?' · Por: '+esc(r.resolvedBy):''}</div>` : ''}
      <div style="margin-top:6px;">
        ${linkedProject
          ? `<span class="link-tab" onclick="goRoute('projects'); openProjectDetail('${linkedProject.id}')">Proyecto asociado: ${esc(linkedProject.code)} →</span>`
          : `<span class="link-tab" onclick="createProjectFromRequest('${r.id}')">+ Crear proyecto →</span>`}
        <button class="btn btn-ghost btn-sm" style="margin-left:6px;" onclick="openRequestFilesModal('${r.id}')">${attachCount ? `Adjuntos (${attachCount})` : '+ Adjuntar'}</button>
        ${r.resolved
          ? `<button class="btn btn-ghost btn-sm" style="margin-left:6px;" onclick="reopenRequest('${r.id}')">Reabrir</button>`
          : `<button class="btn btn-ghost btn-sm" style="margin-left:6px;color:var(--ok);" onclick="openResolveRequestModal('${r.id}')">Marcar como resuelto</button>`}
      </div>
    </div>
    ${withDelete ? `<button class="btn btn-ghost btn-sm" style="height:fit-content;" onclick="deleteRequest('${r.id}')">Quitar</button>` : ''}
  </div>`;
}
function renderRequests(){
  const list = DB.requests.slice().sort((a,b)=> (b.date+'T'+(b.createdAtISO||'')).localeCompare(a.date+'T'+(a.createdAtISO||'')));
  const pending = list.filter(r=>!r.resolved);
  const resolved = list.filter(r=>r.resolved);
  const html = `
    <div style="margin-bottom:14px;"><button class="btn btn-primary" onclick="openRequestModal()">+ Nuevo pedido</button></div>
    <div class="card">
      ${pending.length===0 ? '<div class="empty">No hay pedidos pendientes.</div>' :
      pending.map(r=>requestRowHtml(r, true)).join('')}
    </div>
    ${resolved.length ? `
    <div class="card" style="margin-top:16px;">
      <h3 style="font-size:13.5px;margin:0 0 4px;color:var(--ink-soft);">Resueltos (${resolved.length})</h3>
      ${resolved.map(r=>requestRowHtml(r, true)).join('')}
    </div>` : ''}`;
  renderShell(html, 'Pedidos', 'Solicitudes recibidas de Jefatura, de un área puntual o de una persona, con su nivel de atención.');
}
