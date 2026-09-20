/* ============ CÓMPUTO DE MATERIALES Y COMPRAS ============
   - Los materiales viven dentro de cada proyecto (project.materials).
   - Las compras viven todas en DB.purchases. Una compra puede estar
     asociada a un proyecto (projectId) y, dentro de él, a un material
     del cómputo (materialId); o ser una compra general sin proyecto.
   No se crean bases paralelas ni se tocan los vínculos de Drive.
   ========================================================= */

const MATERIAL_UNITS = ['unidad','m','m²','m³','kg','tn','litro','bolsa','caja','rollo','global'];
const PURCHASE_STATUSES = ['PENDIENTE','AUTORIZADA','COMPRADA','RECIBIDA'];
const PURCHASE_STATUS_COLORS = {
  PENDIENTE:'#b98a2e', AUTORIZADA:'#4f7fc0', COMPRADA:'#8a63d2', RECIBIDA:'#3f7d4a',
};
function purchaseStatusLabel(s){
  return ({PENDIENTE:'Pendiente', AUTORIZADA:'Autorizada', COMPRADA:'Comprada', RECIBIDA:'Recibida'})[s] || s || '—';
}
function purchaseStatusBadgeClass(s){
  return s==='RECIBIDA' ? 'ok' : s==='PENDIENTE' ? 'warn' : 'gray';
}

function ensureMaterials(p){
  if(!Array.isArray(p.materials)) p.materials = [];
  return p.materials;
}
function ensurePurchases(){
  if(!Array.isArray(DB.purchases)) DB.purchases = [];
  return DB.purchases;
}

// Subtotal de un material y total del cómputo de un proyecto.
function materialSubtotal(m){ return (parseFloat(m.qty)||0) * (parseFloat(m.price)||0); }
function projectMaterialsTotal(p){ return ensureMaterials(p).reduce((acc,m)=>acc+materialSubtotal(m), 0); }
// Monto consolidado de materiales de todos los proyectos (indicador del panel).
function allProjectsMaterialsTotal(){ return DB.projects.reduce((acc,p)=>acc+projectMaterialsTotal(p), 0); }
function money(n){
  return '$' + (Number(n)||0).toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2});
}

/* ===================== MATERIALES (ficha de proyecto) ===================== */
function materialsSectionHtml(p){
  const mats = ensureMaterials(p);
  const total = projectMaterialsTotal(p);
  const rows = mats.map(m=>`<tr>
    <td>${esc(m.type||'—')}</td>
    <td class="mono">${esc(String(m.qty??0))}</td>
    <td>${esc(m.unit||'—')}</td>
    <td>${esc(m.brand||'—')}</td>
    <td class="mono">${money(m.price)}</td>
    <td class="mono">${money(materialSubtotal(m))}</td>
    <td>${esc(m.notes||'—')}</td>
    <td style="white-space:nowrap;">
      <button class="btn btn-ghost btn-sm" onclick="openMaterialModal('${p.id}','${m.id}')">Editar</button>
      <button class="btn btn-ghost btn-sm" onclick="deleteMaterial('${p.id}','${m.id}')">Quitar</button>
    </td>
  </tr>`).join('');

  return `<div class="card" style="margin-bottom:16px;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
      <h3 style="font-size:13.5px;margin:0;">Cómputo de materiales ${mats.length?`<span style="font-weight:400;color:var(--ink-soft);font-size:12px;">(${mats.length} ítem${mats.length===1?'':'s'})</span>`:''}</h3>
      <button class="btn btn-ghost btn-sm" onclick="openMaterialModal('${p.id}')">+ Agregar material</button>
    </div>
    ${mats.length===0 ? '<div class="empty">Sin materiales cargados todavía.</div>' : `
      <table>
        <thead><tr><th>Tipo de material</th><th>Cantidad</th><th>Unidad</th><th>Marca</th><th>Precio ref.</th><th>Subtotal</th><th>Observaciones</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr>
          <td colspan="5" style="text-align:right;font-weight:700;">Total estimado</td>
          <td class="mono" style="font-weight:700;">${money(total)}</td>
          <td colspan="2"></td>
        </tr></tfoot>
      </table>`}
  </div>`;
}

function openMaterialModal(projectId, materialId){
  const p = DB.projects.find(x=>x.id===projectId);
  if(!p) return;
  ensureMaterials(p);
  const m = materialId ? p.materials.find(x=>x.id===materialId) : null;
  modal = { type:'material', projectId, materialId };
  renderModal(`
    <h2>${m?'Editar material':'Nuevo material'}</h2>
    <label class="field light"><span>Tipo de material</span><input id="mt-type" type="text" value="${esc(m?.type||'')}" placeholder="Ej.: Cemento de albañilería"></label>
    <div class="row3">
      <label class="field light"><span>Cantidad</span><input id="mt-qty" type="number" step="0.01" min="0" value="${m?.qty??''}"></label>
      <label class="field light"><span>Unidad</span>
        <select id="mt-unit">${MATERIAL_UNITS.map(u=>`<option value="${esc(u)}" ${m?.unit===u?'selected':''}>${esc(u)}</option>`).join('')}</select>
      </label>
      <label class="field light"><span>Precio de referencia</span><input id="mt-price" type="number" step="0.01" min="0" value="${m?.price??''}"></label>
    </div>
    <label class="field light"><span>Marca</span><input id="mt-brand" type="text" value="${esc(m?.brand||'')}"></label>
    <label class="field light"><span>Observaciones</span><textarea id="mt-notes" rows="2">${esc(m?.notes||'')}</textarea></label>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="saveMaterial('${projectId}','${materialId||''}')">Guardar</button>
    </div>`);
}

function saveMaterial(projectId, materialId){
  const p = DB.projects.find(x=>x.id===projectId);
  if(!p) return;
  ensureMaterials(p);
  const type = document.getElementById('mt-type').value.trim();
  if(!type){ toast('Poné el tipo de material'); return; }
  const data = {
    type,
    qty: parseFloat(document.getElementById('mt-qty').value)||0,
    unit: document.getElementById('mt-unit').value,
    brand: document.getElementById('mt-brand').value.trim(),
    price: parseFloat(document.getElementById('mt-price').value)||0,
    notes: document.getElementById('mt-notes').value.trim(),
  };
  const m = materialId ? p.materials.find(x=>x.id===materialId) : null;
  if(m){ Object.assign(m, data); logAudit('UPDATE','Material', `${p.code}: ${type}`); }
  else { p.materials.push({ id: uid(), ...data }); logAudit('CREATE','Material', `${p.code}: ${type}`); }
  persist(); closeModal(); render();
}

function deleteMaterial(projectId, materialId){
  const p = DB.projects.find(x=>x.id===projectId);
  if(!p) return;
  ensureMaterials(p);
  const m = p.materials.find(x=>x.id===materialId);
  if(!m) return;
  if(!confirm(`¿Quitar el material "${m.type}"?`)) return;
  p.materials = p.materials.filter(x=>x.id!==materialId);
  // Las compras que apuntaban a este material quedan sin vínculo, pero se conservan.
  ensurePurchases().forEach(pu=>{
    if(pu.materialId===materialId) pu.materialId = null;
    if(Array.isArray(pu.materialIds)) pu.materialIds = pu.materialIds.filter(id=>id!==materialId);
  });
  logAudit('DELETE','Material', `${p.code}: ${m.type}`);
  persist(); render();
}

/* ===================== COMPRAS ===================== */
function purchasesForProject(projectId){
  return ensurePurchases().filter(pu=>pu.projectId===projectId)
    .sort((a,b)=>(b.date||'').localeCompare(a.date||''));
}
function purchaseMaterialName(pu){
  const ids = pu.materialIds && pu.materialIds.length ? pu.materialIds : (pu.materialId ? [pu.materialId] : []);
  if(!ids.length) return pu.materialText || '—';
  const p = pu.projectId ? DB.projects.find(x=>x.id===pu.projectId) : null;
  if(!p) return pu.materialText || '—';
  const mats = ensureMaterials(p);
  const names = ids.map(id=>{ const m = mats.find(x=>x.id===id); return m ? m.type : null; }).filter(Boolean);
  return names.length ? names.join(', ') : (pu.materialText || '—');
}
// Devuelve los objetos de material completos (con cantidad/unidad/precio)
// vinculados a una compra, para el detalle del PDF de solicitud de compra.
function purchaseMaterialsDetailed(pu){
  const ids = pu.materialIds && pu.materialIds.length ? pu.materialIds : (pu.materialId ? [pu.materialId] : []);
  const p = pu.projectId ? DB.projects.find(x=>x.id===pu.projectId) : null;
  if(!p || !ids.length) return [];
  const mats = ensureMaterials(p);
  return ids.map(id=>mats.find(x=>x.id===id)).filter(Boolean);
}

// Compras dentro de la ficha del proyecto, enlazadas al cómputo de materiales.
function purchasesSectionHtml(p){
  const list = purchasesForProject(p.id);
  const rows = list.map(pu=>`<tr>
    <td>${esc(pu.supplier||'—')}</td>
    <td>${esc(purchaseMaterialName(pu))}</td>
    <td>${esc(pu.authorization||'—')}</td>
    <td>${esc(pu.date||'—')}</td>
    <td><span class="badge ${purchaseStatusBadgeClass(pu.status)}">${esc(purchaseStatusLabel(pu.status))}</span></td>
    <td>${esc(pu.responsible||'—')}</td>
    <td style="white-space:nowrap;">
      <button class="btn btn-ghost btn-sm" onclick="openPurchaseModal('${pu.id}','${p.id}')">Editar</button>
      <button class="btn btn-ghost btn-sm" onclick="printPurchase('${pu.id}')">Solicitud PDF</button>
      <button class="btn btn-ghost btn-sm" onclick="deletePurchase('${pu.id}')">Quitar</button>
    </td>
  </tr>`).join('');

  return `<div class="card" style="margin-bottom:16px;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
      <h3 style="font-size:13.5px;margin:0;">Compras del proyecto ${list.length?`<span style="font-weight:400;color:var(--ink-soft);font-size:12px;">(${list.length})</span>`:''}</h3>
      <button class="btn btn-ghost btn-sm" onclick="openPurchaseModal(null,'${p.id}')">+ Agregar compra</button>
    </div>
    ${list.length===0 ? '<div class="empty">Sin compras cargadas para este proyecto.</div>' : `
      <table>
        <thead><tr><th>Proveedor</th><th>Material</th><th>Autorización</th><th>Fecha</th><th>Estado</th><th>Responsable</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`}
  </div>`;
}

function openPurchaseModal(purchaseId, presetProjectId){
  ensurePurchases();
  const pu = purchaseId ? DB.purchases.find(x=>x.id===purchaseId) : null;
  const projectId = pu ? (pu.projectId||'') : (presetProjectId||'');
  modal = { type:'purchase', purchaseId };
  renderModal(`
    <h2>${pu?'Editar compra':'Nueva compra'}</h2>
    <label class="field light"><span>Proyecto asociado (opcional)</span>
      <select id="pu-project" onchange="refreshPurchaseMaterialOptions()">
        <option value="">Compra general (sin proyecto)</option>
        ${DB.projects.map(p=>`<option value="${p.id}" ${projectId===p.id?'selected':''}>${esc(p.code)} — ${esc(p.name)}</option>`).join('')}
      </select>
    </label>
    <div id="pu-material-wrap">${purchaseMaterialFieldHtml(projectId, pu)}</div>
    <div class="row2">
      <label class="field light"><span>Proveedor</span><input id="pu-supplier" type="text" value="${esc(pu?.supplier||'')}"></label>
      <label class="field light"><span>Autorización de compra</span><input id="pu-auth" type="text" value="${esc(pu?.authorization||'')}" placeholder="Ej.: Nota 12/2026"></label>
    </div>
    <div class="row3">
      <label class="field light"><span>Fecha</span><input id="pu-date" type="date" value="${esc(pu?.date||todayISO())}"></label>
      <label class="field light"><span>Estado</span>
        <select id="pu-status">${PURCHASE_STATUSES.map(s=>`<option value="${s}" ${pu?.status===s?'selected':''}>${purchaseStatusLabel(s)}</option>`).join('')}</select>
      </label>
      <label class="field light"><span>Responsable del área</span>
        <select id="pu-resp">
          <option value="">Sin asignar</option>
          ${allUserNames().map(u=>`<option value="${esc(u)}" ${pu?.responsible===u?'selected':''}>${esc(u)}</option>`).join('')}
        </select>
      </label>
    </div>
    <label class="field light"><span>Observaciones</span><textarea id="pu-notes" rows="2">${esc(pu?.notes||'')}</textarea></label>
    <label class="field light" style="margin-top:4px;"><span>Comprobantes / fotos de la compra</span>
      <div id="pu-files-wrap">${pu ? '' : '<div class="empty" style="margin:0;">Guardá la compra primero; después vas a poder subir comprobantes desde "Editar".</div>'}</div>
    </label>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="savePurchase('${purchaseId||''}')">Guardar</button>
    </div>`);
  if(pu) refreshPurchaseFiles(pu);
}

// Carpeta de Drive de los comprobantes de una compra: si está vinculada a un
// proyecto, cuelga de PROYECTOS/<proyecto>/COMPRAS/<id de la compra>; si es
// una compra general, de COMPRAS/<id de la compra>. Una subcarpeta por
// compra para no mezclar comprobantes de compras distintas.
function purchaseFolderPath(pu){
  const proj = pu.projectId ? DB.projects.find(x=>x.id===pu.projectId) : null;
  return proj ? ['PROYECTOS', projectFolderSegment(proj), 'COMPRAS', pu.id] : ['COMPRAS', pu.id];
}
// Repinta solo el gestor de archivos dentro del modal de la compra (el
// modal no se re-renderiza con el render() general de la página) y
// vuelve a conectar sus eventos, incluido después de cada subida/borrado.
function refreshPurchaseFiles(pu){
  const folderPath = purchaseFolderPath(pu);
  const storeKey = 'purchase:'+pu.id;
  const wrap = document.getElementById('pu-files-wrap');
  if(!wrap) return;
  wrap.innerHTML = renderFileManager({
    folderPath, storeKey, emptyMsg:'Sin comprobantes cargados.',
    refreshFnName:`refreshPurchaseFilesById('${pu.id}')`,
  });
  wireFileManagerEvents({ folderPath, storeKey, onDone: ()=>refreshPurchaseFiles(pu) });
}
function refreshPurchaseFilesById(id){
  const pu = DB.purchases.find(x=>x.id===id);
  if(pu) refreshPurchaseFiles(pu);
}

// Con proyecto elegido, el material se toma del cómputo de ese proyecto.
// Sin proyecto, se escribe libremente.
function purchaseMaterialFieldHtml(projectId, pu){
  const p = projectId ? DB.projects.find(x=>x.id===projectId) : null;
  if(!p){
    return `<label class="field light"><span>Material</span><input id="pu-material-text" type="text" value="${esc(pu?.materialText||'')}" placeholder="Ej.: Chapa acanalada C25"></label>`;
  }
  const mats = ensureMaterials(p);
  if(mats.length===0){
    return `<label class="field light"><span>Material</span><input id="pu-material-text" type="text" value="${esc(pu?.materialText||'')}" placeholder="El proyecto no tiene cómputo de materiales cargado"></label>`;
  }
  const selected = pu?.materialIds && pu.materialIds.length ? pu.materialIds : (pu?.materialId ? [pu.materialId] : []);
  return `<div class="field light"><span>Materiales del cómputo del proyecto (marcá uno o más)</span>
    <div id="pu-material-list" style="border:1px solid var(--line);border-radius:6px;max-height:170px;overflow-y:auto;padding:4px 10px;">
      ${mats.map(m=>`<label style="display:flex;align-items:center;gap:8px;padding:5px 0;font-size:13px;border-bottom:1px solid var(--line);">
        <input type="checkbox" value="${m.id}" ${selected.includes(m.id)?'checked':''}> ${esc(m.type)} — ${esc(String(m.qty??0))} ${esc(m.unit||'')}${m.price?' · '+money(m.price):''}
      </label>`).join('')}
    </div>
  </div>`;
}
function refreshPurchaseMaterialOptions(){
  const projectId = document.getElementById('pu-project').value;
  document.getElementById('pu-material-wrap').innerHTML = purchaseMaterialFieldHtml(projectId, null);
}

function savePurchase(purchaseId){
  ensurePurchases();
  const projectId = document.getElementById('pu-project').value || null;
  const matList = document.getElementById('pu-material-list');
  const matTextEl = document.getElementById('pu-material-text');
  const materialIds = matList ? Array.from(matList.querySelectorAll('input[type=checkbox]:checked')).map(c=>c.value) : [];
  const supplier = document.getElementById('pu-supplier').value.trim();
  if(!supplier){ toast('Poné el proveedor'); return; }
  const data = {
    projectId,
    materialIds,
    materialId: materialIds[0] || null, // compatibilidad con versiones anteriores
    materialText: matTextEl ? matTextEl.value.trim() : '',
    supplier,
    authorization: document.getElementById('pu-auth').value.trim(),
    date: document.getElementById('pu-date').value,
    status: document.getElementById('pu-status').value,
    responsible: document.getElementById('pu-resp').value,
    notes: document.getElementById('pu-notes').value.trim(),
  };
  const pu = purchaseId ? DB.purchases.find(x=>x.id===purchaseId) : null;
  let newId = null;
  if(pu){ Object.assign(pu, data); logAudit('UPDATE','Purchase', `${supplier}`); }
  else { newId = uid(); DB.purchases.push({ id: newId, ...data, createdAtISO: new Date().toISOString() }); logAudit('CREATE','Purchase', `${supplier}`); }
  persist(); closeModal(); render();
  // Si es una compra nueva, reabrimos directo en modo edición para poder
  // adjuntar comprobantes sin un paso extra (recién ahí existe el id que
  // se usa como subcarpeta de Drive).
  if(newId) openPurchaseModal(newId);
}

async function deletePurchase(purchaseId){
  ensurePurchases();
  const pu = DB.purchases.find(x=>x.id===purchaseId);
  if(!pu) return;
  const receipts = DB.files.filter(f=>f.storeKey==='purchase:'+purchaseId);
  const extra = receipts.length ? ` Se borran también sus ${receipts.length} comprobante(s) del servidor.` : '';
  if(!confirm(`¿Quitar la compra a \"${pu.supplier}\"?${extra}`)) return;
  try{
    await deleteStoredFiles(receipts);
  }catch(err){
    toast('No se pudieron borrar los comprobantes del servidor: ' + err.message, true);
    return;
  }
  DB.files = DB.files.filter(f=>f.storeKey!=='purchase:'+purchaseId);
  DB.purchases = DB.purchases.filter(x=>x.id!==purchaseId);
  logAudit('DELETE','Purchase', pu.supplier||'');
  persist(); render();
}

function setPurchaseStatus(purchaseId, status){
  ensurePurchases();
  const pu = DB.purchases.find(x=>x.id===purchaseId);
  if(!pu) return;
  const before = pu.status;
  pu.status = status;
  logAudit('STATUS_CHANGE','Purchase', `${pu.supplier}: ${before} → ${status}`);
  persist(); render();
}

/* ---- Sección general de Compras (incluye las de proyecto y las sueltas) ---- */
function renderPurchases(){
  ensurePurchases();
  const filterStatus = renderPurchases._filterStatus || '';
  const filterScope = renderPurchases._filterScope || '';
  let list = DB.purchases.slice().sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  if(filterStatus) list = list.filter(pu=>pu.status===filterStatus);
  if(filterScope==='GENERAL') list = list.filter(pu=>!pu.projectId);
  if(filterScope==='PROYECTO') list = list.filter(pu=>!!pu.projectId);

  const rows = list.map(pu=>{
    const proj = pu.projectId ? DB.projects.find(x=>x.id===pu.projectId) : null;
    return `<tr>
      <td>${esc(pu.supplier||'—')}</td>
      <td>${esc(purchaseMaterialName(pu))}</td>
      <td>${proj ? `<span class="link-tab" onclick="goRoute('projects'); openProjectDetail('${proj.id}')">${esc(proj.code)}</span>` : '<span style="color:var(--ink-soft);">General</span>'}</td>
      <td>${esc(pu.authorization||'—')}</td>
      <td>${esc(pu.date||'—')}</td>
      <td>
        <select onchange="setPurchaseStatus('${pu.id}', this.value)">
          ${PURCHASE_STATUSES.map(s=>`<option value="${s}" ${pu.status===s?'selected':''}>${purchaseStatusLabel(s)}</option>`).join('')}
        </select>
      </td>
      <td>${esc(pu.responsible||'—')}</td>
      <td style="white-space:nowrap;">
        <button class="btn btn-ghost btn-sm" onclick="openPurchaseModal('${pu.id}')">Editar</button>
        <button class="btn btn-ghost btn-sm" onclick="printPurchase('${pu.id}')">Solicitud PDF</button>
        <button class="btn btn-ghost btn-sm" onclick="deletePurchase('${pu.id}')">Quitar</button>
      </td>
    </tr>`;
  }).join('');

  const html = `
    <div class="toolbar">
      <div class="toolbar-left">
        <button class="btn btn-primary" onclick="openPurchaseModal(null)">+ Nueva compra</button>
        <select class="filter-select" onchange="renderPurchases._filterStatus=this.value; render();">
          <option value="">Todos los estados</option>
          ${PURCHASE_STATUSES.map(s=>`<option value="${s}" ${filterStatus===s?'selected':''}>${purchaseStatusLabel(s)}</option>`).join('')}
        </select>
        <select class="filter-select" onchange="renderPurchases._filterScope=this.value; render();">
          <option value="">Todas</option>
          <option value="PROYECTO" ${filterScope==='PROYECTO'?'selected':''}>De proyectos</option>
          <option value="GENERAL" ${filterScope==='GENERAL'?'selected':''}>Generales</option>
        </select>
      </div>
    </div>
    <div class="card">
      ${list.length===0 ? '<div class="empty">No hay compras cargadas.</div>' : `
        <table>
          <thead><tr><th>Proveedor</th><th>Material</th><th>Proyecto</th><th>Autorización</th><th>Fecha</th><th>Estado</th><th>Responsable</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>`}
    </div>
    <div id="print-purchase" class="print-area" style="display:none;"></div>`;
  renderShell(html, 'Compras', 'Compras de proyectos y compras generales. Las de proyecto se vinculan al cómputo de materiales.');
}

/* ---- Bloques para el informe PDF del proyecto (solo texto) ---- */
function materialsPrintSection(p){
  const mats = ensureMaterials(p);
  if(mats.length===0){
    return `<div class="print-section"><h3>Cómputo de materiales</h3><p class="print-obs">Sin materiales cargados.</p></div>`;
  }
  const rows = mats.map(m=>`<tr>
    <td>${esc(m.type)}</td><td>${esc(String(m.qty??0))}</td><td>${esc(m.unit||'—')}</td>
    <td>${esc(m.brand||'—')}</td><td>${money(m.price)}</td><td>${money(materialSubtotal(m))}</td><td>${esc(m.notes||'—')}</td>
  </tr>`).join('');
  return `<div class="print-section">
    <h3>Cómputo de materiales</h3>
    <table>
      <thead><tr><th>Tipo</th><th>Cant.</th><th>Unidad</th><th>Marca</th><th>Precio ref.</th><th>Subtotal</th><th>Observaciones</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><td colspan="5" style="text-align:right;font-weight:700;">Total estimado</td><td colspan="2" style="font-weight:700;">${money(projectMaterialsTotal(p))}</td></tr></tfoot>
    </table>
  </div>`;
}
function purchasesPrintSection(p){
  const list = purchasesForProject(p.id);
  if(list.length===0){
    return `<div class="print-section"><h3>Compras asociadas</h3><p class="print-obs">Sin compras registradas para este proyecto.</p></div>`;
  }
  const rows = list.map(pu=>`<tr>
    <td>${esc(pu.supplier||'—')}</td><td>${esc(purchaseMaterialName(pu))}</td>
    <td>${esc(pu.authorization||'—')}</td><td>${esc(pu.date||'—')}</td>
    <td>${esc(purchaseStatusLabel(pu.status))}</td><td>${esc(pu.responsible||'—')}</td>
  </tr>`).join('');
  return `<div class="print-section">
    <h3>Compras asociadas</h3>
    <table>
      <thead><tr><th>Proveedor</th><th>Material</th><th>Autorización</th><th>Fecha</th><th>Estado</th><th>Responsable</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

/* ===================== INDICADORES DEL PANEL ===================== */
// Barras horizontales reutilizables para las distribuciones.
function distBarsHtml(items, emptyMsg){
  const total = items.reduce((a,i)=>a+i.count, 0);
  if(total===0) return `<div class="empty">${emptyMsg}</div>`;
  return items.filter(i=>i.count>0).map(i=>`
    <div class="dist-row">
      <span class="dist-label" title="${esc(i.label)}">${esc(i.label)}</span>
      <span class="dist-track"><span class="dist-fill" style="width:${(i.count/total*100).toFixed(1)}%;background:${i.color||'var(--accent)'};"></span></span>
      <span class="dist-val mono">${i.count}</span>
    </div>`).join('');
}

// Necesidades por categoría: dónde se concentra la demanda.
function needsByCategoryHtml(){
  const counts = {};
  DB.needs.forEach(n=>{ const k = n.category || 'Sin categorizar'; counts[k] = (counts[k]||0)+1; });
  const items = Object.keys(counts)
    .map(k=>({ label:k, count:counts[k], color: k==='Sin categorizar' ? '#b98a2e' : 'var(--accent)' }))
    .sort((a,b)=>b.count-a.count).slice(0,8);
  return `<div class="card">
    <h3 style="font-size:13px;margin:0 0 8px;">Necesidades por categoría</h3>
    ${distBarsHtml(items, 'Sin necesidades cargadas.')}
  </div>`;
}

// Compras por estado.
function purchasesByStatusHtml(){
  ensurePurchases();
  const items = PURCHASE_STATUSES.map(s=>({
    label: purchaseStatusLabel(s),
    count: DB.purchases.filter(pu=>pu.status===s).length,
    color: PURCHASE_STATUS_COLORS[s],
  }));
  return `<div class="card">
    <h3 style="font-size:13px;margin:0 0 8px;">Compras por estado</h3>
    ${distBarsHtml(items, 'Sin compras cargadas.')}
  </div>`;
}

// Solicitudes (pedidos) agrupadas por responsable de área.
function requestsByResponsibleHtml(){
  const counts = {};
  DB.requests.forEach(r=>{ const k = r.receivedBy || 'Sin responsable'; counts[k] = (counts[k]||0)+1; });
  const items = Object.keys(counts)
    .map(k=>({ label:k, count:counts[k], color: k==='Sin responsable' ? '#b98a2e' : 'var(--accent)' }))
    .sort((a,b)=>b.count-a.count).slice(0,8);
  return `<div class="card">
    <h3 style="font-size:13px;margin:0 0 8px;">Solicitudes por responsable</h3>
    ${distBarsHtml(items, 'Sin solicitudes cargadas.')}
  </div>`;
}

// Avance porcentual de cada proyecto activo.
function activeProjectsProgressHtml(ongoing){
  if(!ongoing || ongoing.length===0){
    return `<div class="card"><h3 style="font-size:13px;margin:0 0 8px;">Avance de proyectos activos</h3><div class="empty">No hay proyectos activos.</div></div>`;
  }
  const rows = ongoing.slice().sort((a,b)=>(b.progress||0)-(a.progress||0)).slice(0,8).map(p=>`
    <div class="dist-row tap" onclick="goRoute('projects'); openProjectDetail('${p.id}')">
      <span class="dist-label" title="${esc(p.name)}"><span class="mono">${esc(p.code)}</span> ${esc(p.name)}</span>
      <span class="dist-track"><span class="dist-fill" style="width:${p.progress||0}%;"></span></span>
      <span class="dist-val mono">${p.progress||0}%</span>
    </div>`).join('');
  return `<div class="card">
    <h3 style="font-size:13px;margin:0 0 8px;">Avance de proyectos activos</h3>
    ${rows}
  </div>`;
}
