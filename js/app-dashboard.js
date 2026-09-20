/* ============================================================
   PANEL GENERAL (INICIO) — estilo "sala de control".

   Criterios de diseño:
   - En escritorio TODO el panel entra en una sola pantalla, sin
     scroll (ver css/dashboard.css). Cada marcador muestra solo el
     dato más relevante; el detalle está en su sección.
   - Cada marcador es tocable y lleva a su sección específica.
   - Colores con significado fijo en el calendario:
       CELESTE = eventos (incluye mantenimiento) · ÁMBAR = tareas.
   - Si una lista no entra en el alto disponible, hudFit() oculta
     las filas que sobran (nunca las corta a la mitad).
   ============================================================ */

const HUD_STATUS = {
  BORRADOR:      { label:'Borrador',      color:'#8395a6' },
  EN_DESARROLLO: { label:'En desarrollo', color:'#7aa2ff' },
  EN_EVALUACION: { label:'En evaluación', color:'#a08bff' },
  OBSERVADO:     { label:'Observado',     color:'#ffb02e' },
  APROBADO:      { label:'Aprobado',      color:'#38d996' },
  EN_EJECUCION:  { label:'En ejecución',  color:'#ff7a59' },
  FINALIZADO:    { label:'Finalizado',    color:'#2fbfb0' },
  CANCELADO:     { label:'Cancelado',     color:'#5f6b78' },
};
const HUD_PURCHASE = {
  PENDIENTE:  { short:'Pend.',  color:'#ffb02e' },
  AUTORIZADA: { short:'Autor.', color:'#7aa2ff' },
  COMPRADA:   { short:'Compr.', color:'#a08bff' },
  RECIBIDA:   { short:'Recib.', color:'#38d996' },
};
const HUD_ACTION = { CREATE:'ALTA', UPDATE:'MOD', DELETE:'BAJA', STATUS_CHANGE:'ESTADO', UPLOAD:'CARGA', DEACTIVATE:'BAJA' };
const HUD_ENTITY = {
  Need:'Necesidad', Project:'Proyecto', Task:'Tarea', Event:'Evento', Space:'Espacio', Station:'Dependencia',
  Request:'Pedido', Purchase:'Compra', Maintenance:'Mantenimiento', Milestone:'Hito', Material:'Material',
  Pathology:'Patología', File:'Archivo', User:'Usuario',
};
const HUD_MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const HUD_MONTHS_SHORT = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'];

/* ---- utilidades ---- */
function hudInt(n){ return Math.round(Number(n)||0).toLocaleString('es-AR'); }
function hudMoney(n){
  const v = Number(n)||0;
  if(v >= 1e6) return '$' + (v/1e6).toLocaleString('es-AR', { maximumFractionDigits: v >= 1e8 ? 0 : 1 }) + ' M';
  if(v >= 1e3) return '$' + Math.round(v/1e3).toLocaleString('es-AR') + ' mil';
  return '$' + Math.round(v).toLocaleString('es-AR');
}
function hudIso(d){ // fecha local YYYY-MM-DD (no UTC)
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}
function hudAgo(key){
  const t = new Date(key).getTime();
  if(isNaN(t)) return '';
  const m = Math.max(0, Math.round((Date.now()-t)/60000));
  if(m < 1) return 'ahora';
  if(m < 60) return m + ' min';
  const h = Math.round(m/60);
  if(h < 24) return h + ' h';
  const d = Math.round(h/24);
  if(d < 30) return d + ' d';
  return Math.round(d/30) + ' mes';
}
function hudFirstName(n){ return String(n||'').trim().split(/\s+/)[0] || '—'; }
function hudEmpty(msg, ok){ return `<div class="hp-empty ${ok?'ok':''}">${esc(msg)}</div>`; }

function hudPanelHead(title, meta, go){
  const inner = `<i class="led"></i><span class="hp-t">${esc(title)}</span>${meta ? `<span class="hp-meta">${meta}</span>` : ''}${go ? '<span class="hp-chev" aria-hidden="true">›</span>' : ''}`;
  return go
    ? `<button type="button" class="hp-h hb" onclick="${go}">${inner}</button>`
    : `<div class="hp-h">${inner}</div>`;
}

/* Barras horizontales (cada fila es tocable si trae "go"). */
function hudBars(items){
  const max = Math.max(1, ...items.map(i=>i.count));
  return items.map(i=>{
    const inner = `<span class="br-l" title="${esc(i.label)}">${esc(i.label)}</span>
      <span class="br-t"><i style="width:${Math.max(6, i.count/max*100).toFixed(0)}%;background:${i.color}"></i></span>
      <b class="br-v">${i.count}</b>`;
    return i.go ? `<button type="button" class="br hb" onclick="${i.go}">${inner}</button>` : `<div class="br">${inner}</div>`;
  }).join('');
}

/* ============================================================
   CALENDARIO: eventos (celeste) y tareas (ámbar)
   ============================================================ */
let dashCal = { y:null, m:null, sel:null };
function dashCalEnsure(){
  if(dashCal.y == null){ const n = new Date(); dashCal.y = n.getFullYear(); dashCal.m = n.getMonth(); }
}
function dashCalMove(delta){
  dashCalEnsure();
  const d = new Date(dashCal.y, dashCal.m + delta, 1);
  dashCal.y = d.getFullYear(); dashCal.m = d.getMonth(); dashCal.sel = null;
  dashCalRefresh();
}
function dashCalToday(){ const n = new Date(); dashCal = { y:n.getFullYear(), m:n.getMonth(), sel:null }; dashCalRefresh(); }
function dashCalPick(iso){ dashCal.sel = (dashCal.sel === iso) ? null : iso; dashCalRefresh(); }
function dashCalRefresh(){
  const el = document.getElementById('hud-cal');
  if(!el){ render(); return; }
  el.outerHTML = hudCalendarHtml();
  hudFit();
}

// Todo lo que va al calendario, con su tipo y la sección a la que lleva.
function hudCalendarItems(){
  const out = [];
  const events = DB.events || [];
  const maint = DB.maintenance || [];
  const maintLinked = new Set(maint.map(m=>m.linkedEventId).filter(Boolean));
  events.forEach(e=>{
    if(!e.date) return;
    out.push({ kind:'event', date:e.date, time:e.time||'', title:e.title||'Evento', go: maintLinked.has(e.id) ? 'maintenance' : 'events' });
  });
  // Mantenimiento sin evento enlazado: se incluye igual para no perder su fecha.
  maint.forEach(m=>{
    const linked = m.linkedEventId && events.some(e=>e.id===m.linkedEventId);
    if(!linked) out.push({ kind:'event', date:computeNextDue(m), time:'', title:'Mantenimiento: ' + (m.title||''), go:'maintenance' });
  });
  (DB.tasks || []).forEach(t=>{
    if(t.status === 'COMPLETADA') return;
    out.push({ kind:'task', date:t.date||'', time:'', title:t.description||'Tarea', go:'tasks' });
  });
  return out;
}

function hudAgendaRow(it, today){
  const overdue = it.kind === 'task' && it.date && it.date < today;
  let d = '<b>S/F</b>', m = '';
  if(it.date){
    const dt = new Date(it.date + 'T00:00:00');
    d = `<b>${dt.getDate()}</b>`; m = `<i>${HUD_MONTHS_SHORT[dt.getMonth()]}</i>`;
  }
  const kindLabel = overdue ? 'VENCIDA' : (it.kind === 'event' ? 'EVENTO' : 'TAREA');
  return `<button type="button" class="ag hb ${it.kind==='event'?'ev':'tk'} ${overdue?'od':''}" onclick="goRoute('${it.go}')" title="${esc(it.title)}">
    <span class="ag-d">${d}${m}</span>
    <span class="ag-t">${it.time ? `<em>${esc(it.time)}</em> ` : ''}${esc(it.title)}</span>
    <span class="ag-k">${kindLabel}</span>
  </button>`;
}

function hudCalendarHtml(){
  dashCalEnsure();
  const { y, m, sel } = dashCal;
  const now = new Date();
  const today = hudIso(now);
  const items = hudCalendarItems();

  // día → { ev, tk } para marcar las celdas
  const byDay = {};
  items.forEach(it=>{
    if(!it.date) return;
    const b = byDay[it.date] || (byDay[it.date] = { ev:0, tk:0 });
    if(it.kind === 'event') b.ev++; else b.tk++;
  });
  const monthPrefix = y + '-' + String(m+1).padStart(2,'0') + '-';
  let evMonth = 0, tkMonth = 0;
  Object.keys(byDay).forEach(k=>{ if(k.startsWith(monthPrefix)){ evMonth += byDay[k].ev; tkMonth += byDay[k].tk; } });

  const first = (new Date(y, m, 1).getDay() + 6) % 7; // lunes = 0
  const days = new Date(y, m+1, 0).getDate();
  let cells = '';
  for(let i=0;i<first;i++) cells += '<span class="cd blank"></span>';
  for(let d=1; d<=days; d++){
    const iso = monthPrefix + String(d).padStart(2,'0');
    const b = byDay[iso];
    const cls = ['cd', iso===today?'today':'', iso===sel?'sel':'', b&&b.ev?'has-ev':'', b&&b.tk?'has-tk':''].join(' ');
    const marks = b ? `<span class="mk">${b.ev?'<i class="mk-ev"></i>':''}${b.tk?'<i class="mk-tk"></i>':''}</span>` : '';
    const label = `${d} de ${HUD_MONTHS[m]}` + (b ? `: ${b.ev} evento(s), ${b.tk} tarea(s)` : '');
    cells += `<button type="button" class="${cls}" onclick="dashCalPick('${iso}')" aria-label="${label}"><span class="cd-n">${d}</span>${marks}</button>`;
  }

  // agenda: el día elegido, o lo que viene
  let agendaHead, agendaRows;
  if(sel){
    const dt = new Date(sel + 'T00:00:00');
    const list = items.filter(it=>it.date === sel).sort((a,b)=>(a.time||'').localeCompare(b.time||''));
    agendaHead = `${dt.getDate()} ${HUD_MONTHS_SHORT[dt.getMonth()]} · ${list.length}`;
    agendaRows = list.length ? list.map(it=>hudAgendaRow(it, today)).join('') : hudEmpty('Sin actividad este día');
  } else {
    const list = items
      .filter(it=> it.kind === 'task' || it.date >= today)
      .sort((a,b)=>{
        if(!a.date && !b.date) return 0;
        if(!a.date) return 1;
        if(!b.date) return -1;
        return (a.date + (a.time||'')).localeCompare(b.date + (b.time||''));
      });
    agendaHead = 'Próximos';
    agendaRows = list.length ? list.slice(0, 12).map(it=>hudAgendaRow(it, today)).join('') : hudEmpty('Sin eventos ni tareas pendientes', true);
  }
  const isCurrent = (y === now.getFullYear() && m === now.getMonth());

  return `<section class="hp hp-cal" id="hud-cal">
    <div class="hp-h">
      <i class="led"></i><span class="hp-t">Calendario</span>
      <span class="cal-nav">
        <button type="button" class="cal-btn" onclick="dashCalMove(-1)" aria-label="Mes anterior">‹</button>
        <button type="button" class="cal-mo ${isCurrent&&!sel?'':'link'}" onclick="dashCalToday()" aria-label="Volver a hoy">${HUD_MONTHS_SHORT[m]} ${y}</button>
        <button type="button" class="cal-btn" onclick="dashCalMove(1)" aria-label="Mes siguiente">›</button>
      </span>
    </div>
    <div class="cal-wd">${['L','M','M','J','V','S','D'].map(w=>`<span>${w}</span>`).join('')}</div>
    <div class="cal-g">${cells}</div>
    <div class="cal-lg">
      <span><i class="sq ev"></i>Eventos <b>${evMonth}</b></span>
      <span><i class="sq tk"></i>Tareas <b>${tkMonth}</b></span>
    </div>
    <div class="ag-h"><span>${agendaHead}</span>${sel ? '<button type="button" class="ag-x" onclick="dashCalPick(dashCal.sel)" aria-label="Quitar día">×</button>' : ''}</div>
    <div class="hp-fit">${agendaRows}</div>
  </section>`;
}

/* ============================================================
   AJUSTE DE LISTAS AL ALTO DISPONIBLE
   ============================================================ */
function hudFit(){
  document.querySelectorAll('.hud .hp-fit').forEach(box=>{
    const kids = Array.from(box.children);
    kids.forEach(k=>k.classList.remove('fit-hide'));
    let i = kids.length - 1;
    while(i > 0 && box.scrollHeight > box.clientHeight + 1){
      kids[i].classList.add('fit-hide');
      i--;
    }
  });
}
let hudFitBound = false;
function hudBindFit(){
  if(hudFitBound) return;
  hudFitBound = true;
  let t = null;
  window.addEventListener('resize', ()=>{ clearTimeout(t); t = setTimeout(hudFit, 80); });
  window.addEventListener('orientationchange', ()=>{ setTimeout(hudFit, 250); });
}

/* ============================================================
   ACCESOS
   ============================================================ */
function hudNeedCat(enc){ renderNeeds._filterCategory = decodeURIComponent(enc); goRoute('needs'); }

/* ============================================================
   RENDER
   ============================================================ */
function hudTile(o){
  return `<button type="button" class="tile tone-${o.tone||'info'}" onclick="${o.go}" title="${esc(o.title||o.label)}">
    <span class="tile-v">${o.value}${o.unit?`<i>${o.unit}</i>`:''}${o.sub||''}</span>
    <span class="tile-l">${esc(o.label)}</span>
    ${o.extra||''}
  </button>`;
}

function renderDashboard(){
  const totals = computeSurfaceTotals();
  const activeSpaces = DB.spaces.filter(s=>s.active!==false);
  const closedNeed = n => n.status==='SOLUCIONADO' || n.status==='CONVERTIDO_EN_PROYECTO';
  const openNeeds = DB.needs.filter(n=>!closedNeed(n));
  const criticalNeeds = openNeeds.filter(n=>n.priority==='ALTA');
  const ongoing = DB.projects.filter(p=>p.status!=='FINALIZADO' && p.status!=='CANCELADO');
  const today = hudIso(new Date());

  ensurePurchases();
  const overduePurchases = DB.purchases.filter(pu=>pu.status==='PENDIENTE' && pu.date && pu.date < today);
  const uncategorizedNeeds = DB.needs.filter(n=>!n.category);
  const pendingTasks = DB.tasks.filter(t=>t.status!=='COMPLETADA');
  const overdueTasks = pendingTasks.filter(t=>t.date && t.date < today);
  const pendingRequests = DB.requests.filter(r=>!r.projectId && !r.resolved);
  const attention = overduePurchases.length + uncategorizedNeeds.length + overdueTasks.length;

  /* ---------- RIEL SUPERIOR: atención + estado ---------- */
  const attnTiles = [
    hudTile({ label:'Compras vencidas', value:overduePurchases.length, tone:overduePurchases.length?'alert':'ok', go:"goRoute('purchases')", title:'Compras pendientes con fecha vencida' }),
    hudTile({ label:'Nec. sin categ.', value:uncategorizedNeeds.length, tone:uncategorizedNeeds.length?'warn':'ok', go:"renderNeeds._filterCategory='__SIN__'; goRoute('needs')", title:'Necesidades sin categorizar' }),
    hudTile({ label:'Tareas vencidas', value:overdueTasks.length, tone:overdueTasks.length?'alert':'ok', go:"goRoute('tasks')", title:'Tareas pendientes con fecha vencida' }),
  ].join('');

  const tot = totals.total || 0;
  const seg = (v, c) => `<i style="flex:${tot ? Math.max(v, 0.0001) : 1};background:${c}"></i>`;
  const surfaceExtra = `<span class="tile-seg" aria-hidden="true">${seg(totals.CUBIERTA,'#4cc9ff')}${seg(totals.SEMICUBIERTA,'#2f8db5')}${seg(totals.DESCUBIERTA,'#31566b')}</span>
    <span class="tile-split">Cub. ${hudInt(totals.CUBIERTA)} · Semi ${hudInt(totals.SEMICUBIERTA)} · Desc. ${hudInt(totals.DESCUBIERTA)}</span>`;

  const stateTiles = [
    hudTile({ label:'Proyectos activos', value:ongoing.length, go:"goRoute('projects')", title:'Proyectos en curso' }),
    hudTile({ label:'Nec. abiertas', value:openNeeds.length, go:"renderNeeds._filterCategory=''; goRoute('needs')", title:'Necesidades abiertas' + (criticalNeeds.length ? ` (${criticalNeeds.length} críticas)` : ''),
      sub: criticalNeeds.length ? `<em class="tile-sub">${criticalNeeds.length} crít.</em>` : '' }),
    hudTile({ label:'Pedidos pend.', value:pendingRequests.length, go:"goRoute('requests')", title:'Pedidos aún sin proyecto' }),
    hudTile({ label:'Espacios', value:activeSpaces.length, go:"goRoute('spaces')", title:'Espacios relevados' }),
    hudTile({ label:'Superficie total', value:hudInt(tot), unit:'m²', go:"goRoute('spaces')", extra:surfaceExtra,
      title:`Cubierta ${m2(totals.CUBIERTA)} · Semicubierta ${m2(totals.SEMICUBIERTA)} · Descubierta ${m2(totals.DESCUBIERTA)} m²` }),
    hudTile({ label:'Materiales', value:hudMoney(allProjectsMaterialsTotal()), go:"goRoute('purchases')", title:'Materiales consolidados de los proyectos' }),
  ].join('');

  const rail = `<div class="rail">
    <section class="hp rg ${attention?'rg-alert':''}">
      <div class="rg-h"><i class="led ${attention?'red':'grn'}"></i><span>Atención</span><b>${attention}</b></div>
      <div class="tiles" style="--n:3">${attnTiles}</div>
    </section>
    <section class="hp rg">
      <div class="rg-h"><i class="led"></i><span>Estado general</span></div>
      <div class="tiles" style="--n:6">${stateTiles}</div>
    </section>
  </div>`;

  /* ---------- DEPENDENCIAS ---------- */
  const depRows = DB.stations.map(st=>{
    const sm = stationSurfaceTotal(st.id);
    const share = tot ? Math.max(3, sm/tot*100) : 0;
    const img = st.planImage && st.planImage.url ? `<img src="${esc(st.planImage.url)}" alt="" loading="lazy">` : '<span class="dep-ph"></span>';
    return `<button type="button" class="dep hb" onclick="goRoute('stations'); openStationDetail('${st.id}')">
      ${img}
      <span class="dep-b"><span class="dep-n">${esc(st.name)}</span><span class="dep-bar"><i style="width:${share.toFixed(0)}%"></i></span></span>
      <span class="dep-m">${hudInt(sm)}<i>m²</i></span>
    </button>`;
  }).join('');
  const dep = `<section class="hp hp-dep">
    ${hudPanelHead('Dependencias', DB.stations.length, "goRoute('stations')")}
    <div class="hp-fit">${depRows || hudEmpty('Todavía no hay dependencias.')}</div>
  </section>`;

  /* ---------- PROYECTOS EN CURSO ---------- */
  const counts = {};
  DB.projects.forEach(p=>{ counts[p.status] = (counts[p.status]||0) + 1; });
  const present = PROJECT_STATUSES.filter(st=>counts[st] > 0);
  const stackBar = present.map(st=>`<i style="flex:${counts[st]};background:${(HUD_STATUS[st]||{}).color||'#888'}" title="${esc((HUD_STATUS[st]||{}).label||st)}: ${counts[st]}"></i>`).join('');
  const legend = present.map(st=>`<span class="lgd"><i style="background:${(HUD_STATUS[st]||{}).color||'#888'}"></i>${esc((HUD_STATUS[st]||{}).label||st)} <b>${counts[st]}</b></span>`).join('');
  const prioRank = p => p.priority==='ALTA' ? 0 : p.priority==='MEDIA' ? 1 : 2;
  const projRows = ongoing.slice()
    .sort((a,b)=> prioRank(a)-prioRank(b) || (b.progress||0)-(a.progress||0))
    .map(p=>{
      const c = (HUD_STATUS[p.status]||{}).color || '#888';
      const pr = Math.max(0, Math.min(100, Number(p.progress)||0));
      const st = (HUD_STATUS[p.status]||{}).label || p.status;
      return `<button type="button" class="pr hb" style="--sc:${c}" onclick="goRoute('projects'); openProjectDetail('${p.id}')" title="${esc((p.code||'') + ' · ' + st)}">
        <span class="pr-n"><i class="dot"></i><span>${esc(p.name)}</span>${p.priority==='ALTA'?'<em class="tag-hi">ALTA</em>':''}</span>
        <span class="seg"><i style="width:${pr}%"></i></span>
        <span class="pr-p">${pr}%</span>
      </button>`;
    }).join('');
  const proj = `<section class="hp hp-proj">
    ${hudPanelHead('Proyectos en curso', ongoing.length, "goRoute('projects')")}
    ${DB.projects.length ? `<div class="pr-sum"><div class="stack">${stackBar}</div><div class="lgds">${legend}</div></div>` : ''}
    <div class="hp-fit">${projRows || hudEmpty(DB.projects.length ? 'No hay proyectos en curso.' : 'Todavía no hay proyectos.')}</div>
  </section>`;

  /* ---------- CALENDARIO ---------- */
  const cal = hudCalendarHtml();

  /* ---------- NECESIDADES ---------- */
  const critRows = criticalNeeds.slice(0, 8).map(n=>`
    <button type="button" class="rw hb" onclick="renderNeeds._filterCategory=''; goRoute('needs')" title="${esc(n.title||n.description||'')}">
      <i class="led red"></i><span class="rw-t">${esc(n.title||n.description||'Sin título')}</span><span class="rw-c">${esc(n.code||'')}</span>
    </button>`).join('');
  const catCounts = {};
  DB.needs.forEach(n=>{ const k = n.category || 'Sin categoría'; catCounts[k] = (catCounts[k]||0)+1; });
  const catItems = Object.keys(catCounts).map(k=>({
    label:k, count:catCounts[k], color: k==='Sin categoría' ? '#ffb02e' : '#4cc9ff',
    go: k==='Sin categoría' ? "renderNeeds._filterCategory='__SIN__'; goRoute('needs')" : `hudNeedCat('${encodeURIComponent(k)}')`,
  })).sort((a,b)=>b.count-a.count).slice(0, 6);
  const need = `<section class="hp hp-need">
    ${hudPanelHead('Necesidades', criticalNeeds.length ? `<span class="red">${criticalNeeds.length} críticas</span>` : `${openNeeds.length} abiertas`, "renderNeeds._filterCategory=''; goRoute('needs')")}
    <div class="sub-h">Críticas abiertas</div>
    <div class="hp-fit crit">${critRows || hudEmpty('Sin necesidades críticas abiertas', true)}</div>
    <div class="sub-h">Por categoría</div>
    <div class="hp-fit">${catItems.length ? hudBars(catItems) : hudEmpty('Sin necesidades cargadas.')}</div>
  </section>`;

  /* ---------- COMPRAS + PEDIDOS ---------- */
  const buyCounts = PURCHASE_STATUSES.map(s=>({ s, n: DB.purchases.filter(pu=>pu.status===s).length }));
  const buyTotal = DB.purchases.length;
  const buyBody = buyTotal === 0 ? hudEmpty('Sin compras cargadas.') : `
    <button type="button" class="buy hb" onclick="goRoute('purchases')">
      <span class="stack">${buyCounts.filter(x=>x.n>0).map(x=>`<i style="flex:${x.n};background:${HUD_PURCHASE[x.s].color}"></i>`).join('')}</span>
      <span class="buy-c">${buyCounts.map(x=>`<span title="${esc(purchaseStatusLabel(x.s))}" style="--sc:${HUD_PURCHASE[x.s].color}"><b>${x.n}</b>${HUD_PURCHASE[x.s].short}</span>`).join('')}</span>
    </button>`;
  const activeRequests = DB.requests.filter(r=>!r.resolved);
  const reqCounts = {};
  activeRequests.forEach(r=>{ const k = r.receivedBy || 'Sin responsable'; reqCounts[k] = (reqCounts[k]||0)+1; });
  const reqItems = Object.keys(reqCounts).map(k=>({ label:k, count:reqCounts[k], color: k==='Sin responsable' ? '#ffb02e' : '#4cc9ff', go:"goRoute('requests')" }))
    .sort((a,b)=>b.count-a.count).slice(0, 6);
  const stack = `<div class="hp-stack">
    <section class="hp hp-buy">
      ${hudPanelHead('Compras', buyTotal, "goRoute('purchases')")}
      ${buyBody}
    </section>
    <section class="hp hp-req">
      ${hudPanelHead('Pedidos por responsable', activeRequests.length, "goRoute('requests')")}
      <div class="hp-fit">${reqItems.length ? hudBars(reqItems) : hudEmpty('Sin pedidos pendientes.')}</div>
    </section>
  </div>`;

  /* ---------- ÚLTIMOS REGISTROS (un solo listado, con etiqueta de sección) ---------- */
  const feed = [];
  activeSpaces.forEach(s=>feed.push({ tag:'REL', title:s.name, key:loadOrderKey(s), go:`goRoute('spaces'); openSpaceDetail('${s.id}')` }));
  DB.needs.forEach(n=>feed.push({ tag:'NEC', title:n.title||n.description, key:loadOrderKey(n), go:"goRoute('needs')" }));
  DB.projects.forEach(p=>feed.push({ tag:'PRY', title:p.name, key:loadOrderKey(p), go:`goRoute('projects'); openProjectDetail('${p.id}')` }));
  activeRequests.forEach(r=>feed.push({ tag:'PED', title:r.description, key:loadOrderKey(r), go:"goRoute('requests')" }));
  DB.events.forEach(e=>feed.push({ tag:'EVT', title:e.title, key:loadOrderKey(e), go:"goRoute('events')" }));
  feed.sort((a,b)=>String(b.key).localeCompare(String(a.key)));
  const feedRows = feed.slice(0, 10).map(f=>`
    <button type="button" class="ft hb" onclick="${f.go}" title="${esc(f.title||'')}">
      <span class="tg ${f.tag==='EVT'?'ev':''}">${f.tag}</span><span class="ft-t">${esc(f.title||'Sin título')}</span><span class="ft-a">${hudAgo(f.key)}</span>
    </button>`).join('');
  const last = `<section class="hp hp-last">
    ${hudPanelHead('Últimos registros', '', null)}
    <div class="hp-fit">${feedRows || hudEmpty('Todavía no hay registros.')}</div>
  </section>`;

  /* ---------- ACTIVIDAD ---------- */
  const actRows = DB.audit.slice(0, 8).map(e=>{
    const dt = new Date(e.ts);
    const when = isNaN(dt) ? '' : (hudIso(dt) === today ? dt.toTimeString().slice(0,5) : String(dt.getDate()).padStart(2,'0') + '/' + String(dt.getMonth()+1).padStart(2,'0'));
    const act = HUD_ACTION[e.action] || String(e.action||'').slice(0,6);
    const ent = HUD_ENTITY[e.entity] || e.entity || '';
    const cls = e.action==='CREATE' ? 'gr' : (e.action==='DELETE' || e.action==='DEACTIVATE') ? 'rd' : '';
    return `<button type="button" class="ac hb" onclick="goRoute('audit')" title="${esc(ent + (e.description ? ' · ' + e.description : '') + ' — ' + (e.user||''))}">
      <span class="ac-w">${when}</span><span class="ac-a ${cls}">${act}</span><span class="ac-t">${esc(e.description || ent)}</span><span class="ac-u">${esc(hudFirstName(e.user))}</span>
    </button>`;
  }).join('');
  const act = `<section class="hp hp-act">
    ${hudPanelHead('Actividad', '', "goRoute('audit')")}
    <div class="hp-fit">${actRows || hudEmpty('Sin actividad todavía.')}</div>
  </section>`;

  renderShell(`<div class="hud">${rail}${dep}${proj}${cal}${need}${stack}${last}${act}</div>`, '', '');
  hudBindFit();
  hudFit();
  if(document.fonts && document.fonts.ready) document.fonts.ready.then(hudFit);
}
