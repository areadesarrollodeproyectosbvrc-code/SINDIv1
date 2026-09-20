/* ============================================================
   NECESIDADES, PROYECTOS (sin presupuesto como campo principal),
   y EVENTOS.
   ============================================================ */

/* ---- NECESIDADES ---- */
const NEED_STATUSES = ['PENDIENTE','EN_ANALISIS','EN_PROCESO','SOLUCIONADO','CONVERTIDO_EN_PROYECTO'];
// Categorías precargadas de necesidades (no es carga libre).
const NEED_CATEGORIES = [
  'Ingeniería','Arquitectura','Plomería','Electricidad','Seguridad e Higiene',
  'Albañilería','Climatización','Mecánica','Carpintería','Pintura',
  'Cubiertas y techos','Instalación de gas','Red de datos','CCTV y seguridad',
  'Equipamiento','Otros',
];
function needStatusLabel(st){
  return { PENDIENTE:'Pendiente', EN_ANALISIS:'En análisis', EN_PROCESO:'En proceso', SOLUCIONADO:'Solucionado', CONVERTIDO_EN_PROYECTO:'Convertido en proyecto' }[st] || st;
}

function openNeedModal(spaceId, needId){
  modal = { type:'need' };
  const editing = needId ? DB.needs.find(x=>x.id===needId) : null;
  const effectiveSpaceId = editing ? editing.spaceId : spaceId;
  const fixedSpace = effectiveSpaceId ? DB.spaces.find(x=>x.id===effectiveSpaceId) : null;
  const fixedStation = fixedSpace ? DB.stations.find(x=>x.id===fixedSpace.stationId)
    : (editing ? DB.stations.find(x=>x.id===editing.stationId) : null);
  const showFixed = !!fixedSpace || !!editing;
  renderModal(`
    <h2>${editing ? 'Editar necesidad' : 'Nueva necesidad'}</h2>
    ${showFixed ? `
      <div class="field light"><span>Dependencia</span><div style="padding:9px 0;font-size:13.5px;">${esc(fixedStation?.name||'—')}</div></div>
      <div class="field light"><span>Espacio</span><div style="padding:9px 0;font-size:13.5px;">${esc(fixedSpace ? fixedSpace.name : 'Necesidad general del dependencia')}</div></div>
    ` : `
      <div class="row2">
        <label class="field light"><span>Dependencia</span>
          <select id="m-need-station" onchange="refreshNeedSpaceOptions()">
            <option value="">Seleccioná un dependencia</option>
            ${DB.stations.map(st=>`<option value="${st.id}">${esc(st.name)}</option>`).join('')}
          </select>
        </label>
        <label class="field light"><span>Espacio (opcional)</span>
          <select id="m-need-space"><option value="">Necesidad general del dependencia</option></select>
        </label>
      </div>
    `}
    <label class="field light"><span>Título</span><input id="m-need-title" type="text" placeholder="Ej: Filtraciones en cubierta del vestuario" value="${esc(editing?.title||'')}"></label>
    <label class="field light"><span>Descripción</span><textarea id="m-need-desc" rows="3">${esc(editing?.description||'')}</textarea></label>
    <div class="row2">
      <label class="field light"><span>Prioridad</span>
        <select id="m-need-priority">
          <option value="BAJA" ${editing?.priority==='BAJA'?'selected':''}>Baja</option>
          <option value="MEDIA" ${editing?.priority==='MEDIA'?'selected':''}>Media</option>
          <option value="ALTA" ${editing?.priority==='ALTA'?'selected':''}>Alta</option>
        </select>
      </label>
      <label class="field light"><span>Categoría</span>
        <select id="m-need-cat">
          <option value="" ${!editing?.category?'selected':''}>Sin categorizar</option>
          ${NEED_CATEGORIES.map(c=>`<option value="${esc(c)}" ${editing?.category===c?'selected':''}>${esc(c)}</option>`).join('')}
        </select>
      </label>
    </div>
    <label class="field light"><span>Responsable (opcional)</span><input id="m-need-resp" type="text" value="${esc(editing?.responsible||'')}"></label>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="saveNeed('${spaceId||''}','${needId||''}')">${editing?'Guardar':'Agregar'}</button>
    </div>`);
}
function refreshNeedSpaceOptions(){
  const stationSel = document.getElementById('m-need-station');
  const spaceSel = document.getElementById('m-need-space');
  if(!stationSel || !spaceSel) return;
  const stationId = stationSel.value;
  const options = DB.spaces.filter(s=>s.stationId===stationId);
  spaceSel.innerHTML = `<option value="">Necesidad general del dependencia</option>${options.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('')}`;
}
function saveNeed(spaceId, needId){
  const title = document.getElementById('m-need-title').value.trim();
  const description = document.getElementById('m-need-desc').value.trim();
  const priority = document.getElementById('m-need-priority').value;
  const category = document.getElementById('m-need-cat').value.trim();
  const responsible = document.getElementById('m-need-resp').value.trim();
  if(!title || !description){ toast('Completá título y descripción'); return; }

  if(needId){
    const n = DB.needs.find(x=>x.id===needId);
    if(!n) return;
    n.title = title; n.description = description; n.priority = priority;
    n.category = category; n.responsible = responsible;
    logAudit('UPDATE','Need', `${n.code} — ${title}`);
    persist(); closeModal(); render();
    return;
  }

  let finalSpaceId = spaceId || null;
  let stationId = null;
  if(finalSpaceId){
    const sp = DB.spaces.find(x=>x.id===finalSpaceId);
    stationId = sp ? sp.stationId : null;
  } else {
    const stationSel = document.getElementById('m-need-station');
    const spaceSel = document.getElementById('m-need-space');
    stationId = stationSel ? stationSel.value : null;
    finalSpaceId = spaceSel && spaceSel.value ? spaceSel.value : null;
    if(!stationId){ toast('Seleccioná el dependencia al que pertenece la necesidad'); return; }
  }

  const now = new Date();
  const need = {
    id: uid(), code: nextCode('NEC','need'), spaceId: finalSpaceId, stationId,
    title, description, priority, category, responsible,
    status: 'PENDIENTE',
    createdAt: now.toISOString().slice(0,10),
    createdAtTime: now.toTimeString().slice(0,5),
    createdAtISO: now.toISOString(),
    projectId: null,
  };
  DB.needs.push(need);
  logAudit('CREATE','Need', `${need.code} — ${title}`);
  persist(); closeModal(); render();
}
function deleteNeed(id){
  const n = DB.needs.find(x=>x.id===id);
  if(!n) return;
  const linkedProject = n.projectId ? DB.projects.find(p=>p.id===n.projectId) : null;
  const note = linkedProject ? ` El proyecto ${linkedProject.code} asociado no se borra, pero quedará sin esta necesidad de origen.` : '';
  if(!confirm(`¿Eliminar la necesidad "${n.code} — ${n.title||n.description}"? Esta acción no se puede deshacer.${note}`)) return;
  if(linkedProject){ linkedProject.needId = null; linkedProject.needCode = null; }
  DB.needs = DB.needs.filter(x=>x.id!==id);
  logAudit('DELETE','Need', `${n.code} — ${n.title||n.description}`);
  persist(); render();
  toast('Necesidad eliminada');
}
function setNeedStatus(id, status){
  const n = DB.needs.find(x=>x.id===id);
  const before = n.status;
  n.status = status;
  logAudit('STATUS_CHANGE','Need', `${n.code}: ${needStatusLabel(before)} → ${needStatusLabel(status)}`);
  persist(); render(); toast('Estado actualizado');
}
function convertNeedToProject(needId){
  const need = DB.needs.find(n=>n.id===needId);
  if(!need) return;
  const code = nextCode('PR','project');
  const now = new Date();
  const project = {
    id: uid(), code, name: need.title || need.description.slice(0,60),
    description: need.description, status:'BORRADOR', priority: need.priority,
    createdAt: todayISO(), createdAtTime: now.toTimeString().slice(0,5), createdAtISO: now.toISOString(),
    dueDate:'', responsible: allUserNames().includes(need.responsible) ? need.responsible : '',
    stationId: need.stationId || null,
    needId: need.id, needCode: need.code, progress:0, observations:'',
    investment: 0,
  };
  DB.projects.push(project);
  need.status = 'CONVERTIDO_EN_PROYECTO';
  need.projectId = project.id;
  logAudit('STATUS_CHANGE','Need', `${need.code} → proyecto ${code}`);
  persist();
  render();
  toast(`Proyecto ${code} creado`);
}

// ---- PEDIDO → PROYECTO ----
// Mismo flujo que convertNeedToProject (mismo código de proyecto, misma
// creación de carpeta de Drive): la única diferencia es el origen del dato
// precargado (un Pedido en vez de una Necesidad) y el campo de trazabilidad
// que se guarda (sourceRequestId en vez de needId).
function createProjectFromRequest(requestId){
  const request = DB.requests.find(r=>r.id===requestId);
  if(!request) return;
  if(request.projectId){ toast('Este pedido ya tiene un proyecto asociado'); return; }
  const code = nextCode('PR','project');
  const now = new Date();
  const project = {
    id: uid(), code, name: request.description.slice(0,60),
    description: request.description, status:'BORRADOR', priority: requestLevelToPriority(request.level),
    createdAt: todayISO(), createdAtTime: now.toTimeString().slice(0,5), createdAtISO: now.toISOString(),
    dueDate:'', responsible: allUserNames().includes(request.receivedBy) ? request.receivedBy : '',
    stationId: null,
    needId: null, needCode: null,
    sourceRequestId: request.id,
    progress:0, observations:'',
    investment: 0,
  };
  DB.projects.push(project);
  request.projectId = project.id;
  logAudit('CREATE','Project', `${code} (desde pedido) — ${project.name}`);
  persist();
  goRoute('projects'); openProjectDetail(project.id);
  toast(`Proyecto ${code} creado a partir del pedido`);
}
function requestLevelToPriority(level){
  return level==='ALTO' ? 'ALTA' : level==='BAJO' ? 'BAJA' : 'MEDIA';
}
function requestForProject(p){
  return p.sourceRequestId ? DB.requests.find(r=>r.id===p.sourceRequestId) : null;
}

function renderNeeds(){
  const filterStatus = renderNeeds._filterStatus || '';
  const filterPriority = renderNeeds._filterPriority || '';
  const filterCategory = renderNeeds._filterCategory || '';
  let list = DB.needs.slice().sort((a,b)=> (b.createdAtISO||'').localeCompare(a.createdAtISO||''));
  if(filterStatus) list = list.filter(n=>n.status===filterStatus);
  if(filterPriority) list = list.filter(n=>n.priority===filterPriority);
  if(filterCategory) list = list.filter(n=> filterCategory==='__SIN__' ? !n.category : n.category===filterCategory);

  function needRow(n){
    const space = DB.spaces.find(s=>s.id===n.spaceId);
    return `<tr>
      <td class="mono">${esc(n.code)}</td>
      <td>${esc(n.title||n.description)}</td>
      <td>${esc(space?.name||'General del dependencia')}</td>
      <td>${n.category ? esc(n.category) : '<span class="badge warn">Sin categoría</span>'}</td>
      <td><span class="badge ${n.priority==='ALTA'?'danger':n.priority==='MEDIA'?'warn':'ok'}">${esc(n.priority)}</span></td>
      <td>
        <select onchange="setNeedStatus('${n.id}', this.value)" ${n.status==='CONVERTIDO_EN_PROYECTO'?'disabled':''}>
          ${NEED_STATUSES.map(st=>`<option value="${st}" ${st===n.status?'selected':''}>${needStatusLabel(st)}</option>`).join('')}
        </select>
      </td>
      <td>${n.createdAt||''} ${n.createdAtTime||''}</td>
      <td style="white-space:nowrap;">
        ${n.status!=='CONVERTIDO_EN_PROYECTO' ? `<span class="link-tab" onclick="convertNeedToProject('${n.id}')">Convertir en proyecto</span>` : `<span class="link-tab" onclick="goRoute('projects'); openProjectDetail('${n.projectId}')">Ver proyecto</span>`}
        <button class="btn btn-ghost btn-sm" style="margin-left:6px;" onclick="openNeedModal(null, '${n.id}')">Editar</button>
        <button class="btn btn-ghost btn-sm" style="color:var(--danger);" onclick="deleteNeed('${n.id}')">Eliminar</button>
      </td>
    </tr>`;
  }
  function stationGroupTable(label, items){
    return `<div class="card station-group" style="margin-bottom:16px;">
      <div class="station-group-head"><h3 style="font-size:13.5px;margin:0;">${esc(label)}</h3></div>
      ${items.length===0 ? '<div class="empty">Sin necesidades para mostrar.</div>' :
      `<table><thead><tr><th>Código</th><th>Título</th><th>Espacio</th><th>Categoría</th><th>Prioridad</th><th>Estado</th><th>Creación</th><th></th></tr></thead><tbody>${items.map(needRow).join('')}</tbody></table>`}
    </div>`;
  }
  const groups = DB.stations.map(st=>({ label: st.name, items: list.filter(n=>n.stationId===st.id) }));
  const orphanItems = list.filter(n=> !DB.stations.some(st=>st.id===n.stationId));

  const html = `
    <div class="toolbar">
      <div class="toolbar-left">
        <button class="btn btn-primary" onclick="openNeedModal(null)">+ Nueva necesidad</button>
        <select class="filter-select" onchange="renderNeeds._filterStatus=this.value; render();">
          <option value="">Todos los estados</option>
          ${NEED_STATUSES.map(st=>`<option value="${st}" ${filterStatus===st?'selected':''}>${needStatusLabel(st)}</option>`).join('')}
        </select>
        <select class="filter-select" onchange="renderNeeds._filterPriority=this.value; render();">
          <option value="">Toda prioridad</option>
          <option value="ALTA" ${filterPriority==='ALTA'?'selected':''}>Alta</option>
          <option value="MEDIA" ${filterPriority==='MEDIA'?'selected':''}>Media</option>
          <option value="BAJA" ${filterPriority==='BAJA'?'selected':''}>Baja</option>
        </select>
        <select class="filter-select" onchange="renderNeeds._filterCategory=this.value; render();">
          <option value="">Todas las categorías</option>
          <option value="__SIN__" ${filterCategory==='__SIN__'?'selected':''}>Sin categorizar</option>
          ${NEED_CATEGORIES.map(c=>`<option value="${esc(c)}" ${filterCategory===c?'selected':''}>${esc(c)}</option>`).join('')}
        </select>
      </div>
      <div class="toolbar-right">
        <button class="btn btn-ghost" onclick='exportNeedsExcel(${JSON.stringify(list.map(n=>n.id))})'>Exportar a Excel</button>
        <button class="btn btn-ghost" onclick='printNeeds(${JSON.stringify(list.map(n=>n.id))})'>Imprimir / PDF</button>
      </div>
    </div>
    ${list.length===0 ? '<div class="card"><div class="empty">No hay necesidades para mostrar.</div></div>' : `
      ${groups.map(g=>stationGroupTable(g.label, g.items)).join('')}
      ${orphanItems.length>0 ? stationGroupTable('Sin dependencia asignado', orphanItems) : ''}
    `}
    <div id="print-needs" class="print-area" style="display:none;"></div>`;
  renderShell(html, 'Necesidades', 'Se pueden cargar de forma general o desde la ficha de cada espacio. Agrupadas por dependencia.');
}

/* ---- PROYECTOS ---- */
const PROJECT_STATUSES = ['BORRADOR','EN_DESARROLLO','EN_EVALUACION','OBSERVADO','APROBADO','EN_EJECUCION','FINALIZADO','CANCELADO'];
// Un color fijo por estado, reutilizado en el gráfico del Panel Principal.
const PROJECT_STATUS_COLORS = {
  BORRADOR:'#9aa0a6', EN_DESARROLLO:'#4f7fc0', EN_EVALUACION:'#8a63d2',
  OBSERVADO:'#b98a2e', APROBADO:'#3f7d4a', EN_EJECUCION:'#a31f1f',
  FINALIZADO:'#2f6f6f', CANCELADO:'#b23a2e',
};

// Estados que se muestran en la sección Proyectos (activos). FINALIZADO se
// guarda en Completados y no aparece acá ni como opción de filtro.
const ACTIVE_PROJECT_STATUSES = PROJECT_STATUSES.filter(st=>st!=='FINALIZADO');

function renderProjects(){
  if(projectDetailState.projectId) return renderProjectDetail();
  const filterStatus = renderProjects._filterStatus || '';
  const orderBy = renderProjects._orderBy || 'DEPENDENCIA';
  let list = DB.projects.filter(p=>p.status!=='FINALIZADO').slice().sort((a,b)=> (b.createdAt||'').localeCompare(a.createdAt||''));
  if(filterStatus) list = list.filter(p=>p.status===filterStatus);

  function projectRow(p, withStation){
    return `<tr class="tap">
      <td class="mono" onclick="openProjectDetail('${p.id}')">${esc(p.code)}</td>
      <td onclick="openProjectDetail('${p.id}')">${esc(p.name)}</td>
      ${withStation ? `<td onclick="openProjectDetail('${p.id}')">${esc(stationNameById(p.stationId))}</td>` : ''}
      <td onclick="openProjectDetail('${p.id}')">${esc(projectSpaceName(p))}</td>
      <td>
        <select onclick="event.stopPropagation()" onchange="changeProjectStatusFromList('${p.id}', this.value)">
          ${PROJECT_STATUSES.map(st=>`<option value="${st}" ${st===p.status?'selected':''}>${st}</option>`).join('')}
        </select>
      </td>
      <td onclick="openProjectDetail('${p.id}')"><span class="badge ${p.priority==='ALTA'?'danger':p.priority==='MEDIA'?'warn':'ok'}">${esc(p.priority||'—')}</span></td>
      <td onclick="openProjectDetail('${p.id}')">${p.progress||0}%</td>
      <td onclick="openProjectDetail('${p.id}')">${esc(p.dueDate||'—')}</td>
      <td onclick="openProjectDetail('${p.id}')">${esc(p.responsible||'—')}</td>
      <td onclick="openProjectDetail('${p.id}')" class="mono">${formatInvestment(p.investment)}</td>
    </tr>`;
  }
  function stationGroupTable(label, items){
    return `<div class="card station-group" style="margin-bottom:16px;">
      <div class="station-group-head"><h3 style="font-size:13.5px;margin:0;">${esc(label)}</h3></div>
      ${items.length===0 ? '<div class="empty">Sin proyectos para mostrar.</div>' :
      `<table><thead><tr><th>Código</th><th>Nombre</th><th>Espacio relevado</th><th>Estado</th><th>Prioridad</th><th>Avance</th><th>Fecha prevista</th><th>Responsable</th><th>Inversión</th></tr></thead><tbody>${items.map(p=>projectRow(p,false)).join('')}</tbody></table>`}
    </div>`;
  }
  function flatTable(items){
    return `<div class="card">
      ${items.length===0 ? '<div class="empty">No hay proyectos para mostrar.</div>' :
      `<table><thead><tr><th>Código</th><th>Nombre</th><th>Dependencia</th><th>Espacio relevado</th><th>Estado</th><th>Prioridad</th><th>Avance</th><th>Fecha prevista</th><th>Responsable</th><th>Inversión</th></tr></thead><tbody>${items.map(p=>projectRow(p,true)).join('')}</tbody></table>`}
    </div>`;
  }

  let bodyHtml;
  if(orderBy==='PRIORIDAD' || orderBy==='AVANCE'){
    const sorted = list.slice();
    if(orderBy==='PRIORIDAD'){
      const rank = {ALTA:0, MEDIA:1, BAJA:2};
      sorted.sort((a,b)=> (rank[a.priority]??3) - (rank[b.priority]??3));
    } else {
      sorted.sort((a,b)=> (b.progress||0) - (a.progress||0));
    }
    bodyHtml = flatTable(sorted);
  } else {
    const groups = DB.stations.map(st=>({ label: st.name, items: list.filter(p=>p.stationId===st.id) }));
    const orphanItems = list.filter(p=> !DB.stations.some(st=>st.id===p.stationId));
    bodyHtml = list.length===0 ? '<div class="card"><div class="empty">Todavía no hay proyectos. Se crean convirtiendo una necesidad o un pedido.</div></div>' : `
      ${groups.map(g=>stationGroupTable(g.label, g.items)).join('')}
      ${orphanItems.length>0 ? stationGroupTable('Sin dependencia asignado', orphanItems) : ''}
    `;
  }

  const html = `
    <div class="toolbar">
      <div class="toolbar-left">
        <select class="filter-select" onchange="renderProjects._filterStatus=this.value; render();">
          <option value="">Todos los estados</option>
          ${ACTIVE_PROJECT_STATUSES.map(st=>`<option value="${st}" ${filterStatus===st?'selected':''}>${st}</option>`).join('')}
        </select>
        <select class="filter-select" onchange="renderProjects._orderBy=this.value; render();">
          <option value="DEPENDENCIA" ${orderBy==='DEPENDENCIA'?'selected':''}>Ordenar por Dependencia</option>
          <option value="PRIORIDAD" ${orderBy==='PRIORIDAD'?'selected':''}>Ordenar por Prioridad</option>
          <option value="AVANCE" ${orderBy==='AVANCE'?'selected':''}>Ordenar por Avance</option>
        </select>
      </div>
      <div class="toolbar-right">
        <button class="btn btn-ghost" onclick='exportProjectsExcel(${JSON.stringify(list.map(p=>p.id))})'>Exportar a Excel</button>
        <button class="btn btn-ghost" onclick='printProjects(${JSON.stringify(list.map(p=>p.id))})'>Imprimir / PDF (listado)</button>
      </div>
    </div>
    ${bodyHtml}
    <div id="print-projects" class="print-area" style="display:none;"></div>`;
  renderShell(html, 'Proyectos', 'Se originan a partir de una necesidad o un pedido convertido. El código se asigna automáticamente.');
}

// Proyectos con estado FINALIZADO: misma ficha y misma lógica que Proyectos,
// pero en su propia sección (solo lectura salvo por el botón "Editar", que
// abre la misma ficha real del proyecto).
function renderCompletedProjects(){
  if(projectDetailState.projectId) return renderProjectDetail();
  const list = DB.projects.filter(p=>p.status==='FINALIZADO').slice().sort((a,b)=> (b.createdAt||'').localeCompare(a.createdAt||''));

  function completedRow(p){
    return `<tr class="tap">
      <td class="mono" onclick="openProjectDetail('${p.id}')">${esc(p.code)}</td>
      <td onclick="openProjectDetail('${p.id}')">${esc(p.name)}</td>
      <td onclick="openProjectDetail('${p.id}')">${esc(stationNameById(p.stationId))}</td>
      <td onclick="openProjectDetail('${p.id}')">${esc(projectSpaceName(p))}</td>
      <td onclick="openProjectDetail('${p.id}')"><span class="badge ${p.priority==='ALTA'?'danger':p.priority==='MEDIA'?'warn':'ok'}">${esc(p.priority||'—')}</span></td>
      <td onclick="openProjectDetail('${p.id}')">${p.progress||0}%</td>
      <td onclick="openProjectDetail('${p.id}')">${esc(p.dueDate||'—')}</td>
      <td onclick="openProjectDetail('${p.id}')">${esc(p.responsible||'—')}</td>
      <td onclick="openProjectDetail('${p.id}')" class="mono">${formatInvestment(p.investment)}</td>
      <td><button class="btn btn-ghost btn-sm" onclick="openProjectDetail('${p.id}')">Editar</button></td>
    </tr>`;
  }

  const html = `
    <div class="toolbar">
      <div class="toolbar-left">
        <span style="font-size:12px;color:var(--ink-soft);">${list.length} proyecto${list.length===1?'':'s'} finalizado${list.length===1?'':'s'}</span>
      </div>
      <div class="toolbar-right">
        <button class="btn btn-ghost" onclick='exportProjectsExcel(${JSON.stringify(list.map(p=>p.id))})'>Exportar a Excel</button>
        <button class="btn btn-ghost" onclick='printProjects(${JSON.stringify(list.map(p=>p.id))})'>Imprimir / PDF (listado)</button>
      </div>
    </div>
    <div class="card">
      ${list.length===0 ? '<div class="empty">Todavía no hay proyectos finalizados.</div>' :
      `<table><thead><tr><th>Código</th><th>Nombre</th><th>Dependencia</th><th>Espacio relevado</th><th>Prioridad</th><th>Avance</th><th>Fecha prevista</th><th>Responsable</th><th>Inversión</th><th></th></tr></thead><tbody>${list.map(completedRow).join('')}</tbody></table>`}
    </div>
    <div id="print-projects" class="print-area" style="display:none;"></div>`;
  renderShell(html, 'Proyectos completados', 'Proyectos marcados como Finalizado. Conservan la misma ficha, sus tareas, hitos y el enlace a su carpeta de Drive — usá "Editar" para abrirla.');
}

function changeProjectStatusFromList(id, status){
  const p = DB.projects.find(x=>x.id===id);
  const before = p.status;
  p.status = status;
  logAudit('STATUS_CHANGE','Project', `${p.code}: ${before} → ${status}`);
  persist();
  toast(status==='FINALIZADO' ? `${p.code} pasó a Completados` : 'Estado actualizado');
  render();
}
function openProjectDetail(id){ projectDetailState = { projectId: id, returnRoute: route, editingDriveLink:false }; render(); }
function saveDriveLink(projectId){
  const p = DB.projects.find(x=>x.id===projectId);
  const input = document.getElementById('drive-link-input');
  if(!p || !input) return;
  p.driveLink = input.value.trim();
  logAudit('UPDATE','Project', p.code + ' (link de Drive)');
  persist();
  projectDetailState.editingDriveLink = false;
  render();
}

// Categorías de archivo dentro de la carpeta de Drive de cada proyecto.
// Reemplaza la estructura anterior (Documentacion/Planos/Fotografias/Presupuestos/Otros).
const PROJECT_FILE_CATEGORIES = [
  {key:'PLANOS', label:'Planos'},
  {key:'ARCHIVOS', label:'Archivos'},
  {key:'PRESUPUESTOS', label:'Presupuestos'},
];
function renderProjectDetail(){
  const p = DB.projects.find(x=>x.id===projectDetailState.projectId);
  if(!p){ projectDetailState.projectId=null; return renderProjects(); }
  const activeCat = projectDetailState.fileCat || 'PLANOS';
  const folderPath = ['PROYECTOS', projectFolderSegment(p), activeCat];
  const projectTasks = DB.tasks.filter(t=>t.projectId===p.id).sort((a,b)=>(a.date||'').localeCompare(b.date||''));
  const doneCount = projectTasks.filter(t=>t.status==='COMPLETADA').length;

  const html = `
    <div class="link-tab" style="margin-bottom:10px;" onclick="projectDetailState.projectId=null; render();">&larr; ${route==='completed-projects' ? 'Volver a Completados' : 'Todos los proyectos'}</div>
    <div class="card" style="margin-bottom:16px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;">
        <div>
          <span class="mono" style="font-size:12px;background:#eeece5;padding:2px 8px;border-radius:6px;">${esc(p.code)}</span>
          ${p.needCode? `<span style="font-size:11px;color:var(--ink-soft);margin-left:8px;">Origen: ${esc(p.needCode)}</span>`:''}
          ${p.sourceRequestId? (()=>{ const req = requestForProject(p); return req ? `<span class="link-tab" style="margin-left:8px;" onclick="goRoute('requests')">Pedido de origen: ${esc(req.date)} — ${esc(req.description.slice(0,40))}${req.description.length>40?'…':''} →</span>` : ''; })() : ''}
          <span style="font-size:11px;color:var(--ink-soft);margin-left:8px;">Espacio relevado: ${esc(projectSpaceName(p))}</span>
          <span style="font-size:11px;color:var(--ink-soft);margin-left:8px;">Creado: ${esc(p.createdAt||'—')} ${esc(p.createdAtTime||'')}</span>
          <div style="font-size:16px;font-weight:700;margin-top:6px;">${esc(p.name)}</div>
        </div>
        <div style="display:flex; gap:6px; flex-shrink:0;">
          <button class="btn btn-ghost btn-sm" onclick="printProject('${p.id}')">Generar informe PDF</button>
          <button class="btn btn-ghost btn-sm" style="color:var(--danger);" onclick="deleteProject('${p.id}')">Eliminar proyecto</button>
        </div>
      </div>
    </div>
    <div class="card" style="margin-bottom:16px;">
      <span style="font-size:12px;color:var(--ink-soft);display:block;margin-bottom:6px;">Link de la carpeta de Drive del proyecto</span>
      ${p.driveLink && !projectDetailState.editingDriveLink ? `
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <a href="${esc(p.driveLink)}" target="_blank" rel="noopener" class="btn btn-ghost btn-sm" style="display:inline-flex;align-items:center;gap:6px;">📁 Abrir carpeta de Drive del proyecto →</a>
          <button class="btn btn-ghost btn-sm" onclick="projectDetailState.editingDriveLink=true; render();">Editar link</button>
        </div>` : `
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <input id="drive-link-input" type="url" style="flex:1;min-width:220px;" placeholder="Pegá acá el link de la carpeta de Drive" value="${esc(p.driveLink||'')}">
          <button class="btn btn-primary btn-sm" onclick="saveDriveLink('${p.id}')">Guardar</button>
          ${p.driveLink ? `<button class="btn btn-ghost btn-sm" onclick="projectDetailState.editingDriveLink=false; render();">Cancelar</button>` : ''}
        </div>`}
    </div>
    <div class="card" style="margin-bottom:16px;">
      <div class="row2">
        <label class="field light"><span>Nombre</span><input data-pf="name" type="text" value="${esc(p.name)}"></label>
        <label class="field light"><span>Estado</span>
          <select data-pf="status">${PROJECT_STATUSES.map(st=>`<option value="${st}" ${st===p.status?'selected':''}>${st}</option>`).join('')}</select>
        </label>
      </div>
      <div class="row3">
        <label class="field light"><span>Prioridad</span>
          <select data-pf="priority"><option value="BAJA" ${p.priority==='BAJA'?'selected':''}>Baja</option><option value="MEDIA" ${p.priority==='MEDIA'?'selected':''}>Media</option><option value="ALTA" ${p.priority==='ALTA'?'selected':''}>Alta</option></select>
        </label>
        <label class="field light"><span>Fecha prevista</span><input data-pf="dueDate" type="date" value="${esc(p.dueDate||'')}"></label>
        <label class="field light"><span>Avance (%)</span><input data-pf="progress" type="number" value="${p.progress||0}"></label>
      </div>
      <div class="row3">
        <label class="field light"><span>Dependencia</span>
          <select data-pf="stationId">
            <option value="">Sin dependencia asignado</option>
            ${DB.stations.map(st=>`<option value="${st.id}" ${st.id===p.stationId?'selected':''}>${esc(st.name)}</option>`).join('')}
          </select>
        </label>
        <label class="field light"><span>Responsable</span>
          <select data-pf="responsible">
            <option value="">Sin asignar</option>
            ${allUserNames().map(u=>`<option value="${esc(u)}" ${u===p.responsible?'selected':''}>${esc(u)}</option>`).join('')}
          </select>
        </label>
        <label class="field light"><span>Inversión (millones $)</span><input data-pf="investment" type="number" step="0.01" min="0" value="${p.investment||0}"></label>
      </div>
      <label class="field light"><span>Descripción</span><textarea data-pf="description" rows="3">${esc(p.description||'')}</textarea></label>
      <label class="field light"><span>Observaciones</span><textarea data-pf="observations" rows="2">${esc(p.observations||'')}</textarea></label>
      <div style="font-size:11px;color:var(--ink-soft);">Inversión cargada: <strong>${formatInvestment(p.investment)}</strong>. Disponible para paneles y estadísticas.</div>
    </div>
    ${milestonesSectionHtml(p)}
    ${materialsSectionHtml(p)}
    ${purchasesSectionHtml(p)}
    <div class="card" style="margin-bottom:16px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <h3 style="font-size:13.5px;margin:0;">Tareas del proyecto ${projectTasks.length ? `<span style="font-weight:400;color:var(--ink-soft);font-size:12px;">(${doneCount}/${projectTasks.length} completadas)</span>` : ''}</h3>
        <button class="btn btn-ghost btn-sm" onclick="openTaskModal(null, '${p.id}')">+ Agregar tarea</button>
      </div>
      ${projectTasks.length===0 ? '<div class="empty">Sin tareas cargadas para este proyecto todavía.</div>' :
        projectTasks.map(t=>`<div style="display:flex;justify-content:space-between;gap:10px;padding:8px 0;border-bottom:1px solid var(--line);">
          <div>
            <select onchange="toggleTaskStatus('${t.id}', this.value)">
              ${TASK_STATUSES.map(st=>`<option value="${st}" ${st===t.status?'selected':''}>${taskStatusLabel(st)}</option>`).join('')}
            </select>
            <span style="font-size:12.5px;margin-left:8px;font-weight:600;">${esc(t.description)}</span>
            <div style="font-size:11px;color:var(--ink-soft);margin-top:3px;">${esc(t.date||'Sin fecha')} · ${esc(t.responsible||'Sin responsable')}${taskNeedLabel(t)?' · Necesidad: '+esc(taskNeedLabel(t)):''}</div>
          </div>
          <button class="btn btn-ghost btn-sm" style="height:fit-content;" onclick="openTaskModal('${t.id}')">Editar</button>
        </div>`).join('')}
    </div>
    <div class="card">
      <h3 style="font-size:13.5px;margin:0 0 10px;">Archivos del proyecto</h3>
      <div class="file-cat-tabs">
        ${PROJECT_FILE_CATEGORIES.map(c=>`<div class="detail-tab ${activeCat===c.key?'active':''}" onclick="projectDetailState.fileCat='${c.key}'; render();">${c.label}</div>`).join('')}
      </div>
      ${renderFileManager({ folderPath, storeKey: 'project:'+p.id+':'+activeCat, emptyMsg: 'Sin archivos cargados en esta categoría todavía.' })}
    </div>
    <div id="print-project" class="print-area" style="display:none;"></div>
    <div id="print-purchase" class="print-area" style="display:none;"></div>`;
  renderShell(html, 'Ficha de proyecto', '');
  document.querySelectorAll('[data-pf]').forEach(inp=>{
    inp.addEventListener('change', ()=>{
      const f = inp.dataset.pf;
      p[f] = (f==='progress') ? (parseInt(inp.value)||0) : (f==='investment' ? (parseFloat(inp.value)||0) : inp.value);
      logAudit('UPDATE','Project', p.code);
      persist();
      if(f==='investment') render(); // refresca el "$X millones" formateado
    });
  });
  wireFileManagerEvents({ folderPath, storeKey: 'project:'+p.id+':'+activeCat });
}

async function deleteProject(id){
  const p = DB.projects.find(x=>x.id===id);
  if(!p) return;
  const files = DB.files.filter(f=>typeof f.storeKey==='string' && f.storeKey.indexOf('project:'+p.id+':')===0);
  const linkedNeeds = DB.needs.filter(n=>n.projectId===p.id || n.id===p.needId);
  const linkedRequests = DB.requests.filter(r=>r.projectId===p.id);
  const linkedTasks = DB.tasks.filter(t=>t.projectId===p.id);
  const linkedPurchases = (DB.purchases||[]).filter(pu=>pu.projectId===p.id);
  const extra = files.length ? ` Se borran también sus ${files.length} archivo(s) del servidor.` : '';
  if(!confirm(`¿Eliminar el proyecto "${p.code} — ${p.name}"? Esta acción no se puede deshacer.${extra}`)) return;
  try{
    if(files.length) await deleteStoredFiles(files);
  }catch(err){
    toast('No se pudieron borrar los archivos del servidor: ' + err.message, true);
    return;
  }
  DB.files = DB.files.filter(f=>!files.includes(f));
  DB.tasks = DB.tasks.filter(t=>!linkedTasks.includes(t));
  DB.purchases = (DB.purchases||[]).filter(pu=>!linkedPurchases.includes(pu));
  linkedNeeds.forEach(n=>{ n.projectId = null; if(n.status==='CONVERTIDO_EN_PROYECTO') n.status = 'PENDIENTE'; });
  linkedRequests.forEach(r=>{ r.projectId = null; });
  DB.projects = DB.projects.filter(x=>x.id!==id);
  logAudit('DELETE','Project', `${p.code} — ${p.name}`);
  persist();
  projectDetailState = { projectId:null, returnRoute: projectDetailState.returnRoute||'projects', editingDriveLink:false };
  render();
  toast('Proyecto eliminado');
}

/* ---- EVENTOS ---- */
const EVENT_TYPES = ['Inspección','Mantenimiento','Reunión','Capacitación','Visita técnica','Vencimiento','Obra','Otro'];
const MONTHS_SHORT = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'];

function openEventModal(){
  modal = { type:'event' };
  renderModal(`
    <h2>Nuevo evento</h2>
    <label class="field light"><span>Título</span><input id="m-ev-title" type="text"></label>
    <div class="row2">
      <label class="field light"><span>Fecha</span><input id="m-ev-date" type="date" value="${todayISO()}"></label>
      <label class="field light"><span>Hora</span><input id="m-ev-time" type="time" value="${nowTimeStr()}"></label>
    </div>
    <div class="row2">
      <label class="field light"><span>Tipo</span><select id="m-ev-type">${EVENT_TYPES.map(t=>`<option value="${t}">${t}</option>`).join('')}</select></label>
      <label class="field light"><span>Lugar (opcional)</span><input id="m-ev-place" type="text"></label>
    </div>
    <label class="field light"><span>Responsable (opcional)</span><input id="m-ev-resp" type="text"></label>
    <label class="field light"><span>Descripción</span><textarea id="m-ev-desc" rows="2"></textarea></label>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="saveEvent()">Crear evento</button>
    </div>`);
}
function saveEvent(){
  const title = document.getElementById('m-ev-title').value.trim();
  const date = document.getElementById('m-ev-date').value;
  const time = document.getElementById('m-ev-time').value;
  const type = document.getElementById('m-ev-type').value;
  const place = document.getElementById('m-ev-place').value.trim();
  const responsible = document.getElementById('m-ev-resp').value.trim();
  const description = document.getElementById('m-ev-desc').value.trim();
  if(!title || !date){ toast('Completá al menos título y fecha'); return; }
  DB.events.push({ id: uid(), title, date, time, type, place, responsible, description, createdAtISO: new Date().toISOString() });
  logAudit('CREATE','Event', title);
  persist(); closeModal(); render();
}
function deleteEvent(id){
  const e = DB.events.find(x=>x.id===id);
  if(!e || !confirm(`¿Eliminar el evento "${e.title}"?`)) return;
  DB.events = DB.events.filter(x=>x.id!==id);
  logAudit('DELETE','Event', e.title);
  persist(); render();
}

/* ---- ASISTENCIA A EVENTOS (RSVP) ----
   Cada usuario marca si asiste o no a un evento; se guarda por evento un
   mapa { userId: {name, status, at} } y se muestra en la visión general
   del evento la lista de quiénes confirmaron asistencia. */
function ensureEventAttendance(e){
  if(!e.attendance || typeof e.attendance !== 'object') e.attendance = {};
}
function eventAttendanceSummary(e){
  ensureEventAttendance(e);
  const entries = Object.values(e.attendance);
  return {
    yes: entries.filter(a=>a.status==='YES'),
    no: entries.filter(a=>a.status==='NO'),
    mine: session ? (e.attendance[session.id] || null) : null,
  };
}
function setMyEventAttendance(eventId, status){
  const e = DB.events.find(x=>x.id===eventId);
  if(!e || !session) return;
  ensureEventAttendance(e);
  const current = e.attendance[session.id];
  if(current && current.status === status){
    // Tocar de nuevo la misma opción la quita (permite "deshacer" el RSVP).
    delete e.attendance[session.id];
    logAudit('UPDATE','Event attendance', `${e.title} — ${session.name}: sin confirmar`);
  } else {
    e.attendance[session.id] = { name: session.name, status, at: new Date().toISOString() };
    logAudit('UPDATE','Event attendance', `${e.title} — ${session.name}: ${status==='YES'?'Asiste':'No asiste'}`);
  }
  persist(); render();
}
function eventRsvpHtml(e){
  const { yes, no, mine } = eventAttendanceSummary(e);
  return `
    <div class="event-rsvp" onclick="event.stopPropagation();">
      <div class="event-rsvp-btns">
        <button class="btn btn-sm ${mine && mine.status==='YES' ? 'btn-primary' : 'btn-ghost'}" onclick="setMyEventAttendance('${e.id}','YES')">✓ Asisto</button>
        <button class="btn btn-sm ${mine && mine.status==='NO' ? 'btn-danger' : 'btn-ghost'}" onclick="setMyEventAttendance('${e.id}','NO')">✕ No asisto</button>
      </div>
      <div class="event-rsvp-summary">
        <span class="badge ok" title="${yes.map(a=>esc(a.name)).join(', ')||'Nadie todavía'}">Asisten: ${yes.length}</span>
        <span class="badge gray" title="${no.map(a=>esc(a.name)).join(', ')||'Nadie todavía'}">No asisten: ${no.length}</span>
        ${yes.length>0 ? `<div class="event-rsvp-names">${yes.map(a=>esc(a.name)).join(', ')}</div>` : ''}
      </div>
    </div>`;
}
function upcomingEvents(limit){
  const now = new Date();
  const list = DB.events
    .filter(e=> new Date(`${e.date}T${e.time||'00:00'}`) >= new Date(now.getFullYear(),now.getMonth(),now.getDate()))
    .sort((a,b)=> `${a.date}T${a.time||'00:00'}`.localeCompare(`${b.date}T${b.time||'00:00'}`));
  return limit ? list.slice(0,limit) : list;
}
function renderUpcomingEventsList(list, withDelete){
  if(list.length===0) return '<div class="empty">No hay eventos próximos cargados.</div>';
  return list.map(e=>{
    const d = new Date(e.date+'T00:00:00');
    return `<div class="event-row">
      <div class="event-date"><div class="d">${d.getDate()}</div><div class="m">${MONTHS_SHORT[d.getMonth()]}</div></div>
      <div class="event-body" style="flex:1;">
        <div class="t"><span class="time">${esc(e.time||'')}</span>${esc(e.title)}</div>
        <div class="s">${esc(e.place||esc(e.type))}${e.description?' — '+esc(e.description):''}</div>
        ${eventRsvpHtml(e)}
      </div>
      ${withDelete ? `<button class="btn btn-ghost btn-sm" style="height:fit-content;" onclick="deleteEvent('${e.id}')">Quitar</button>` : ''}
    </div>`;
  }).join('');
}
function renderEvents(){
  const upcoming = upcomingEvents();
  const past = DB.events.filter(e=> !upcoming.includes(e)).sort((a,b)=> `${b.date}T${b.time||'00:00'}`.localeCompare(`${a.date}T${a.time||'00:00'}`));
  const html = `
    <div style="margin-bottom:14px;"><button class="btn btn-primary" onclick="openEventModal()">+ Nuevo evento</button></div>
    <div class="grid2">
      <div class="card">
        <h3 style="font-size:13.5px;margin:0 0 10px;">Próximos eventos</h3>
        ${renderUpcomingEventsList(upcoming, true)}
      </div>
      <div class="card">
        <h3 style="font-size:13.5px;margin:0 0 10px;">Eventos pasados</h3>
        ${past.length===0?'<div class="empty">Sin eventos pasados.</div>': past.slice(0,15).map(e=>`
          <div style="font-size:12.5px;padding:7px 0;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;">
            <div><strong>${esc(e.title)}</strong><div style="color:var(--ink-soft);font-size:11px;">${esc(e.date)} ${esc(e.time||'')} · ${esc(e.type)}</div></div>
            <button class="btn btn-ghost btn-sm" onclick="deleteEvent('${e.id}')">Quitar</button>
          </div>`).join('')}
      </div>
    </div>`;
  renderShell(html, 'Eventos', 'Inspecciones, mantenimientos, reuniones, capacitaciones, obras y vencimientos del dependencia.');
}
