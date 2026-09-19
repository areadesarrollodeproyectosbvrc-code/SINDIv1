/* ============================================================
   DEPENDENCIAS, ESPACIOS Y RELEVAMIENTOS, PATOLOGÍAS (con fotos a Drive)
   ============================================================ */

/* ---- DEPENDENCIAS ---- */
function renderStations(){
  if(stationDetailState.stationId) return renderStationDetail();
  const rows = DB.stations.map(s=>`
    <tr class="tap" onclick="openStationDetail('${s.id}')">
      <td>${esc(s.name)}</td>
      <td>${esc(s.address||'—')}</td>
      <td class="mono">${m2(stationSurfaceTotal(s.id))} m²</td>
      <td style="text-align:right;">
        <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation(); openStationModal('${s.id}')">Editar</button>
        <button class="btn btn-ghost btn-sm" style="color:var(--danger);" onclick="event.stopPropagation(); deactivateStation('${s.id}')">Dar de baja</button>
      </td>
    </tr>`).join('');
  const html = `
    <div style="margin-bottom:14px;"><button class="btn btn-primary" onclick="openStationModal()">+ Nuevo dependencia</button></div>
    <div class="card">
      ${DB.stations.length===0 ? '<div class="empty">Todavía no hay dependencias cargados.</div>' :
      `<table><thead><tr><th>Nombre</th><th>Dirección</th><th>Superficie total</th><th></th></tr></thead><tbody>${rows}</tbody></table>`}
    </div>`;
  renderShell(html, 'Dependencias', 'Hacé clic en una fila para ver su ficha, plano y proyectos asociados.');
}
function openStationModal(id){
  const s = id ? DB.stations.find(x=>x.id===id) : null;
  modal = { type:'station', id };
  renderModal(`
    <h2>${s?'Editar dependencia':'Nuevo dependencia'}</h2>
    <label class="field light"><span>Nombre</span><input id="m-name" type="text" value="${esc(s?.name||'')}"></label>
    <label class="field light"><span>Dirección</span><input id="m-address" type="text" value="${esc(s?.address||'')}"></label>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="saveStation('${id||''}')">Guardar</button>
    </div>`);
}
function saveStation(id){
  const name = document.getElementById('m-name').value.trim();
  const address = document.getElementById('m-address').value.trim();
  if(!name){ toast('El nombre es obligatorio'); return; }
  if(id){
    const s = DB.stations.find(x=>x.id===id);
    s.name = name; s.address = address;
    logAudit('UPDATE','Station', name);
  } else {
    DB.stations.push({ id: uid(), name, address, active:true, planImage:null });
    logAudit('CREATE','Station', name);
  }
  persist(); closeModal(); render();
}
function deactivateStation(id){
  const s = DB.stations.find(x=>x.id===id);
  if(!confirm(`¿Dar de baja "${s.name}"?`)) return;
  DB.stations = DB.stations.filter(x=>x.id!==id);
  logAudit('DEACTIVATE','Station', s.name);
  persist(); render();
}

/* ---- FICHA DE DEPENDENCIA: plano con áreas marcadas + espacios + proyectos ---- */
function openStationDetail(id){ stationDetailState = { stationId: id }; render(); }
function stationFolderSegment(s){ return s.name; }
function spaceRowHtml(s){
  return `<tr class="tap" onclick="goRoute('spaces'); openSpaceDetail('${s.id}')">
    <td class="mono">${esc(s.cue)}</td>
    <td>${esc(s.name)}</td>
    <td>${esc(spaceLevelLabel(s.level))}</td>
    <td>${esc(s.surfaceType)}</td>
    <td>${m2(s.surfaceM2)} m²</td>
  </tr>`;
}
function stationSpacesTableHtml(stationId){
  const list = DB.spaces.filter(s=>s.stationId===stationId);
  if(list.length===0) return '<div class="empty">Sin espacios cargados para esta dependencia.</div>';
  return `<table><thead><tr><th>CUE</th><th>Nombre</th><th>Nivel</th><th>Tipo</th><th>Superficie</th></tr></thead><tbody>${list.map(spaceRowHtml).join('')}</tbody></table>`;
}
function renderStationDetail(){
  const s = DB.stations.find(x=>x.id===stationDetailState.stationId);
  if(!s){ stationDetailState.stationId=null; return renderStations(); }
  const projects = DB.projects.filter(p=>p.stationId===s.id);
  const html = `
    <div class="link-tab" style="margin-bottom:10px;" onclick="stationDetailState.stationId=null; render();">&larr; Todas las dependencias</div>
    <div class="card" style="margin-bottom:16px;">
      <div class="row2">
        <label class="field light"><span>Nombre</span><input data-stf="name" type="text" value="${esc(s.name)}"></label>
        <label class="field light"><span>Dirección</span><input data-stf="address" type="text" value="${esc(s.address||'')}"></label>
      </div>
      <div style="font-size:12px;color:var(--ink-soft);">Superficie total relevada: <strong>${m2(stationSurfaceTotal(s.id))} m²</strong></div>
    </div>
    <div class="card" style="margin-bottom:16px;">
      <h3 style="font-size:13.5px;margin:0 0 10px;">Plano con áreas marcadas</h3>
      <label class="btn btn-ghost btn-sm" style="display:inline-block;">
        ${s.planImage ? 'Reemplazar plano' : '+ Subir plano (JPG/PNG)'}
        <input id="station-plan-input" type="file" accept="image/*" style="display:none;">
      </label>
      <div style="margin-top:4px;"></div>
      ${s.planImage && s.planImage.url ? `<div style="margin-top:12px;"><a href="${esc(s.planImage.viewUrl || s.planImage.url)}" target="_blank"><img src="${esc(s.planImage.url)}" alt="Plano de ${esc(s.name)}" style="max-width:100%;border:1px solid var(--line);border-radius:8px;"></a></div>` : '<div class="empty">Todavía no se cargó el plano de esta dependencia.</div>'}
      <div style="margin-top:14px;">
        <h4 style="font-size:12.5px;margin:0 0 8px;">Espacios de esta dependencia</h4>
        ${stationSpacesTableHtml(s.id)}
      </div>
    </div>
    <div class="card">
      <h3 style="font-size:13.5px;margin:0 0 10px;">Proyectos asociados</h3>
      ${projects.length===0 ? '<div class="empty">Sin proyectos asociados a esta dependencia.</div>' :
        `<table><thead><tr><th>Código</th><th>Nombre</th><th>Estado</th><th>Prioridad</th></tr></thead><tbody>
        ${projects.map(p=>`<tr class="tap" onclick="goRoute('projects'); openProjectDetail('${p.id}')"><td class="mono">${esc(p.code)}</td><td>${esc(p.name)}</td><td><span class="badge gray">${esc(p.status)}</span></td><td>${priorityBadge(p.priority)}</td></tr>`).join('')}
        </tbody></table>`}
    </div>`;
  renderShell(html, 'Ficha de dependencia', '');
  document.querySelectorAll('[data-stf]').forEach(inp=>{
    inp.addEventListener('change', ()=>{
      s[inp.dataset.stf] = inp.value;
      logAudit('UPDATE','Station', s.name);
      persist();
    });
  });
  const planInput = document.getElementById('station-plan-input');
  if(planInput){ planInput.addEventListener('change', ()=> uploadStationPlan(planInput, s.id)); }
}
async function uploadStationPlan(inputEl, stationId){
  const s = DB.stations.find(x=>x.id===stationId);
  const file = inputEl.files && inputEl.files[0];
  if(!s || !file) return;
  toast('Subiendo plano...');
  try{
    const result = await driveUploadFile({ file, folderPath: ['CUARTELES', stationFolderSegment(s)], description: `Plano de ${s.name}` });
    s.planImage = { name: file.name, url: result.url || '', viewUrl: result.viewUrl || '', uploadedAt: new Date().toISOString(), storedIn:'r2' };
  }catch(err){
    toast('Error al subir el plano: ' + err.message, true); return;
  }
  logAudit('UPLOAD','Station plan', s.name);
  persist(); render();
}

/* ---- ESPACIOS ---- */
const SPACE_ITEMS = {
  survey: [
    {id:'lighting', label:'Iluminación'}, {id:'ventilation', label:'Ventilación'},
    {id:'thermalComfort', label:'Confort térmico'}, {id:'humidity', label:'Humedad'},
    {id:'noise', label:'Ruido'}, {id:'accessibility', label:'Accesibilidad'},
  ],
};

/* ---- NIVEL del edificio (extensible: agregar acá para sumar más niveles) ---- */
const SPACE_LEVELS = [
  {key:'PLANTA_BAJA', label:'Planta Baja'},
  {key:'PLANTA_ALTA', label:'Planta Alta'},
  {key:'TERRAZA', label:'Terraza'},
  {key:'PATIO', label:'Patio'},
  {key:'OTRO', label:'Otro'},
];
function spaceLevelLabel(key){ const f = SPACE_LEVELS.find(x=>x.key===key); return f ? f.label : 'Sin especificar'; }

/* ---- INSTALACIONES (checklist extensible) ----
   Para sumar una nueva instalación más adelante alcanza con agregar
   un elemento a este array: el resto del sistema (ficha, guardado,
   backfill de espacios viejos) ya la toma automáticamente. */
const INSTALLATION_TYPES = [
  {key:'ELECTRICIDAD', label:'Electricidad'},
  {key:'PLOMERIA', label:'Plomería'},
  {key:'CCTV', label:'CCTV'},
  {key:'CLIMATIZACION', label:'Climatización'},
];
const INSTALLATION_STATES = ['BUENO','REGULAR','MALO','NO_APLICA'];
function installationStateLabel(s){
  return { BUENO:'Bueno', REGULAR:'Regular', MALO:'Malo', NO_APLICA:'No aplica' }[s] || 'Sin evaluar';
}
function defaultInstallations(){
  const obj = {};
  INSTALLATION_TYPES.forEach(t=>{ obj[t.key] = { checked:false, state:'', notes:'' }; });
  return obj;
}
// Completa instalaciones faltantes en espacios cargados antes de esta versión,
// y en tipos de instalación nuevos que se agreguen a futuro.
function ensureSpaceInstallations(s){
  if(!s.installations) s.installations = {};
  INSTALLATION_TYPES.forEach(t=>{
    if(!s.installations[t.key]) s.installations[t.key] = { checked:false, state:'', notes:'' };
  });
  if(!Array.isArray(s.generalPhotos)) s.generalPhotos = [];
  if(!s.level) s.level = 'PLANTA_BAJA';
}
// Carpeta de Drive propia de cada relevamiento para sus fotos generales
// (separada de las fotos por patología, que siguen en PATOLOGIAS).
function spaceFolderSegment(s){ return `${s.cue} - ${s.name}`; }

function renderSpaces(){
  if(detailState.spaceId) return renderSpaceDetail();

  // Navegación en tres pasos: Dependencia → Nivel → Relevamientos del nivel.
  const stationId = spacesNav.stationId;
  const level = spacesNav.level;

  function spaceRow(sp){
    return `<tr class="tap" onclick="openSpaceDetail('${sp.id}')">
      <td class="mono">${esc(sp.cue)}</td>
      <td>${esc(sp.name)}</td>
      <td>${esc(sp.surfaceType)}</td>
      <td>${m2(sp.surfaceM2)} m²</td>
      <td>${sp.pathologies && sp.pathologies.length ? sp.pathologies.length : '—'}</td>
    </tr>`;
  }

  // --- Paso 1: elegir dependencia ---
  if(!stationId){
    const orphans = DB.spaces.filter(sp=> !DB.stations.some(st=>st.id===sp.stationId));
    const cards = DB.stations.map(st=>{
      const count = DB.spaces.filter(sp=>sp.stationId===st.id).length;
      return `<div class="pick-card tap" onclick="spacesNav.stationId='${st.id}'; spacesNav.level=null; render();">
        ${st.planImage && st.planImage.url ? `<img src="${esc(st.planImage.url)}" alt="${esc(st.name)}">` : `<div class="pick-card-ph"></div>`}
        <div class="pick-card-body">
          <div class="pick-card-name">${esc(st.name)}</div>
          <div class="pick-card-meta">${count} espacio${count===1?'':'s'} · ${m2(stationSurfaceTotal(st.id))} m²</div>
        </div>
      </div>`;
    }).join('');
    const html = `
      <div style="margin-bottom:14px;"><button class="btn btn-primary" onclick="openSpaceModal()">+ Nuevo espacio</button></div>
      ${DB.stations.length===0 ? '<div class="card"><div class="empty">Todavía no hay dependencias cargadas.</div></div>' :
        `<div class="pick-grid">${cards}</div>`}
      ${orphans.length>0 ? `<div class="card station-group" style="margin-top:16px;">
        <div class="station-group-head"><h3 style="font-size:13.5px;margin:0;">Sin dependencia asignada</h3></div>
        <table><thead><tr><th>CUE</th><th>Nombre</th><th>Tipo</th><th>Superficie</th><th>Patologías</th></tr></thead><tbody>${orphans.map(spaceRow).join('')}</tbody></table>
      </div>` : ''}`;
    return renderShell(html, 'Espacios y relevamientos', 'Elegí una dependencia para ver sus niveles.');
  }

  const station = DB.stations.find(st=>st.id===stationId);
  if(!station){ spacesNav.stationId = null; return render(); }
  const stationSpaces = DB.spaces.filter(sp=>sp.stationId===stationId);

  // --- Paso 2: elegir nivel dentro de la dependencia ---
  if(!level){
    const levelCards = SPACE_LEVELS.map(l=>{
      const items = stationSpaces.filter(sp=>sp.level===l.key);
      return `<div class="pick-card level tap" onclick="spacesNav.level='${l.key}'; render();">
        <div class="pick-card-body">
          <div class="pick-card-name">${esc(l.label)}</div>
          <div class="pick-card-meta">${items.length} relevamiento${items.length===1?'':'s'}</div>
        </div>
      </div>`;
    }).join('');
    const noLevel = stationSpaces.filter(sp=> !SPACE_LEVELS.some(l=>l.key===sp.level));
    const html = `
      <div class="link-tab" style="margin-bottom:10px;" onclick="spacesNav.stationId=null; spacesNav.level=null; render();">&larr; Todas las dependencias</div>
      <div style="margin-bottom:14px;"><button class="btn btn-primary" onclick="openSpaceModal()">+ Nuevo espacio</button></div>
      <div class="pick-grid">${levelCards}</div>
      ${noLevel.length>0 ? `<div class="card station-group" style="margin-top:16px;">
        <div class="station-group-head"><h3 style="font-size:13.5px;margin:0;">Sin nivel especificado</h3></div>
        <table><thead><tr><th>CUE</th><th>Nombre</th><th>Tipo</th><th>Superficie</th><th>Patologías</th></tr></thead><tbody>${noLevel.map(spaceRow).join('')}</tbody></table>
      </div>` : ''}`;
    return renderShell(html, esc(station.name), 'Elegí un nivel para ver los relevamientos cargados.');
  }

  // --- Paso 3: relevamientos del nivel elegido ---
  const list = stationSpaces.filter(sp=>sp.level===level);
  const html = `
    <div class="link-tab" style="margin-bottom:10px;" onclick="spacesNav.level=null; render();">&larr; Niveles de ${esc(station.name)}</div>
    <div style="margin-bottom:14px;"><button class="btn btn-primary" onclick="openSpaceModal()">+ Nuevo espacio</button></div>
    <div class="card station-group">
      <div class="station-group-head">
        <h3 style="font-size:13.5px;margin:0;">${esc(station.name)} · ${esc(spaceLevelLabel(level))}</h3>
        <span style="font-size:11.5px;color:var(--ink-soft);">${list.length} relevamiento${list.length===1?'':'s'}</span>
      </div>
      ${list.length===0 ? '<div class="empty">Sin relevamientos cargados en este nivel.</div>' :
      `<table><thead><tr><th>CUE</th><th>Nombre</th><th>Tipo</th><th>Superficie</th><th>Patologías</th></tr></thead><tbody>${list.map(spaceRow).join('')}</tbody></table>`}
    </div>`;
  renderShell(html, 'Espacios y relevamientos', 'Hacé clic en una fila para abrir la ficha completa del espacio.');
}

function openSpaceModal(){
  if(DB.stations.length===0){ toast('Primero cargá un dependencia'); return; }
  modal = { type:'space' };
  renderModal(`
    <h2>Nuevo espacio</h2>
    <div class="row2">
      <label class="field light"><span>Código único (CUE)</span><input id="m-cue" type="text" placeholder="Ej: ESP-001"></label>
      <label class="field light"><span>Dependencia</span>
        <select id="m-station">${DB.stations.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select>
      </label>
    </div>
    <label class="field light"><span>Nombre / uso del espacio</span><input id="m-space-name" type="text" placeholder="Ej: Vestuario nuevo ingreso"></label>
    <div class="row2">
      <label class="field light"><span>Nivel</span>
        <select id="m-space-level">${SPACE_LEVELS.map(l=>`<option value="${l.key}">${l.label}</option>`).join('')}</select>
      </label>
      <label class="field light"><span>Tipo de superficie</span>
        <select id="m-surface-type">
          <option value="CUBIERTA">Cubierta</option>
          <option value="SEMICUBIERTA">Semicubierta</option>
          <option value="DESCUBIERTA">Descubierta</option>
        </select>
      </label>
    </div>
    <label class="field light"><span>Superficie (m²)</span><input id="m-surface-m2" type="number" step="0.01" placeholder="0.00"></label>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="saveSpace()">Crear espacio</button>
    </div>`);
}
function saveSpace(){
  const cue = document.getElementById('m-cue').value.trim();
  const stationId = document.getElementById('m-station').value;
  const name = document.getElementById('m-space-name').value.trim();
  const level = document.getElementById('m-space-level').value;
  const surfaceType = document.getElementById('m-surface-type').value;
  const surfaceM2 = parseFloat(document.getElementById('m-surface-m2').value) || 0;
  if(!cue || !name){ toast('Completá el CUE y el nombre'); return; }
  if(DB.spaces.some(s=>s.stationId===stationId && s.cue.toLowerCase()===cue.toLowerCase() && s.active!==false)){
    toast('Ya existe un espacio con ese CUE en este dependencia'); return;
  }
  const space = {
    id: uid(), cue, stationId, name, level, surfaceType, surfaceM2, active:true,
    createdAt: new Date().toISOString(),
    survey: { lighting:'', ventilation:'', thermalComfort:'', humidity:'', noise:'', accessibility:'', observations:'' },
    pathologies: [],
    generalPhotos: [],
    installations: defaultInstallations(),
  };
  DB.spaces.push(space);
  logAudit('CREATE','Space', `${cue} — ${name}`);
  persist(); closeModal();
  detailState = { spaceId: space.id, tab:'general' };
  render();
}
function openSpaceDetail(id){ detailState = { spaceId:id, tab:'general' }; render(); }
function setDetailTab(t){ detailState.tab = t; render(); }

function renderSpaceDetail(){
  const s = DB.spaces.find(x=>x.id===detailState.spaceId);
  if(!s){ detailState.spaceId=null; return renderSpaces(); }
  ensureSpaceInstallations(s);
  const station = DB.stations.find(x=>x.id===s.stationId);

  let body = '';
  if(detailState.tab==='general'){
    body = `<div class="card">
      <div class="row2">
        <label class="field light"><span>Nombre</span><input data-f="name" type="text" value="${esc(s.name)}"></label>
        <label class="field light"><span>Dependencia</span>
          <select data-f="stationId">${DB.stations.map(st=>`<option value="${st.id}" ${st.id===s.stationId?'selected':''}>${esc(st.name)}</option>`).join('')}</select>
        </label>
      </div>
      <div class="row2">
        <label class="field light"><span>Nivel</span>
          <select data-f="level">${SPACE_LEVELS.map(l=>`<option value="${l.key}" ${l.key===s.level?'selected':''}>${l.label}</option>`).join('')}</select>
        </label>
        <label class="field light"><span>Tipo de superficie</span>
          <select data-f="surfaceType">
            <option value="CUBIERTA" ${s.surfaceType==='CUBIERTA'?'selected':''}>Cubierta</option>
            <option value="SEMICUBIERTA" ${s.surfaceType==='SEMICUBIERTA'?'selected':''}>Semicubierta</option>
            <option value="DESCUBIERTA" ${s.surfaceType==='DESCUBIERTA'?'selected':''}>Descubierta</option>
          </select>
        </label>
      </div>
      <label class="field light"><span>Superficie (m²)</span><input data-f="surfaceM2" type="number" step="0.01" value="${s.surfaceM2}"></label>
    </div>`;
  } else if(detailState.tab==='survey'){
    body = `<div class="card">
      <div class="row2">
        ${SPACE_ITEMS.survey.map(it=>`<label class="field light"><span>${esc(it.label)}</span><input data-sv="${it.id}" type="text" value="${esc(s.survey[it.id]||'')}"></label>`).join('')}
      </div>
      <label class="field light"><span>Observaciones</span><textarea data-sv="observations" rows="3">${esc(s.survey.observations||'')}</textarea></label>
    </div>`;
  } else if(detailState.tab==='pathologies'){
    body = renderPathologiesTab(s);
  } else if(detailState.tab==='photos'){
    body = renderSpacePhotosTab(s);
  } else if(detailState.tab==='installations'){
    body = renderInstallationsTab(s);
  } else if(detailState.tab==='needs'){
    const needs = DB.needs.filter(n=>n.spaceId===s.id);
    body = `<div class="card">
      ${needs.length===0?'<div class="empty">Sin necesidades cargadas para este espacio.</div>':
        needs.map(n=>`<div style="border-bottom:1px solid var(--line);padding:8px 0;">
          <span class="badge ${n.priority==='ALTA'?'danger':n.priority==='MEDIA'?'warn':'ok'}">${esc(n.priority)}</span>
          <span class="badge gray" style="margin-left:6px;">${esc(needStatusLabel(n.status))}</span>
          <span class="mono" style="margin-left:6px;font-size:11px;color:var(--ink-soft);">${esc(n.code||'')}</span>
          <div style="font-size:13px;margin-top:4px;">${esc(n.title||n.description)}</div>
          ${n.status!=='CONVERTIDO_EN_PROYECTO' ? `<span class="link-tab" onclick="convertNeedToProject('${n.id}')">Convertir en proyecto →</span>` : '<span style="font-size:11.5px;color:var(--ink-soft);">Ya tiene proyecto asociado</span>'}
        </div>`).join('')}
      <button class="btn btn-ghost" style="margin-top:10px;" onclick="openNeedModal('${s.id}')">+ Agregar necesidad</button>
    </div>`;
  }

  const html = `
    <div class="link-tab" style="margin-bottom:10px;" onclick="detailState.spaceId=null; render();">&larr; Todos los espacios</div>
    <div class="card" style="margin-bottom:16px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;">
        <div>
          <span class="mono" style="font-size:12px;background:#eeece5;padding:2px 8px;border-radius:6px;">${esc(s.cue)}</span>
          <div style="font-size:16px;font-weight:700;margin-top:6px;">${esc(s.name)}</div>
          <div style="font-size:12px;color:var(--ink-soft);">${esc(station?.name||'')} · ${esc(spaceLevelLabel(s.level))} · ${esc(s.surfaceType)} · ${m2(s.surfaceM2)} m²</div>
        </div>
        <button class="btn btn-ghost btn-sm" onclick="printSpace('${s.id}')">Imprimir / PDF</button>
      </div>
    </div>
    <div class="detail-tabs">
      <div class="detail-tab ${detailState.tab==='general'?'active':''}" onclick="setDetailTab('general')">Datos generales</div>
      <div class="detail-tab ${detailState.tab==='survey'?'active':''}" onclick="setDetailTab('survey')">Relevamiento</div>
      <div class="detail-tab ${detailState.tab==='pathologies'?'active':''}" onclick="setDetailTab('pathologies')">Patologías</div>
      <div class="detail-tab ${detailState.tab==='photos'?'active':''}" onclick="setDetailTab('photos')">Fotos generales</div>
      <div class="detail-tab ${detailState.tab==='installations'?'active':''}" onclick="setDetailTab('installations')">Instalaciones</div>
      <div class="detail-tab ${detailState.tab==='needs'?'active':''}" onclick="setDetailTab('needs')">Necesidades</div>
    </div>
    ${body}
    <div id="print-space" class="print-area" style="display:none;"></div>`;
  renderShell(html, 'Ficha del espacio', '');
  wireSpaceDetailEvents(s);
}
function wireSpaceDetailEvents(s){
  document.querySelectorAll('[data-f]').forEach(inp=>{
    inp.addEventListener('change', ()=>{
      const f = inp.dataset.f;
      s[f] = f==='surfaceM2' ? (parseFloat(inp.value)||0) : inp.value;
      logAudit('UPDATE','Space', s.name);
      persist();
    });
  });
  document.querySelectorAll('[data-sv]').forEach(inp=>{
    inp.addEventListener('change', ()=>{ s.survey[inp.dataset.sv] = inp.value; persist(); });
  });
  const photoInput = document.getElementById('pathology-photo-input');
  if(photoInput){ photoInput.addEventListener('change', (e)=> handlePathologyPhotoSelect(e, s.id)); }
  const generalPhotoInput = document.getElementById('space-general-photo-input');
  if(generalPhotoInput){ generalPhotoInput.addEventListener('change', ()=> uploadSpaceGeneralPhotos(generalPhotoInput, s.id)); }
  document.querySelectorAll('[data-inst-key]').forEach(inp=>{
    inp.addEventListener('change', ()=>{
      const key = inp.dataset.instKey, field = inp.dataset.instField;
      const item = s.installations[key];
      item[field] = (field==='checked') ? inp.checked : inp.value;
      logAudit('UPDATE','Space installation', `${key} en ${s.name}`);
      persist();
    });
  });
}

/* ---- FOTOS GENERALES DEL RELEVAMIENTO (separadas de las fotos por patología) ---- */
function renderSpacePhotosTab(s){
  return `<div class="card">
    <div style="margin-bottom:10px;">
      <label class="btn btn-ghost btn-sm" style="display:inline-block;">
        + Agregar fotos generales
        <input id="space-general-photo-input" type="file" accept="image/*" multiple style="display:none;">
      </label>
    </div>
    ${(s.generalPhotos||[]).length===0 ? '<div class="empty">Sin fotos generales cargadas para este espacio.</div>' : `
      <div class="photo-grid">
        ${s.generalPhotos.map(ph=>`
          <a href="${esc(ph.viewUrl || ph.url)}" target="_blank" class="photo-card" style="text-decoration:none;color:inherit;">
            <img src="${esc(ph.url)}" alt="${esc(ph.name)}" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22120%22 height=%2290%22><rect width=%22120%22 height=%2290%22 fill=%22%23eeece5%22/></svg>'">
            <div class="pc-body">
              <div class="pc-name">${esc(ph.name)}</div>
              <div class="pc-desc">${ph.uploadedAt ? new Date(ph.uploadedAt).toLocaleDateString('es-AR') : ''}</div>
            </div>
          </a>`).join('')}
      </div>`}
  </div>`;
}
async function uploadSpaceGeneralPhotos(inputEl, spaceId){
  const s = DB.spaces.find(x=>x.id===spaceId);
  if(!s) return;
  const files = Array.from(inputEl.files||[]);
  if(files.length===0) return;
  s.generalPhotos = s.generalPhotos || [];
  const folderPath = ['RELEVAMIENTOS', spaceFolderSegment(s)];
  toast('Subiendo ' + files.length + ' foto(s)...');
  for(const file of files){
    try{
      const result = await driveUploadFile({ file, folderPath, description: `Foto general — ${s.name}` });
      s.generalPhotos.push({
        id: result.fileId || uid(), name: file.name, url: result.url || '', viewUrl: result.viewUrl || '',
        uploadedAt: new Date().toISOString(), storedIn:'r2',
      });
    }catch(err){
      toast('Error al subir ' + file.name + ': ' + err.message, true);
    }
  }
  logAudit('UPLOAD','Space photo', `${files.length} foto(s) generales en ${s.name}`);
  persist(); render();
}

/* ---- INSTALACIONES (checklist extensible: Electricidad, Plomería, CCTV, Climatización...) ---- */
function renderInstallationsTab(s){
  return `<div class="card">
    ${INSTALLATION_TYPES.map(t=>{
      const item = s.installations[t.key];
      return `<div style="border-bottom:1px solid var(--line);padding:10px 0;">
        <label style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;cursor:pointer;">
          <input type="checkbox" data-inst-key="${t.key}" data-inst-field="checked" ${item.checked?'checked':''}>
          ${esc(t.label)}
        </label>
        <div class="row2" style="margin-top:8px;">
          <label class="field light"><span>Estado</span>
            <select data-inst-key="${t.key}" data-inst-field="state">
              <option value="">Sin evaluar</option>
              ${INSTALLATION_STATES.map(st=>`<option value="${st}" ${item.state===st?'selected':''}>${installationStateLabel(st)}</option>`).join('')}
            </select>
          </label>
          <label class="field light"><span>Observaciones</span><input type="text" data-inst-key="${t.key}" data-inst-field="notes" value="${esc(item.notes||'')}"></label>
        </div>
      </div>`;
    }).join('')}
    <div style="font-size:11px;color:var(--ink-soft);margin-top:10px;">Este apartado está pensado para poder sumar nuevas instalaciones a futuro (agregando el tipo en el código) sin reestructurar la ficha.</div>
  </div>`;
}

/* ---- PATOLOGÍAS ---- */
function openPathologyModal(){
  modal = { type:'pathology' };
  renderModal(`
    <h2>Nueva patología</h2>
    <label class="field light"><span>Categoría</span><input id="m-cat" type="text" placeholder="Ej: Humedad"></label>
    <label class="field light"><span>Descripción</span><textarea id="m-desc" rows="3"></textarea></label>
    <label class="field light"><span>Gravedad</span>
      <select id="m-sev"><option value="BAJA">Baja</option><option value="MEDIA">Media</option><option value="ALTA">Alta</option><option value="CRITICA">Crítica</option></select>
    </label>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="savePathology()">Agregar</button>
    </div>`);
}
function savePathology(){
  const category = document.getElementById('m-cat').value.trim();
  const description = document.getElementById('m-desc').value.trim();
  const severity = document.getElementById('m-sev').value;
  if(!category || !description){ toast('Completá categoría y descripción'); return; }
  const s = DB.spaces.find(x=>x.id===detailState.spaceId);
  s.pathologies.push({ id: uid(), category, description, severity, photos: [] });
  logAudit('CREATE','Pathology', `${category} en ${s.name}`);
  persist(); closeModal(); render();
}
function removePathology(i){
  const s = DB.spaces.find(x=>x.id===detailState.spaceId);
  s.pathologies.splice(i,1);
  persist(); render();
}

function renderPathologiesTab(s){
  return `<div class="card">
    ${s.pathologies.length===0?'<div class="empty">Sin patologías cargadas.</div>':
      s.pathologies.map((p,i)=>`
        <div style="border-bottom:1px solid var(--line);padding:10px 0;">
          <div style="display:flex;justify-content:space-between;gap:10px;">
            <div><span class="badge ${p.severity==='CRITICA'||p.severity==='ALTA'?'danger':p.severity==='MEDIA'?'warn':'ok'}">${esc(p.severity)}</span>
            <strong style="margin-left:6px;">${esc(p.category)}</strong><div style="font-size:12px;color:var(--ink-soft);">${esc(p.description)}</div></div>
            <button class="btn btn-ghost btn-sm" style="height:fit-content;" onclick="removePathology(${i})">Quitar</button>
          </div>
          <div style="margin-top:8px;">
            <label class="btn btn-ghost btn-sm" style="display:inline-block;">
              + Agregar fotos
              <input type="file" accept="image/*" multiple style="display:none;" onchange="uploadPathologyPhotos(this, '${p.id}')">
            </label>
          </div>
          <div class="photo-grid">
            ${(p.photos||[]).map(ph=>`
              <a href="${esc(ph.viewUrl || ph.url)}" target="_blank" class="photo-card" style="text-decoration:none;color:inherit;">
                <img src="${esc(ph.url)}" alt="${esc(ph.name)}" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22120%22 height=%2290%22><rect width=%22120%22 height=%2290%22 fill=%22%23eeece5%22/></svg>'">
                <div class="pc-body">
                  <div class="pc-name">${esc(ph.name)}</div>
                  <div class="pc-desc">${esc(ph.description||'')}</div>
                </div>
              </a>`).join('')}
          </div>
        </div>`).join('')}
    <button class="btn btn-ghost" style="margin-top:10px;" onclick="openPathologyModal()">+ Agregar patología</button>
  </div>`;
}

async function uploadPathologyPhotos(inputEl, pathologyId){
  const s = DB.spaces.find(x=>x.id===detailState.spaceId);
  const p = s?.pathologies.find(x=>x.id===pathologyId);
  if(!p) return;
  const files = Array.from(inputEl.files||[]);
  if(files.length===0) return;
  p.photos = p.photos || [];
  toast('Subiendo ' + files.length + ' foto(s)...');
  for(const file of files){
    try{
      const result = await driveUploadFile({
        file,
        folderPath: ['PATOLOGIAS'],
        description: `${p.category} — ${s.name}`
      });
      p.photos.push({
        id: result.fileId || uid(),
        name: file.name,
        url: result.url || '',
        viewUrl: result.viewUrl || '',
        description: `${p.category} — ${s.name}`,
        uploadedAt: new Date().toISOString(),
        pathologyId: p.id,
        storedIn: 'r2',
      });
    }catch(err){
      toast('Error al subir ' + file.name + ': ' + err.message, true);
    }
  }
  logAudit('UPLOAD','Pathology photo', `${files.length} foto(s) en ${p.category}`);
  persist(); render();
}
