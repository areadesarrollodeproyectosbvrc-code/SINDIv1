/* ============================================================
   PEDIDOS: misma lógica de alta/listado/borrado que "Eventos".
   Cada pedido registra quién lo hizo (Jefatura, un área puntual
   o un nombre libre), por qué medio se realizó, quién lo recibió,
   fecha, descripción y nivel de atención.
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

function openRequestModal(){
  modal = { type:'request' };
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
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="saveRequest()">Crear pedido</button>
    </div>`);
}
function saveRequest(){
  const originType = document.getElementById('m-req-origin-type').value;
  const originDetail = document.getElementById('m-req-origin-detail').value.trim();
  const channel = document.getElementById('m-req-channel').value;
  const receivedBy = document.getElementById('m-req-received-by').value;
  const date = document.getElementById('m-req-date').value;
  const description = document.getElementById('m-req-desc').value.trim();
  const level = document.getElementById('m-req-level').value;
  if(!date || !description){ toast('Completá al menos fecha y descripción'); return; }
  if(originType!=='JEFATURA' && !originDetail){ toast('Indicá el área o el nombre de quién hizo el pedido'); return; }
  DB.requests.push({ id: uid(), originType, originDetail, channel, receivedBy, date, description, level, createdAtISO: new Date().toISOString(), projectId: null });
  logAudit('CREATE','Request', description.slice(0,60));
  persist(); closeModal(); render();
}
function deleteRequest(id){
  const r = DB.requests.find(x=>x.id===id);
  if(!r || !confirm('¿Eliminar este pedido?')) return;
  DB.requests = DB.requests.filter(x=>x.id!==id);
  logAudit('DELETE','Request', r.description.slice(0,60));
  persist(); render();
}
function requestRowHtml(r, withDelete){
  const linkedProject = r.projectId ? DB.projects.find(p=>p.id===r.projectId) : null;
  return `<div style="padding:10px 0;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;gap:10px;">
    <div>
      <span class="badge ${requestLevelBadgeClass(r.level)}">${esc(r.level)}</span>
      <span style="font-size:11.5px;color:var(--ink-soft);margin-left:8px;">${esc(r.date)} · ${esc(requestOriginLabel(r))}${r.channel?' · Medio: '+esc(r.channel):''}${r.receivedBy?' · Recibió: '+esc(r.receivedBy):''}</span>
      <div style="font-size:13px;margin-top:4px;">${esc(r.description)}</div>
      <div style="margin-top:6px;">
        ${linkedProject
          ? `<span class="link-tab" onclick="goRoute('projects'); openProjectDetail('${linkedProject.id}')">Proyecto asociado: ${esc(linkedProject.code)} →</span>`
          : `<span class="link-tab" onclick="createProjectFromRequest('${r.id}')">+ Crear proyecto →</span>`}
      </div>
    </div>
    ${withDelete ? `<button class="btn btn-ghost btn-sm" style="height:fit-content;" onclick="deleteRequest('${r.id}')">Quitar</button>` : ''}
  </div>`;
}
function renderRequests(){
  const list = DB.requests.slice().sort((a,b)=> (b.date+'T'+(b.createdAtISO||'')).localeCompare(a.date+'T'+(a.createdAtISO||'')));
  const html = `
    <div style="margin-bottom:14px;"><button class="btn btn-primary" onclick="openRequestModal()">+ Nuevo pedido</button></div>
    <div class="card">
      ${list.length===0 ? '<div class="empty">Todavía no hay pedidos cargados.</div>' :
      list.map(r=>requestRowHtml(r, true)).join('')}
    </div>`;
  renderShell(html, 'Pedidos', 'Solicitudes recibidas de Jefatura, de un área puntual o de una persona, con su nivel de atención.');
}
