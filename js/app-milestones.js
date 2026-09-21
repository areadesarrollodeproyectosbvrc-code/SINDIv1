/* ===================== PLAN DE TRABAJO — HITOS =====================
   Cada proyecto puede tener un plan de trabajo formado por hitos cargados
   manualmente. Cada hito tiene fecha de cumplimiento, uno o varios
   responsables (tomados de los usuarios ya cargados) y su propia lista de
   tareas a cumplimentar.

   El avance del proyecto se calcula como:
        hitos marcados como realizados / total de hitos
   y se muestra como porcentaje, barra y curva de avance (planificado vs real).

   Los hitos viven dentro del propio proyecto (project.milestones), así que
   no se crea ninguna base de datos paralela ni se tocan los vínculos de
   Drive del proyecto.
   ================================================================== */

function ensureMilestones(p){
  if(!Array.isArray(p.milestones)) p.milestones = [];
  p.milestones.forEach(m=>{
    if(!Array.isArray(m.tasks)) m.tasks = [];
    if(!Array.isArray(m.responsibles)) m.responsibles = [];
  });
  return p.milestones;
}

// Avance = hitos realizados / total de hitos.
function milestoneProgress(p){
  const ms = ensureMilestones(p);
  const total = ms.length;
  const done = ms.filter(m=>m.done).length;
  return { total, done, pct: total===0 ? 0 : Math.round(done/total*100) };
}

function sortedMilestones(p){
  return ensureMilestones(p).slice().sort((a,b)=>{
    const ad = a.dueDate || '9999-12-31', bd = b.dueDate || '9999-12-31';
    return ad.localeCompare(bd);
  });
}

/* ---- Curva de avance: planificado (por fecha comprometida de cada hito)
   contra real (por fecha en que se marcó realizado). Ambas acumuladas y
   expresadas en % sobre el total de hitos. SVG puro, sin librerías.

   milestoneCurveSvg() arma el gráfico una sola vez y lo usan tanto la ficha
   en pantalla como el informe PDF del proyecto (forPrint = leyenda dentro
   del propio SVG, porque los fondos de color de un <span> no se imprimen
   por defecto y el gráfico tiene que salir igual en papel). ---- */
const CURVE_PLANNED_COLOR = '#4f7fc0';
const CURVE_ACTUAL_COLOR = '#a31f1f';
function milestoneCurveSvg(p, forPrint){
  const ms = ensureMilestones(p);
  if(ms.length===0) return { empty:'nohitos' };
  const total = ms.length;

  const planned = ms.filter(m=>m.dueDate).map(m=>m.dueDate).sort();
  const actual = ms.filter(m=>m.done && m.doneDate).map(m=>m.doneDate).sort();
  if(planned.length===0 && actual.length===0) return { empty:'sinfechas' };

  const allDates = [...new Set([...planned, ...actual])].sort();
  const t0 = new Date(allDates[0]+'T00:00:00').getTime();
  const t1 = new Date(allDates[allDates.length-1]+'T00:00:00').getTime();
  const span = Math.max(t1 - t0, 1);

  const W = 620, padL = 34, padR = 12, padB = 26;
  const padT = forPrint ? 30 : 12;   // en papel, lugar arriba para la leyenda
  const H = forPrint ? 214 : 190;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const xOf = iso => padL + ((new Date(iso+'T00:00:00').getTime() - t0) / span) * plotW;
  const yOf = pct => padT + plotH - (pct/100) * plotH;

  function seriesPoints(dates){
    const pts = [];
    dates.forEach((d,i)=>{ pts.push([xOf(d), yOf((i+1)/total*100)]); });
    if(pts.length) pts.unshift([padL, yOf(0)]);
    return pts;
  }
  function pathOf(pts){
    if(pts.length===0) return '';
    // Escalonada: el avance salta al completarse cada hito.
    let d = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
    for(let i=1;i<pts.length;i++){
      d += ` L ${pts[i][0].toFixed(1)} ${pts[i-1][1].toFixed(1)} L ${pts[i][0].toFixed(1)} ${pts[i][1].toFixed(1)}`;
    }
    return d;
  }
  const plannedPts = seriesPoints(planned);
  const actualPts = seriesPoints(actual);

  const gridLines = [0,25,50,75,100].map(v=>`
    <line x1="${padL}" y1="${yOf(v).toFixed(1)}" x2="${W-padR}" y2="${yOf(v).toFixed(1)}" stroke="#e5e2da" stroke-width="1"></line>
    <text x="${padL-6}" y="${(yOf(v)+3).toFixed(1)}" text-anchor="end" font-size="9" fill="#8a8f96">${v}%</text>`).join('');

  const fmt = iso => { const d = new Date(iso+'T00:00:00'); return `${d.getDate()}/${d.getMonth()+1}`; };
  const xLabels = `
    <text x="${padL}" y="${H-8}" font-size="9" fill="#8a8f96">${fmt(allDates[0])}</text>
    <text x="${W-padR}" y="${H-8}" text-anchor="end" font-size="9" fill="#8a8f96">${fmt(allDates[allDates.length-1])}</text>`;

  const dots = actualPts.slice(1).map(pt=>`<circle cx="${pt[0].toFixed(1)}" cy="${pt[1].toFixed(1)}" r="3" fill="${CURVE_ACTUAL_COLOR}"></circle>`).join('');

  const legend = forPrint ? `
    <line x1="${padL}" y1="12" x2="${padL+22}" y2="12" stroke="${CURVE_PLANNED_COLOR}" stroke-width="2" stroke-dasharray="5 3"></line>
    <text x="${padL+28}" y="15.5" font-size="10" fill="#333">Planificado</text>
    <line x1="${padL+104}" y1="12" x2="${padL+126}" y2="12" stroke="${CURVE_ACTUAL_COLOR}" stroke-width="2.5"></line>
    <text x="${padL+132}" y="15.5" font-size="10" fill="#333">Real</text>` : '';

  const svg = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;" font-family="Inter, Arial, sans-serif">
        ${legend}
        ${gridLines}
        ${xLabels}
        ${plannedPts.length ? `<path d="${pathOf(plannedPts)}" fill="none" stroke="${CURVE_PLANNED_COLOR}" stroke-width="2" stroke-dasharray="5 3"></path>` : ''}
        ${actualPts.length ? `<path d="${pathOf(actualPts)}" fill="none" stroke="${CURVE_ACTUAL_COLOR}" stroke-width="2.5"></path>` : ''}
        ${dots}
      </svg>`;
  return { svg };
}

function milestoneCurveHtml(p){
  const c = milestoneCurveSvg(p, false);
  if(c.empty==='nohitos') return '';
  if(c.empty==='sinfechas'){
    return '<div style="font-size:11px;color:var(--ink-soft);margin-top:8px;">Cargá fechas en los hitos para ver la curva de avance.</div>';
  }
  return `
    <div style="margin-top:12px;">
      <div style="display:flex;gap:14px;font-size:10.5px;color:var(--ink-soft);margin-bottom:4px;">
        <span><span style="display:inline-block;width:14px;height:2px;background:${CURVE_PLANNED_COLOR};vertical-align:middle;"></span> Planificado</span>
        <span><span style="display:inline-block;width:14px;height:2px;background:${CURVE_ACTUAL_COLOR};vertical-align:middle;"></span> Real</span>
      </div>
      ${c.svg}
    </div>`;
}

/* ---- Sección completa dentro de la ficha del proyecto ---- */
function milestonesSectionHtml(p){
  const ms = sortedMilestones(p);
  const prog = milestoneProgress(p);
  const today = todayISO();

  const rows = ms.length===0 ? '<div class="empty">Sin hitos cargados. Agregá el primero para armar el plan de trabajo.</div>' :
    ms.map(m=>{
      const taskDone = m.tasks.filter(t=>t.done).length;
      const late = !m.done && m.dueDate && m.dueDate < today;
      return `<div class="milestone">
        <div class="milestone-head">
          <label class="milestone-check">
            <input type="checkbox" ${m.done?'checked':''} onchange="toggleMilestoneDone('${p.id}','${m.id}')">
            <span class="milestone-title ${m.done?'is-done':''}">${esc(m.title)}</span>
          </label>
          <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
            ${m.done
              ? `<span class="badge ok">Realizado${m.doneDate?' · '+esc(m.doneDate):''}</span>`
              : late ? `<span class="badge danger">Vencido</span>` : ''}
            <button class="btn btn-ghost btn-sm" onclick="openMilestoneModal('${p.id}','${m.id}')">Editar</button>
            <button class="btn btn-ghost btn-sm" onclick="deleteMilestone('${p.id}','${m.id}')">Quitar</button>
          </div>
        </div>
        <div class="milestone-meta">
          Fecha: ${esc(m.dueDate||'sin fecha')}
          · Responsable${m.responsibles.length===1?'':'s'}: ${m.responsibles.length ? esc(m.responsibles.join(', ')) : 'sin asignar'}
          ${m.tasks.length ? ` · Tareas: ${taskDone}/${m.tasks.length}` : ''}
        </div>
        ${m.tasks.length ? `<div class="milestone-tasks">
          ${m.tasks.map(t=>`<label class="milestone-task">
            <input type="checkbox" ${t.done?'checked':''} onchange="toggleMilestoneTask('${p.id}','${m.id}','${t.id}')">
            <span class="${t.done?'is-done':''}">${esc(t.text)}</span>
          </label>`).join('')}
        </div>` : ''}
        ${m.notes ? `<div class="milestone-meta" style="margin-top:4px;">${esc(m.notes)}</div>` : ''}
      </div>`;
    }).join('');

  return `<div class="card" style="margin-bottom:16px;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
      <h3 style="font-size:13.5px;margin:0;">Plan de trabajo — Hitos ${prog.total ? `<span style="font-weight:400;color:var(--ink-soft);font-size:12px;">(${prog.done}/${prog.total} realizados)</span>` : ''}</h3>
      <button class="btn btn-ghost btn-sm" onclick="openMilestoneModal('${p.id}')">+ Agregar hito</button>
    </div>
    ${prog.total ? `
      <div class="milestone-progress">
        <div class="milestone-bar"><div class="milestone-bar-fill" style="width:${prog.pct}%;"></div></div>
        <span class="milestone-pct">${prog.pct}%</span>
      </div>
      ${milestoneCurveHtml(p)}
      <div style="margin:12px 0 4px;"></div>
    ` : ''}
    ${rows}
  </div>`;
}

/* ---- Alta / edición de hitos ---- */
function openMilestoneModal(projectId, milestoneId){
  const p = DB.projects.find(x=>x.id===projectId);
  if(!p) return;
  ensureMilestones(p);
  const m = milestoneId ? p.milestones.find(x=>x.id===milestoneId) : null;
  modal = { type:'milestone', projectId, milestoneId };
  renderModal(`
    <h2>${m?'Editar hito':'Nuevo hito'}</h2>
    <label class="field light"><span>Título del hito</span><input id="ms-title" type="text" value="${esc(m?.title||'')}" placeholder="Ej.: Anteproyecto aprobado"></label>
    <label class="field light"><span>Fecha para cumplir</span><input id="ms-due" type="date" value="${esc(m?.dueDate||'')}"></label>
    <label class="field light"><span>Responsables (podés elegir varios con Ctrl / Cmd)</span>
      <select id="ms-resp" multiple size="5">
        ${allUserNames().map(u=>`<option value="${esc(u)}" ${(m?.responsibles||[]).includes(u)?'selected':''}>${esc(u)}</option>`).join('')}
      </select>
    </label>
    <label class="field light"><span>Tareas a cumplimentar (una por línea)</span>
      <textarea id="ms-tasks" rows="4" placeholder="Relevar medidas&#10;Pedir presupuesto&#10;Presentar a Jefatura">${esc((m?.tasks||[]).map(t=>t.text).join('\n'))}</textarea>
    </label>
    <label class="field light"><span>Observaciones</span><textarea id="ms-notes" rows="2">${esc(m?.notes||'')}</textarea></label>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="saveMilestone('${projectId}','${milestoneId||''}')">Guardar</button>
    </div>`);
}

function saveMilestone(projectId, milestoneId){
  const p = DB.projects.find(x=>x.id===projectId);
  if(!p) return;
  ensureMilestones(p);
  const title = document.getElementById('ms-title').value.trim();
  if(!title){ toast('Poné un título para el hito'); return; }
  const dueDate = document.getElementById('ms-due').value;
  const responsibles = Array.from(document.getElementById('ms-resp').selectedOptions).map(o=>o.value);
  const notes = document.getElementById('ms-notes').value.trim();
  const taskLines = document.getElementById('ms-tasks').value.split('\n').map(s=>s.trim()).filter(Boolean);

  let m = milestoneId ? p.milestones.find(x=>x.id===milestoneId) : null;
  if(m){
    // Se conserva el estado (done) de las tareas que siguen existiendo.
    const prev = m.tasks;
    m.tasks = taskLines.map(text=>{
      const old = prev.find(t=>t.text===text);
      return old ? old : { id: uid(), text, done:false };
    });
    Object.assign(m, { title, dueDate, responsibles, notes });
    logAudit('UPDATE','Milestone', `${p.code}: ${title}`);
  } else {
    p.milestones.push({
      id: uid(), title, dueDate, responsibles, notes,
      done:false, doneDate:null,
      tasks: taskLines.map(text=>({ id: uid(), text, done:false })),
      createdAtISO: new Date().toISOString(),
    });
    logAudit('CREATE','Milestone', `${p.code}: ${title}`);
  }
  syncProjectProgress(p);
  persist(); closeModal(); render();
}

function toggleMilestoneDone(projectId, milestoneId){
  const p = DB.projects.find(x=>x.id===projectId);
  if(!p) return;
  ensureMilestones(p);
  const m = p.milestones.find(x=>x.id===milestoneId);
  if(!m) return;
  m.done = !m.done;
  m.doneDate = m.done ? todayISO() : null;
  logAudit('STATUS_CHANGE','Milestone', `${p.code}: ${m.title} → ${m.done?'realizado':'pendiente'}`);
  syncProjectProgress(p);
  persist(); render();
}

function toggleMilestoneTask(projectId, milestoneId, taskId){
  const p = DB.projects.find(x=>x.id===projectId);
  if(!p) return;
  ensureMilestones(p);
  const m = p.milestones.find(x=>x.id===milestoneId);
  if(!m) return;
  const t = m.tasks.find(x=>x.id===taskId);
  if(!t) return;
  t.done = !t.done;
  persist(); render();
}

function deleteMilestone(projectId, milestoneId){
  const p = DB.projects.find(x=>x.id===projectId);
  if(!p) return;
  ensureMilestones(p);
  const m = p.milestones.find(x=>x.id===milestoneId);
  if(!m) return;
  if(!confirm(`¿Quitar el hito "${m.title}"?`)) return;
  p.milestones = p.milestones.filter(x=>x.id!==milestoneId);
  logAudit('DELETE','Milestone', `${p.code}: ${m.title}`);
  syncProjectProgress(p);
  persist(); render();
}

// El % de avance del proyecto pasa a reflejar los hitos cuando hay plan
// de trabajo cargado. Sin hitos, se respeta el valor cargado a mano.
function syncProjectProgress(p){
  const prog = milestoneProgress(p);
  if(prog.total > 0) p.progress = prog.pct;
}

/* ---- Bloque del plan de trabajo para el informe PDF del proyecto.
   Incluye las curvas de avance (planificado vs. real) como gráfico y, a
   continuación, la tabla de hitos. Todo forma parte de la impresión
   general del proyecto (printProject), no hay una impresión aparte. ---- */
function milestonesCurvePrintSection(p){
  const c = milestoneCurveSvg(p, true);
  if(c.empty==='nohitos') return '';
  if(c.empty==='sinfechas'){
    return `<div class="print-section">
      <h3>Curvas de avance</h3>
      <p class="print-obs">Los hitos no tienen fechas cargadas: no hay datos para dibujar las curvas de avance.</p>
    </div>`;
  }
  return `<div class="print-section print-curve">
    <h3>Curvas de avance — planificado vs. real (% de hitos acumulado)</h3>
    ${c.svg}
  </div>`;
}
function milestonesPrintSection(p){
  const ms = sortedMilestones(p);
  const prog = milestoneProgress(p);
  if(ms.length===0){
    return `<div class="print-section">
      <h3>Plan de trabajo</h3>
      <p class="print-obs">Sin hitos cargados para este proyecto.</p>
    </div>`;
  }
  const rows = ms.map(m=>{
    const taskDone = m.tasks.filter(t=>t.done).length;
    const detalle = m.tasks.length
      ? m.tasks.map(t=>`${t.done?'[x]':'[ ]'} ${esc(t.text)}`).join('<br>')
      : '—';
    return `<tr>
      <td>${esc(m.title)}</td>
      <td>${m.done ? 'Realizado' : 'Pendiente'}${m.done && m.doneDate ? ' ('+esc(m.doneDate)+')' : ''}</td>
      <td>${esc(m.dueDate||'—')}</td>
      <td>${m.responsibles.length ? esc(m.responsibles.join(', ')) : '—'}</td>
      <td>${m.tasks.length ? `${taskDone}/${m.tasks.length}<br>${detalle}` : '—'}</td>
    </tr>`;
  }).join('');
  return `${milestonesCurvePrintSection(p)}
  <div class="print-section">
    <h3>Plan de trabajo — Hitos (${prog.done}/${prog.total} realizados · ${prog.pct}% de avance)</h3>
    <table>
      <thead><tr><th>Hito</th><th>Estado</th><th>Fecha comprometida</th><th>Responsables</th><th>Tareas a cumplimentar</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}
