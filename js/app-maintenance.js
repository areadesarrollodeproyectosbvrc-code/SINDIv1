/* ============================================================
   MANTENIMIENTO (tareas periódicas, enlazadas al calendario de
   Eventos) y TAREAS (pedidos de trabajo puntuales, editables
   en cualquier momento). Son dos módulos independientes.
   ============================================================ */

/* ---- MANTENIMIENTO ---- */
const MAINT_FREQ_UNITS = [
  {key:'DIAS', label:'días'}, {key:'SEMANAS', label:'semanas'},
  {key:'MESES', label:'meses'}, {key:'ANIOS', label:'años'},
];
function maintFreqUnitLabel(u){ const f = MAINT_FREQ_UNITS.find(x=>x.key===u); return f ? f.label : u; }
function addToDate(dateStr, value, unit){
  const d = new Date((dateStr||todayISO())+'T00:00:00');
  const n = Number(value)||0;
  if(unit==='DIAS') d.setDate(d.getDate()+n);
  else if(unit==='SEMANAS') d.setDate(d.getDate()+n*7);
  else if(unit==='MESES') d.setMonth(d.getMonth()+n);
  else if(unit==='ANIOS') d.setFullYear(d.getFullYear()+n);
  return d.toISOString().slice(0,10);
}
function computeNextDue(m){
  const base = m.lastDoneDate || (m.createdAtISO ? m.createdAtISO.slice(0,10) : todayISO());
  return addToDate(base, m.frequencyValue, m.frequencyUnit);
}
function nextMaintenanceDue(){
  if(DB.maintenance.length===0) return null;
  const withDue = DB.maintenance.map(m=>({ ...m, nextDueDate: computeNextDue(m) }));
  withDue.sort((a,b)=> a.nextDueDate.localeCompare(b.nextDueDate));
  return withDue[0];
}
// Crea o actualiza el evento del calendario (Eventos) enlazado a esta tarea de
// mantenimiento, para que su próxima fecha aparezca en "Próximos eventos".
function syncMaintenanceEvent(m){
  const nextDue = computeNextDue(m);
  let ev = m.linkedEventId ? DB.events.find(e=>e.id===m.linkedEventId) : null;
  if(!ev){
    ev = { id: uid(), createdAtISO: new Date().toISOString() };
    DB.events.push(ev);
    m.linkedEventId = ev.id;
  }
  ev.title = 'Mantenimiento: ' + m.title;
  ev.date = nextDue;
  ev.time = '';
  ev.type = 'Mantenimiento';
  ev.place = m.stationId ? stationNameById(m.stationId) : '';
  ev.responsible = m.responsible || '';
  ev.description = m.description || '';
}

function openMaintenanceModal(id){
  const m = id ? DB.maintenance.find(x=>x.id===id) : null;
  modal = { type:'maintenance', id };
  renderModal(`
    <h2>${m?'Editar tarea de mantenimiento':'Nueva tarea de mantenimiento'}</h2>
    <label class="field light"><span>Tarea</span><input id="mm-title" type="text" placeholder="Ej: Aceitar buje de puerta principal" value="${esc(m?.title||'')}"></label>
    <label class="field light"><span>Descripción (opcional)</span><textarea id="mm-desc" rows="2">${esc(m?.description||'')}</textarea></label>
    <div class="row2">
      <label class="field light"><span>Frecuencia</span><input id="mm-freq-val" type="number" min="1" value="${m?.frequencyValue||6}"></label>
      <label class="field light"><span>Cada</span>
        <select id="mm-freq-unit">${MAINT_FREQ_UNITS.map(u=>`<option value="${u.key}" ${m?.frequencyUnit===u.key?'selected':(!m&&u.key==='MESES'?'selected':'')}>${u.label}</option>`).join('')}</select>
      </label>
    </div>
    <div class="row2">
      <label class="field light"><span>Dependencia (opcional)</span>
        <select id="mm-station"><option value="">Sin asignar</option>${DB.stations.map(st=>`<option value="${st.id}" ${m?.stationId===st.id?'selected':''}>${esc(st.name)}</option>`).join('')}</select>
      </label>
      <label class="field light"><span>Responsable (opcional)</span>
        <select id="mm-resp"><option value="">Sin asignar</option>${allUserNames().map(u=>`<option value="${esc(u)}" ${m?.responsible===u?'selected':''}>${esc(u)}</option>`).join('')}</select>
      </label>
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="saveMaintenance('${id||''}')">Guardar</button>
    </div>`);
}
function saveMaintenance(id){
  const title = document.getElementById('mm-title').value.trim();
  const description = document.getElementById('mm-desc').value.trim();
  const frequencyValue = parseInt(document.getElementById('mm-freq-val').value) || 1;
  const frequencyUnit = document.getElementById('mm-freq-unit').value;
  const stationId = document.getElementById('mm-station').value || null;
  const responsible = document.getElementById('mm-resp').value || '';
  if(!title){ toast('Ingresá el nombre de la tarea'); return; }
  let m = id ? DB.maintenance.find(x=>x.id===id) : null;
  if(m){
    Object.assign(m, { title, description, frequencyValue, frequencyUnit, stationId, responsible });
    logAudit('UPDATE','Maintenance', title);
  } else {
    m = { id: uid(), title, description, frequencyValue, frequencyUnit, stationId, responsible,
      lastDoneDate:null, history:[], linkedEventId:null, createdAtISO: new Date().toISOString() };
    DB.maintenance.push(m);
    logAudit('CREATE','Maintenance', title);
  }
  syncMaintenanceEvent(m);
  persist(); closeModal(); render();
}
function deleteMaintenance(id){
  const m = DB.maintenance.find(x=>x.id===id);
  if(!m || !confirm(`¿Eliminar la tarea de mantenimiento "${m.title}"?`)) return;
  if(m.linkedEventId) DB.events = DB.events.filter(e=>e.id!==m.linkedEventId);
  DB.maintenance = DB.maintenance.filter(x=>x.id!==id);
  logAudit('DELETE','Maintenance', m.title);
  persist(); render();
}
function openMarkDoneModal(id){
  const m = DB.maintenance.find(x=>x.id===id);
  if(!m) return;
  modal = { type:'maintenance-done', id };
  renderModal(`
    <h2>Marcar como realizada</h2>
    <div class="field light"><span>Tarea</span><div style="padding:9px 0;font-size:13.5px;">${esc(m.title)}</div></div>
    <label class="field light"><span>Fecha en que se realizó</span><input id="md-date" type="date" value="${todayISO()}"></label>
    <label class="field light"><span>Quién la realizó</span>
      <select id="md-by">
        <option value="">Sin especificar</option>
        ${allUserNames().map(u=>`<option value="${esc(u)}" ${session && session.name===u?'selected':''}>${esc(u)}</option>`).join('')}
      </select>
    </label>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="confirmMaintenanceDone('${id}')">Confirmar</button>
    </div>`);
}
function confirmMaintenanceDone(id){
  const m = DB.maintenance.find(x=>x.id===id);
  if(!m) return;
  const date = document.getElementById('md-date').value || todayISO();
  const by = document.getElementById('md-by').value;
  m.history = m.history || [];
  m.history.unshift({ date, by });
  m.lastDoneDate = date;
  syncMaintenanceEvent(m);
  logAudit('UPDATE','Maintenance done', `${m.title} — ${date}${by?' — '+by:''}`);
  persist(); closeModal(); render();
  toast('Tarea marcada como realizada');
}
function renderMaintenance(){
  const list = DB.maintenance.map(m=>({ ...m, nextDueDate: computeNextDue(m) })).sort((a,b)=>a.nextDueDate.localeCompare(b.nextDueDate));
  const today = todayISO();
  const html = `
    <div style="margin-bottom:14px;"><button class="btn btn-primary" onclick="openMaintenanceModal()">+ Nueva tarea de mantenimiento</button></div>
    <div class="card">
      ${list.length===0 ? '<div class="empty">Todavía no hay tareas de mantenimiento cargadas.</div>' :
        list.map(m=>{
          const overdue = m.nextDueDate < today;
          const lastDone = m.history && m.history[0];
          return `<div style="padding:12px 0;border-bottom:1px solid var(--line);">
            <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;">
              <div>
                <span class="badge ${overdue?'danger':'ok'}">${overdue?'Vencida':'Al día'}</span>
                <strong style="margin-left:6px;">${esc(m.title)}</strong>
                <div style="font-size:11.5px;color:var(--ink-soft);margin-top:3px;">
                  Próxima: <strong>${esc(m.nextDueDate)}</strong> · Cada ${m.frequencyValue} ${esc(maintFreqUnitLabel(m.frequencyUnit))}
                  ${m.stationId ? ' · ' + esc(stationNameById(m.stationId)) : ''}
                  ${m.responsible ? ' · Responsable: ' + esc(m.responsible) : ''}
                </div>
                ${m.description ? `<div style="font-size:12px;color:var(--ink-soft);margin-top:3px;">${esc(m.description)}</div>` : ''}
                ${lastDone ? `<div style="font-size:11px;color:var(--ink-soft);margin-top:3px;">Última vez: ${esc(lastDone.date)}${lastDone.by?' — '+esc(lastDone.by):''}</div>` : '<div style="font-size:11px;color:var(--ink-soft);margin-top:3px;">Todavía no se realizó nunca.</div>'}
              </div>
              <div style="display:flex;gap:6px;height:fit-content;">
                <button class="btn btn-primary btn-sm" onclick="openMarkDoneModal('${m.id}')">Marcar realizada</button>
                <button class="btn btn-ghost btn-sm" onclick="openMaintenanceModal('${m.id}')">Editar</button>
                <button class="btn btn-ghost btn-sm" style="color:var(--danger);" onclick="deleteMaintenance('${m.id}')">Quitar</button>
              </div>
            </div>
          </div>`;
        }).join('')}
    </div>`;
  renderShell(html, 'Mantenimiento', 'Tareas periódicas (ej: cada 6 meses). Cada una queda enlazada a un evento del calendario con su próxima fecha.');
}

/* ---- TAREAS (pedidos de trabajo puntuales, distinto de Mantenimiento) ---- */
const TASK_STATUSES = ['PENDIENTE','COMPLETADA'];
function taskStatusLabel(st){ return st==='COMPLETADA' ? 'Completada' : 'Pendiente'; }

function openTaskModal(id, presetProjectId){
  const t = id ? DB.tasks.find(x=>x.id===id) : null;
  const currentProjectId = t ? (t.projectId || '') : (presetProjectId || '');
  modal = { type:'task', id };
  renderModal(`
    <h2>${t?'Editar tarea':'Nueva tarea'}</h2>
    <label class="field light"><span>Descripción de la tarea</span><textarea id="tk-desc" rows="2">${esc(t?.description||'')}</textarea></label>
    <label class="field light"><span>Proyecto asociado (opcional)</span>
      <select id="tk-project" onchange="refreshTaskNeedOptions()">
        <option value="">Tarea independiente</option>
        ${DB.projects.map(p=>`<option value="${p.id}" ${currentProjectId===p.id?'selected':''}>${esc(p.code)} — ${esc(p.name)}</option>`).join('')}
      </select>
    </label>
    <div id="tk-need-wrap">${taskNeedFieldHtml(currentProjectId, t?.needId)}</div>
    <div class="row2">
      <label class="field light"><span>Responsable</span>
        <select id="tk-resp"><option value="">Sin asignar</option>${allUserNames().map(u=>`<option value="${esc(u)}" ${t?.responsible===u?'selected':''}>${esc(u)}</option>`).join('')}</select>
      </label>
      <label class="field light"><span>Fecha</span><input id="tk-date" type="date" value="${esc(t?.date||todayISO())}"></label>
    </div>
    <label class="field light"><span>Estado</span>
      <select id="tk-status">${TASK_STATUSES.map(st=>`<option value="${st}" ${t?.status===st?'selected':''}>${taskStatusLabel(st)}</option>`).join('')}</select>
    </label>
    <label class="field light"><span>Observaciones</span><textarea id="tk-obs" rows="2">${esc(t?.observations||'')}</textarea></label>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="saveTask('${id||''}')">Guardar</button>
    </div>`);
}
function saveTask(id){
  const description = document.getElementById('tk-desc').value.trim();
  const projectId = document.getElementById('tk-project').value || null;
  const needEl = document.getElementById('tk-need');
  const needId = needEl ? (needEl.value || null) : null;
  const responsible = document.getElementById('tk-resp').value;
  const date = document.getElementById('tk-date').value;
  const status = document.getElementById('tk-status').value;
  const observations = document.getElementById('tk-obs').value.trim();
  if(!description){ toast('Completá la descripción de la tarea'); return; }
  let t = id ? DB.tasks.find(x=>x.id===id) : null;
  if(t){
    Object.assign(t, { description, projectId, needId, responsible, date, status, observations });
    logAudit('UPDATE','Task', description.slice(0,60));
  } else {
    t = { id: uid(), description, projectId, needId, responsible, date, status, observations, createdAtISO: new Date().toISOString() };
    DB.tasks.push(t);
    logAudit('CREATE','Task', description.slice(0,60));
  }
  persist(); closeModal(); render();
}
function deleteTask(id){
  const t = DB.tasks.find(x=>x.id===id);
  if(!t || !confirm('¿Eliminar esta tarea?')) return;
  DB.tasks = DB.tasks.filter(x=>x.id!==id);
  logAudit('DELETE','Task', t.description.slice(0,60));
  persist(); render();
}
function toggleTaskStatus(id, status){
  const t = DB.tasks.find(x=>x.id===id);
  if(!t) return;
  t.status = status;
  logAudit('STATUS_CHANGE','Task', `${t.description.slice(0,40)}: ${taskStatusLabel(status)}`);
  persist(); render();
}
function renderTasks(){
  const list = DB.tasks.slice().sort((a,b)=> (a.status===b.status ? (a.date||'').localeCompare(b.date||'') : (a.status==='PENDIENTE'?-1:1)));
  const html = `
    <div style="margin-bottom:14px;"><button class="btn btn-primary" onclick="openTaskModal()">+ Nueva tarea</button></div>
    <div class="card">
      ${list.length===0 ? '<div class="empty">Todavía no hay tareas cargadas.</div>' :
        list.map(t=>`<div style="padding:11px 0;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;">
          <div>
            <select onchange="toggleTaskStatus('${t.id}', this.value)">
              ${TASK_STATUSES.map(st=>`<option value="${st}" ${st===t.status?'selected':''}>${taskStatusLabel(st)}</option>`).join('')}
            </select>
            <strong style="margin-left:8px;">${esc(t.description)}</strong>
            <div style="font-size:11.5px;color:var(--ink-soft);margin-top:4px;">${esc(t.date||'Sin fecha')} · ${esc(t.responsible||'Sin responsable')}${t.projectId ? ' · Proyecto: ' + (()=>{ const pr=DB.projects.find(x=>x.id===t.projectId); return pr ? `<span class="link-tab" onclick="goRoute('projects'); openProjectDetail('${pr.id}')">${esc(pr.code)}</span>` : 'sin datos'; })() : ' · Tarea independiente'}</div>
            ${t.observations ? `<div style="font-size:12px;color:var(--ink-soft);margin-top:3px;">${esc(t.observations)}</div>` : ''}
          </div>
          <div style="display:flex;gap:6px;height:fit-content;">
            <button class="btn btn-ghost btn-sm" onclick="openTaskModal('${t.id}')">Editar</button>
            <button class="btn btn-ghost btn-sm" style="color:var(--danger);" onclick="deleteTask('${t.id}')">Quitar</button>
          </div>
        </div>`).join('')}
    </div>`;
  renderShell(html, 'Tareas', 'Trabajos puntuales, no necesariamente periódicos. Todos los campos se pueden editar en cualquier momento.');
}

/* ---- Anclaje de una tarea a una necesidad del proyecto ----
   Solo se ofrecen las necesidades que pertenecen al proyecto elegido:
   la que le dio origen y las del mismo espacio/dependencia. */
function needsForProject(projectId){
  const p = DB.projects.find(x=>x.id===projectId);
  if(!p) return [];
  const out = [];
  const origin = p.needId ? DB.needs.find(n=>n.id===p.needId) : null;
  if(origin) out.push(origin);
  DB.needs.forEach(n=>{
    if(out.some(x=>x.id===n.id)) return;
    const sameSpace = p.spaceId && n.spaceId === p.spaceId;
    const sameStation = p.stationId && n.stationId === p.stationId;
    if(sameSpace || sameStation) out.push(n);
  });
  return out;
}
function taskNeedFieldHtml(projectId, selectedNeedId){
  if(!projectId) return '';
  const needs = needsForProject(projectId);
  if(needs.length===0){
    return '<div style="font-size:11px;color:var(--ink-soft);margin:-8px 0 14px;">El proyecto no tiene necesidades asociadas para anclar.</div>';
  }
  return `<label class="field light"><span>Necesidad vinculada (opcional)</span>
    <select id="tk-need">
      <option value="">Sin anclar a una necesidad</option>
      ${needs.map(n=>`<option value="${n.id}" ${selectedNeedId===n.id?'selected':''}>${esc(n.code)} — ${esc(n.title||n.description||'')}</option>`).join('')}
    </select>
  </label>`;
}
function refreshTaskNeedOptions(){
  const projectId = document.getElementById('tk-project').value;
  document.getElementById('tk-need-wrap').innerHTML = taskNeedFieldHtml(projectId, null);
}
function taskNeedLabel(t){
  if(!t.needId) return '';
  const n = DB.needs.find(x=>x.id===t.needId);
  return n ? `${n.code}` : '';
}
