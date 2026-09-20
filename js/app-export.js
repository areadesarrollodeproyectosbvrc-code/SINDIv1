/* ============================================================
   EXPORTAR A EXCEL (.xlsx vía SheetJS) e IMPRIMIR / PDF (A4).
   Ambas funciones respetan los filtros aplicados en pantalla:
   reciben la lista de IDs actualmente visibles.
   ============================================================ */

function exportNeedsExcel(ids){
  const list = DB.needs.filter(n=>ids.includes(n.id));
  const rows = list.map(n=>{
    const proj = DB.projects.find(p=>p.id===n.projectId);
    return {
      'Código': n.code, 'Título': n.title||'', 'Descripción': n.description,
      'Dependencia': stationNameById(n.stationId),
      'Fecha': n.createdAt||'', 'Hora': n.createdAtTime||'',
      'Prioridad': n.priority, 'Estado': needStatusLabel(n.status),
      'Responsable': n.responsible||'', 'Proyecto asociado': proj?proj.code:'',
    };
  });
  exportRowsToXlsx(rows, 'Necesidades', 'SINDI_Necesidades.xlsx');
}
function exportProjectsExcel(ids){
  const list = DB.projects.filter(p=>ids.includes(p.id));
  const rows = list.map(p=>{
    const need = DB.needs.find(n=>n.id===p.needId);
    return {
      'Código': p.code, 'Nombre': p.name, 'Descripción': p.description||'',
      'Dependencia': stationNameById(p.stationId),
      'Estado': p.status, 'Prioridad': p.priority||'',
      'Fecha de creación': p.createdAt||'', 'Fecha prevista': p.dueDate||'',
      'Responsable': p.responsible||'', 'Necesidad de origen': need?need.code:'',
      'Avance (%)': p.progress||0,
    };
  });
  exportRowsToXlsx(rows, 'Proyectos', 'SINDI_Proyectos.xlsx');
}
function exportRowsToXlsx(rows, sheetName, fileName){
  if(typeof XLSX === 'undefined'){ toast('No se pudo cargar el módulo de Excel'); return; }
  if(rows.length===0){ toast('No hay filas para exportar'); return; }
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, fileName);
}

/* ---- IMPRIMIR / PDF A4 ---- */
function printTable(title, columns, rows, targetSelector){
  const target = document.querySelector(targetSelector);
  const today = new Date().toLocaleDateString('es-AR');
  target.innerHTML = `
    <div class="print-header">
      <div><h1>SINDI</h1><p>${esc(ORG_NAME)}</p></div>
      <div class="print-meta">Fecha de generación: ${today}</div>
    </div>
    <h2 style="font-size:13px;">${esc(title)}</h2>
    <table>
      <thead><tr>${columns.map(c=>`<th>${esc(c)}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(r=>`<tr>${r.map(v=>`<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody>
    </table>`;
  target.style.display = 'block';
  window.print();
  setTimeout(()=>{ target.style.display='none'; target.innerHTML=''; }, 500);
}
function printNeeds(ids){
  const list = DB.needs.filter(n=>ids.includes(n.id));
  const rows = list.map(n=>[n.code, n.title||n.description, stationNameById(n.stationId), n.priority, needStatusLabel(n.status), n.createdAt||'']);
  printTable('Necesidades', ['Código','Necesidad','Dependencia','Prioridad','Estado','Fecha'], rows, '#print-needs');
}
function printProjects(ids){
  const list = DB.projects.filter(p=>ids.includes(p.id));
  const rows = list.map(p=>[p.code, p.name, stationNameById(p.stationId), p.status, p.priority||'', (p.progress||0)+'%', p.dueDate||'']);
  printTable('Proyectos', ['Código','Nombre','Dependencia','Estado','Prioridad','Avance','Fecha prevista'], rows, '#print-projects');
}

/* ---- INFORME PDF DE RELEVAMIENTO (ficha completa: datos, relevamiento,
   instalaciones, patologías con sus fotos, fotos generales y documentación).
   Se arma en el momento con lo que ya existe en la ficha del espacio:
   no se guarda ni duplica información en una base aparte. A4, multipágina
   automática (ver .print-area / @page en css/styles.css). */
function printSpace(spaceId){
  const s = DB.spaces.find(x=>x.id===spaceId);
  if(!s) return;
  ensureSpaceInstallations(s);
  const station = DB.stations.find(st=>st.id===s.stationId);
  const today = new Date().toLocaleDateString('es-AR');
  const generatedBy = session ? session.name : 'Sistema';
  const target = document.querySelector('#print-space');

  const surveyRows = SPACE_ITEMS.survey
    .map(it=>`<tr><td style="width:38%;"><strong>${esc(it.label)}</strong></td><td>${esc(s.survey[it.id]||'—')}</td></tr>`).join('');

  const instRows = INSTALLATION_TYPES.map(t=>{
    const item = s.installations[t.key];
    return `<tr><td><strong>${esc(t.label)}</strong></td><td>${item.checked?'Sí':'No'}</td><td>${esc(installationStateLabel(item.state))}</td><td>${esc(item.notes||'—')}</td></tr>`;
  }).join('');

  const pathBlocks = s.pathologies.length===0 ? '<div class="empty" style="font-size:11px;">Sin patologías cargadas.</div>' :
    s.pathologies.map(p=>`
      <div style="margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid #ddd;">
        <div style="font-size:11px;"><strong>${esc(p.category)}</strong> — Gravedad: ${esc(p.severity)}</div>
        <div style="font-size:10.5px;color:#333;margin:2px 0 4px;">${esc(p.description)}</div>
        ${(p.photos&&p.photos.length) ? printPhotoGallery(p.photos) : ''}
      </div>`).join('');

  const generalPhotosHtml = (s.generalPhotos && s.generalPhotos.length)
    ? printPhotoGallery(s.generalPhotos)
    : '<div class="empty" style="font-size:11px;">Sin fotografías generales cargadas.</div>';

  // Documentación asociada: archivos del gestor documental relacionados a este espacio
  // (por dependencia) y a las necesidades/proyectos que se originaron desde acá.
  const relatedNeeds = DB.needs.filter(n=>n.spaceId===s.id);
  const relatedProjects = relatedNeeds.map(n=>DB.projects.find(p=>p.needId===n.id)).filter(Boolean);
  const docRows = relatedNeeds.length===0 && relatedProjects.length===0
    ? '<tr><td colspan="2">Sin necesidades ni proyectos asociados a este espacio.</td></tr>'
    : [
        ...relatedNeeds.map(n=>`<tr><td>Necesidad ${esc(n.code)}</td><td>${esc(n.title||n.description)} — ${esc(needStatusLabel(n.status))}</td></tr>`),
        ...relatedProjects.map(p=>`<tr><td>Proyecto ${esc(p.code)}</td><td>${esc(p.name)} — ${esc(p.status)}</td></tr>`),
      ].join('');

  target.innerHTML = `
    <div class="print-header">
      <div><h1>SINDI</h1><p>${esc(ORG_NAME)} — Sistema Integral de Necesidades y Diagnóstico de Infraestructura</p></div>
      <div class="print-meta">Generado: ${today}<br>Por: ${esc(generatedBy)}</div>
    </div>
    <div class="print-section">
      <h2>${esc(s.name)} <span style="font-weight:400;color:#5b6169;">(${esc(s.cue)})</span></h2>
      <table class="print-kv">
        <tr><td>Código / CUE</td><td>${esc(s.cue)}</td></tr>
        <tr><td>Dependencia</td><td>${esc(station?.name||'—')}</td></tr>
        <tr><td>Nivel</td><td>${esc(spaceLevelLabel(s.level))}</td></tr>
        <tr><td>Tipo de superficie</td><td>${esc(s.surfaceType)}</td></tr>
        <tr><td>Superficie</td><td>${m2(s.surfaceM2)} m²</td></tr>
      </table>
    </div>
    <div class="print-section">
      <h3>Relevamiento</h3>
      <table>${surveyRows}</table>
      ${s.survey.observations ? `<p class="print-obs"><strong>Observaciones:</strong> ${esc(s.survey.observations)}</p>` : ''}
    </div>
    <div class="print-section">
      <h3>Instalaciones</h3>
      <table>
        <thead><tr><th>Instalación</th><th>Relevada</th><th>Estado</th><th>Observaciones</th></tr></thead>
        <tbody>${instRows}</tbody>
      </table>
    </div>
    <div class="print-section">
      <h3>Patologías</h3>
      ${pathBlocks}
    </div>
    <div class="print-section">
      <h3>Fotografías generales del relevamiento</h3>
      ${generalPhotosHtml}
    </div>
    <div class="print-section">
      <h3>Documentación asociada</h3>
      <table><thead><tr><th>Registro</th><th>Detalle</th></tr></thead><tbody>${docRows}</tbody></table>
    </div>
    <div class="print-footer">SINDI — ${esc(s.cue)} · ${esc(s.name)} · Generado ${today}</div>`;
  target.style.display = 'block';
  // Las fotos de Patologías/Relevamiento se cargan desde una URL externa
  // (Drive), no están embebidas en el HTML: si se llama a window.print()
  // apenas se pisa el innerHTML, el navegador a veces imprime antes de que
  // esas imágenes terminen de bajar y quedan en blanco. Por eso esperamos
  // a que carguen (o al menos 6s) antes de disparar la impresión.
  waitForImages(target, 6000).then(()=>{
    window.print();
    setTimeout(()=>{ target.style.display='none'; target.innerHTML=''; }, 500);
  });
}
// Espera a que todas las <img> dentro de un contenedor terminen de cargar
// (o fallen) antes de seguir, con un techo de tiempo para no colgar la
// impresión si alguna imagen no responde. Se usa antes de window.print()
// en cualquier informe que incluya fotos cargadas desde Drive/servidor.
function waitForImages(container, timeoutMs){
  const imgs = Array.from(container.querySelectorAll('img'));
  if(imgs.length===0) return Promise.resolve();
  const loaders = imgs.map(img => img.complete ? Promise.resolve() : new Promise(res=>{
    img.addEventListener('load', res, {once:true});
    img.addEventListener('error', res, {once:true});
  }));
  return Promise.race([
    Promise.all(loaders),
    new Promise(res=>setTimeout(res, timeoutMs||6000)),
  ]);
}
// Galería compacta de fotos para el PDF: varias por fila, sin separar la
// imagen de su descripción, para no desperdiciar superficie de la hoja A4.
function printPhotoGallery(photos){
  return `<div class="print-photo-grid">
    ${photos.map(ph=>`
      <div class="print-photo">
        <img src="${esc(ph.url)}" alt="${esc(ph.name)}">
        <div class="print-photo-cap">${esc(ph.name)}${ph.uploadedAt?' · '+new Date(ph.uploadedAt).toLocaleDateString('es-AR'):''}</div>
      </div>`).join('')}
  </div>`;
}

/* ---- INFORME PDF DE PROYECTO (para elevar a Jefatura el avance) ----
   Mismo formato A4 / mismos bloques (.print-header, .print-section,
   .print-kv, .print-footer) que el informe de relevamiento, pero solo
   con los datos de texto ya cargados en la ficha: sin fotos ni archivos
   adjuntos, para que el foco quede en el estado y el proceso del proyecto. */
function printProject(projectId){
  const p = DB.projects.find(x=>x.id===projectId);
  if(!p) return;
  const today = new Date().toLocaleDateString('es-AR');
  const generatedBy = session ? session.name : 'Sistema';
  const target = document.querySelector('#print-project');
  const need = p.needId ? DB.needs.find(n=>n.id===p.needId) : null;
  const request = requestForProject(p);
  const tasks = DB.tasks.filter(t=>t.projectId===p.id).sort((a,b)=>(a.date||'').localeCompare(b.date||''));
  const doneCount = tasks.filter(t=>t.status==='COMPLETADA').length;

  const origen = need ? `Necesidad ${need.code}` : request ? `Pedido del ${request.date}` : 'Carga directa';
  const taskRows = tasks.length===0 ? '<tr><td colspan="4">Sin tareas cargadas para este proyecto.</td></tr>' :
    tasks.map(t=>`<tr><td>${esc(t.description)}</td><td>${esc(taskStatusLabel(t.status))}</td><td>${esc(t.date||'—')}</td><td>${esc(t.responsible||'—')}</td><td>${esc(taskNeedLabel(t)||'—')}</td></tr>`).join('');

  target.innerHTML = `
    <div class="print-header">
      <div><h1>SINDI</h1><p>${esc(ORG_NAME)} — Informe de avance de proyecto</p></div>
      <div class="print-meta">Generado: ${today}<br>Por: ${esc(generatedBy)}</div>
    </div>
    <div class="print-section">
      <h2>${esc(p.name)} <span style="font-weight:400;color:#5b6169;">(${esc(p.code)})</span></h2>
      <table class="print-kv">
        <tr><td>Estado</td><td>${esc(p.status)}</td></tr>
        <tr><td>Prioridad</td><td>${esc(p.priority||'—')}</td></tr>
        <tr><td>Avance</td><td>${p.progress||0}%</td></tr>
        <tr><td>Dependencia</td><td>${esc(stationNameById(p.stationId))}</td></tr>
        <tr><td>Espacio relevado</td><td>${esc(projectSpaceName(p))}</td></tr>
        <tr><td>Responsable</td><td>${esc(p.responsible||'—')}</td></tr>
        <tr><td>Fecha de creación</td><td>${esc(p.createdAt||'—')}</td></tr>
        <tr><td>Fecha prevista</td><td>${esc(p.dueDate||'—')}</td></tr>
        <tr><td>Inversión</td><td>${formatInvestment(p.investment)}</td></tr>
        <tr><td>Origen</td><td>${esc(origen)}</td></tr>
      </table>
    </div>
    <div class="print-section">
      <h3>Descripción</h3>
      <p class="print-obs">${esc(p.description||'Sin descripción cargada.')}</p>
    </div>
    <div class="print-section">
      <h3>Observaciones</h3>
      <p class="print-obs">${esc(p.observations||'Sin observaciones cargadas.')}</p>
    </div>
    ${projectNeedsPrintSection(p)}
    <div class="print-section">
      <h3>Tareas del proyecto (${doneCount}/${tasks.length} completadas)</h3>
      <table>
        <thead><tr><th>Tarea</th><th>Estado</th><th>Fecha</th><th>Responsable</th><th>Necesidad</th></tr></thead>
        <tbody>${taskRows}</tbody>
      </table>
    </div>
    ${milestonesPrintSection(p)}
    ${materialsPrintSection(p)}
    ${purchasesPrintSection(p)}
    <div class="print-footer">SINDI — ${esc(p.code)} · ${esc(p.name)} · Generado ${today}</div>`;
  target.style.display = 'block';
  window.print();
  setTimeout(()=>{ target.style.display='none'; target.innerHTML=''; }, 500);
}

/* ---- Necesidades vinculadas al proyecto, para el informe PDF ---- */
function projectNeedsPrintSection(p){
  const needs = (typeof needsForProject === 'function') ? needsForProject(p.id) : [];
  if(needs.length===0){
    return `<div class="print-section"><h3>Necesidades</h3><p class="print-obs">Sin necesidades vinculadas.</p></div>`;
  }
  const rows = needs.map(n=>`<tr>
    <td>${esc(n.code||'—')}</td><td>${esc(n.title||n.description||'—')}</td>
    <td>${esc(n.category||'Sin categoría')}</td><td>${esc(n.priority||'—')}</td>
    <td>${esc(needStatusLabel(n.status))}</td>
  </tr>`).join('');
  return `<div class="print-section">
    <h3>Necesidades</h3>
    <table>
      <thead><tr><th>Código</th><th>Necesidad</th><th>Categoría</th><th>Prioridad</th><th>Estado</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}
