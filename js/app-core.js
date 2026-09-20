/* ============================================================
   NÚCLEO: utilidades, estado global, login, shell/navegación,
   reloj y dashboard.
   ============================================================ */

function uid(){ return 'id-' + Math.random().toString(36).slice(2,10) + Date.now().toString(36); }
function esc(s){ return (s==null?'':String(s)).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function m2(n){ return (Number(n)||0).toLocaleString('es-AR',{minimumFractionDigits:2, maximumFractionDigits:2}); }
// Inversión de un proyecto: se carga en millones de pesos (ej: 125 -> "$125 millones").
function formatInvestment(n){
  const v = Number(n)||0;
  if(!v) return '—';
  return '$' + v.toLocaleString('es-AR') + ' millones';
}
// Badge visual de prioridad, reutilizado en el Panel General y en los listados.
function priorityBadge(pr){
  if(!pr) return '';
  const cls = pr==='ALTA' ? 'danger' : pr==='MEDIA' ? 'warn' : 'ok';
  return `<span class="badge ${cls}">${esc(pr)}</span>`;
}
// Nombre de carpeta de Drive de un proyecto: "<código> - <nombre>", siempre con
// el código adelante para no perder trazabilidad con la ficha aunque cambie el nombre.
function projectFolderSegment(p){ return `${p.code} - ${p.name}`; }
// Espacio relevado que originó el proyecto (vía la necesidad de origen).
function projectSpaceName(p){
  const need = p.needId ? DB.needs.find(n=>n.id===p.needId) : null;
  const space = need && need.spaceId ? DB.spaces.find(s=>s.id===need.spaceId) : null;
  return space ? space.name : '—';
}
function pad3(n){ return String(n).padStart(3,'0'); }
function todayISO(){ return new Date().toISOString().slice(0,10); }
function nowTimeStr(){ return new Date().toTimeString().slice(0,5); }
function nowClockStr(){ const d = new Date(); return d.toLocaleDateString('es-AR') + ' · ' + d.toTimeString().slice(0,5); }
function slugify(s){ return (s||'').toString().trim().replace(/\s+/g,'_').replace(/[^\w\-]/g,'').slice(0,40); }

/* ============================================================
   USUARIOS
   Base inicial: 5 perfiles fijos con contraseña "0405" (editable
   por cada uno desde Ajustes). A partir de acá se pueden dar de
   alta nuevos usuarios con usuario y contraseña propios: dejan
   de depender de la contraseña compartida.
   DB.users es la fuente de verdad; SEED_USERS solo se usa una
   vez, la primera vez que se abre la app, para poblarla.
   ============================================================ */
const SEED_USERS = ['Leonardo Villarreal','Micaela Mercado','Ulises Sayago','Nicolás Cabral','Victoria Torres'];
const DEFAULT_PASSWORD = '0405';
// Única clasificación de usuario admitida en SINDI: Miembro o Colaborador.
// (No crear categorías nuevas como Inspector/Supervisor/Fiscalizador.)
const USER_ROLES = [
  {key:'MIEMBRO', label:'Miembro'},
  {key:'COLABORADOR', label:'Colaborador'},
];
function userRoleLabel(r){ const f = USER_ROLES.find(x=>x.key===r); return f ? f.label : (r||'—'); }

function ensureUsersSeeded(){
  if(!Array.isArray(DB.users)) DB.users = [];
  if(DB.users.length===0){
    DB.users = SEED_USERS.map(name=>({
      id: uid(), name, password: DEFAULT_PASSWORD, area:'', role:'MIEMBRO', photo:'', fixed:true,
    }));
    saveDB(DB); // sin toast: alta silenciosa de la base inicial
  }
}
function allUserNames(){ return DB.users.map(u=>u.name); }
function findUserByName(name){ return DB.users.find(u=>u.name===name); }
function findUserById(id){ return DB.users.find(u=>u.id===id); }
function avatarHtml(user, size){
  size = size || 34;
  const initials = (user?.name||'?').split(/\s+/).map(w=>w[0]).slice(0,2).join('').toUpperCase();
  if(user?.photo){
    return `<img src="${esc(user.photo)}" alt="${esc(user.name)}" style="width:${size}px;height:${size}px;border-radius:50%;object-fit:cover;border:1px solid var(--line);">`;
  }
  return `<div style="width:${size}px;height:${size}px;border-radius:50%;background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:center;font-size:${Math.round(size*0.38)}px;font-weight:700;">${esc(initials)}</div>`;
}
function sessionAvatarHtml(){
  const user = session ? findUserById(session.id) : null;
  return avatarHtml(user, 32);
}

const app = document.getElementById('app');
const toastEl = document.getElementById('toast');
let toastTimer = null;
function toast(msg, isError){
  clearTimeout(toastTimer);
  toastEl.textContent = msg;
  toastEl.classList.toggle('is-error', !!isError);
  toastEl.classList.add('show');
  // Tocar el mensaje siempre lo cierra al toque.
  toastEl.onclick = () => { toastEl.classList.remove('show'); clearTimeout(toastTimer); };
  if(isError){
    // Los errores NO se cierran solos: se quedan fijos hasta que los
    // toques, para poder leerlos con calma. Además se copian solos al
    // portapapeles para poder pegarlos y mandarlos tal cual.
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(msg).catch(()=>{});
    }
  } else {
    toastTimer = setTimeout(()=>toastEl.classList.remove('show'), 1600);
  }
}

/* ===================== ESTADO ===================== */
let DB = emptyDB();
let session = null; // { name, role }
let route = 'dashboard';
let detailState = { spaceId: null, tab: 'general' };
let projectDetailState = { projectId: null, returnRoute: 'projects' };
// Navegación de Espacios: dependencia → nivel → relevamientos.
let spacesNav = { stationId: null, level: null };
let stationDetailState = { stationId: null };
let modal = null;

function init(){
  DB = loadDB();
  ensureUsersSeeded();
  render();
  setInterval(()=>{ const c = document.getElementById('clock'); if(c) c.textContent = nowClockStr(); }, 5000);

  // Al abrir: si el servidor tiene una copia más nueva que la de este
  // dispositivo, se usa esa. Si el servidor todavía no tiene nada (primer
  // uso de la app), se sube la copia local para que sea el punto de
  // partida compartido con todos.
  syncFromServerOnLoad();
  // Cada 25s, revisar si alguien más cambió algo desde otro dispositivo
  // (salvo que haya un modal abierto: no queremos mover el piso debajo
  // de una edición en curso).
  setInterval(pollServerForUpdates, 25000);
}

async function syncFromServerOnLoad(){
  const serverDB = await fetchServerDB();
  if(serverDB){
    if(!DB.updatedAt || (serverDB.updatedAt && serverDB.updatedAt > DB.updatedAt)){
      DB = Object.assign(emptyDB(), serverDB);
      ensureUsersSeeded();
      render();
    }
  } else {
    syncDBToServer(DB);
  }
}
async function pollServerForUpdates(){
  if(modal) return;
  const serverDB = await fetchServerDB();
  if(serverDB && serverDB.updatedAt && (!DB.updatedAt || serverDB.updatedAt > DB.updatedAt)){
    DB = Object.assign(emptyDB(), serverDB);
    ensureUsersSeeded();
    render();
  }
}

function persist(){
  saveDB(DB, (ok)=>{ toast(ok ? 'Guardado' : 'No se pudo guardar en este navegador'); });
  syncDBToServer(DB);
}
function logAudit(action, entity, description){
  DB.audit.unshift({ id: uid(), ts: new Date().toISOString(), user: session?.name || 'Sistema', action, entity, description });
  DB.audit = DB.audit.slice(0, 200);
}
function nextCode(prefix, key){
  DB.seq[key] = (DB.seq[key]||0) + 1;
  return prefix + '-' + pad3(DB.seq[key]);
}

/* ===================== LOGIN ===================== */
let loginPick = null; // nombre elegido
function renderLogin(){
  ensureUsersSeeded();
  const profiles = allUserNames();
  app.innerHTML = `
    <div class="login-screen">
      <div class="login-card" style="max-width:360px;text-align:center;">
        <div class="login-title">SINDI</div>
        <label class="field" style="text-align:left;margin-top:28px;">
          <span>Seleccionar miembro</span>
          <select id="li-user" onchange="pickLoginProfile(this.value)">
            <option value="">Elegí tu perfil…</option>
            ${profiles.map(p=>`<option value="${esc(p)}" ${loginPick===p?'selected':''}>${esc(p)}</option>`).join('')}
          </select>
        </label>
        ${loginPick ? `
          <label class="field" style="text-align:left;"><span>Contraseña</span><input id="li-pass" type="password" placeholder="••••" onkeydown="if(event.key==='Enter') doLogin();"></label>
          <button class="btn btn-primary" style="width:100%;" onclick="doLogin()">Ingresar</button>
        ` : ''}
      </div>
    </div>`;
  const passEl = document.getElementById('li-pass');
  if(passEl) passEl.focus();
}
function pickLoginProfile(p){ loginPick = p || null; render(); }
function doLogin(){
  const pass = document.getElementById('li-pass').value;
  const user = findUserByName(loginPick);
  if(!user){ toast('Perfil no encontrado'); return; }
  if(pass !== user.password){ toast('Contraseña incorrecta'); return; }
  session = { id: user.id, name: user.name, role: user.role };
  loginPick = null;
  route = 'dashboard';
  render();
}
function doLogout(){ session = null; loginPick = null; render(); }

/* ===================== SHELL / NAV ===================== */
const NAV = [
  {key:'dashboard', label:'Inicio'},
  {key:'stations', label:'Dependencias'},
  {key:'spaces', label:'Espacios y relevamientos'},
  {key:'needs', label:'Necesidades'},
  {key:'projects', label:'Proyectos'},
  {key:'completed-projects', label:'Completados'},
  {key:'purchases', label:'Compras'},
  {key:'files', label:'Archivos'},
  {key:'events', label:'Eventos'},
  {key:'requests', label:'Pedidos'},
  {key:'maintenance', label:'Mantenimiento'},
  {key:'tasks', label:'Tareas'},
  {key:'personal', label:'Personal'},
  {key:'audit', label:'Auditoría'},
  {key:'settings', label:'Ajustes'},
];

let navOpen = false;
function toggleNav(){ navOpen = !navOpen; syncNavDom(); }
function closeNav(){ if(navOpen){ navOpen = false; syncNavDom(); } }
function syncNavDom(){
  const sb = document.querySelector('.sidebar');
  const ov = document.querySelector('.nav-overlay');
  if(sb) sb.classList.toggle('open', navOpen);
  if(ov) ov.classList.toggle('show', navOpen);
}

function renderShell(innerHtml, pageTitle, pageSub){
  app.innerHTML = `
    <div class="shell">
      <div class="nav-overlay ${navOpen?'show':''}" onclick="closeNav()"></div>
      <aside class="sidebar ${navOpen?'open':''}">
        <div class="brand">SINDI</div>
        <div class="brand-sub">${esc(ORG_NAME)}</div>
        <nav>${NAV.map(n=>`<div class="nav-item ${route===n.key?'active':''}" onclick="closeNav(); goRoute('${n.key}')">${esc(n.label)}</div>`).join('')}</nav>
      </aside>
      <div class="main">
        <div class="topbar">
          <div style="display:flex;align-items:center;gap:10px;">
            <button class="nav-toggle" onclick="toggleNav()" aria-label="Abrir menú">☰</button>
            <div class="mono" id="clock" style="font-size:14px;color:var(--ink-soft);font-weight:600;">${nowClockStr()}</div>
          </div>
          <div style="display:flex;align-items:center;gap:12px;">
            <div style="text-align:right;" class="topbar-username">
              <div style="font-size:13px;font-weight:600;">${esc(session.name)}</div>
              <div style="font-size:10.5px;color:var(--ink-soft);">${esc(userRoleLabel(session.role))}</div>
            </div>
            ${sessionAvatarHtml()}
            <button class="btn btn-ghost btn-sm" onclick="goRoute('settings')">Ajustes</button>
            <button class="btn btn-danger" onclick="doLogout()">Salir</button>
          </div>
        </div>
        <div class="content">
          ${pageTitle ? `<h1 class="page-title">${esc(pageTitle)}</h1>` : ''}
          ${pageSub ? `<p class="page-sub">${esc(pageSub)}</p>` : ''}
          ${innerHtml}
        </div>
      </div>
    </div>`;
}
function goRoute(key){ route = key; navOpen = false; detailState = { spaceId:null, tab:'general' }; projectDetailState = { projectId:null, returnRoute:'projects' }; stationDetailState = { stationId:null }; spacesNav = { stationId:null, level:null }; render(); }

/* ===================== INICIO (panel general) ===================== */
function computeSurfaceTotals(){
  const t = { CUBIERTA:0, SEMICUBIERTA:0, DESCUBIERTA:0 };
  DB.spaces.filter(s=>s.active!==false).forEach(s=>{ t[s.surfaceType] = (t[s.surfaceType]||0) + (Number(s.surfaceM2)||0); });
  return { ...t, total: t.CUBIERTA + t.SEMICUBIERTA + t.DESCUBIERTA };
}
function stationSurfaceTotal(stationId){
  return DB.spaces.filter(s=>s.active!==false && s.stationId===stationId).reduce((sum,s)=> sum + (Number(s.surfaceM2)||0), 0);
}
function stationNameById(id){
  const s = DB.stations.find(x=>x.id===id);
  return s ? s.name : 'Sin dependencia asignado';
}
// Clave de orden de carga (más reciente primero) para las tarjetas de
// "últimos 3 registros" del Panel General. Cada módulo tiene su propio
// campo de fecha/hora, así que se normaliza acá en un único lugar.
function loadOrderKey(x){
  return x.createdAtISO || `${x.createdAt||x.date||''}T${x.createdAtTime||x.time||'00:00'}`;
}
function lastLoaded(list, n){ return list.slice().sort((a,b)=> loadOrderKey(b).localeCompare(loadOrderKey(a))).slice(0, n); }

function dashboardRecentCard(title, items, emptyMsg, routeKey, rowFn){
  return `<div class="card">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
      <h3 style="font-size:13px;margin:0;">${esc(title)}</h3>
      <span class="link-tab" onclick="goRoute('${routeKey}')">Ver todo →</span>
    </div>
    ${items.length===0 ? `<div class="empty" style="padding:8px 0;">${esc(emptyMsg)}</div>` : items.map(rowFn).join('')}
  </div>`;
}
function monthCalendarHtml(){
  const now = new Date();
  const year = now.getFullYear(), month = now.getMonth(), todayNum = now.getDate();
  const MONTHS_LONG = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7; // lunes=0
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const eventDays = new Set(
    DB.events
      .filter(e=>{ const d = new Date((e.date||'')+'T00:00:00'); return !isNaN(d) && d.getFullYear()===year && d.getMonth()===month; })
      .map(e=> new Date(e.date+'T00:00:00').getDate())
  );
  let cells = '';
  for(let i=0;i<firstWeekday;i++) cells += `<div class="mini-cal-day other"></div>`;
  for(let d=1; d<=daysInMonth; d++){
    cells += `<div class="mini-cal-day${d===todayNum?' today':''}">${d}${eventDays.has(d)?'<span class="mini-cal-dot"></span>':''}</div>`;
  }
  return `<div class="card">
    <h3 style="font-size:13px;margin:0 0 8px;">${MONTHS_LONG[month]} ${year}</h3>
    <div class="mini-cal-grid">
      ${['L','M','M','J','V','S','D'].map(d=>`<div class="mini-cal-wd">${d}</div>`).join('')}
      ${cells}
    </div>
  </div>`;
}
// Gráfico de proyectos por estado: dona SVG (sin librerías externas) +
// referencias con cantidad y porcentaje, coloreadas según PROJECT_STATUS_COLORS.
function projectStatusChartHtml(){
  const total = DB.projects.length;
  if(total===0){
    return `<div class="card"><h3 style="font-size:13px;margin:0 0 8px;">Proyectos por estado</h3><div class="empty">Todavía no hay proyectos cargados.</div></div>`;
  }
  const counts = {};
  DB.projects.forEach(p=>{ counts[p.status] = (counts[p.status]||0) + 1; });
  const segments = PROJECT_STATUSES.filter(st=>counts[st]>0).map(st=>({
    st, count: counts[st], pct: counts[st]/total*100, color: PROJECT_STATUS_COLORS[st] || '#999',
  }));
  const R = 60, C = 2*Math.PI*R;
  let offset = 0;
  const arcs = segments.map(seg=>{
    const len = C * (seg.pct/100);
    const arc = `<circle r="${R}" cx="90" cy="90" fill="none" stroke="${seg.color}" stroke-width="26" stroke-dasharray="${len.toFixed(2)} ${(C-len).toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}" transform="rotate(-90 90 90)"></circle>`;
    offset += len;
    return arc;
  }).join('');
  const legend = segments.map(seg=>`
    <div style="display:flex;align-items:center;gap:6px;font-size:10.5px;margin-bottom:3px;">
      <span style="width:9px;height:9px;border-radius:2px;background:${seg.color};flex-shrink:0;"></span>
      <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(seg.st)}</span>
      <span class="mono" style="color:var(--ink-soft);">${seg.count} · ${seg.pct.toFixed(0)}%</span>
    </div>`).join('');
  return `<div class="card">
    <h3 style="font-size:13px;margin:0 0 8px;">Proyectos por estado</h3>
    <div style="display:flex;align-items:center;gap:12px;">
      <svg width="96" height="96" viewBox="0 0 180 180" style="flex-shrink:0;">
        ${arcs}
        <circle r="34" cx="90" cy="90" style="fill:var(--surface, #fff);"></circle>
        <text x="90" y="98" text-anchor="middle" font-size="30" font-weight="700" style="fill:var(--ink);">${total}</text>
      </svg>
      <div style="flex:1;min-width:0;">${legend}</div>
    </div>
  </div>`;
}
function renderDashboard(){
  const totals = computeSurfaceTotals();
  const activeSpaces = DB.spaces.filter(s=>s.active!==false);
  const criticalNeeds = DB.needs.filter(n=>n.priority==='ALTA' && n.status!=='SOLUCIONADO' && n.status!=='CONVERTIDO_EN_PROYECTO');
  const ongoing = DB.projects.filter(p=>p.status!=='FINALIZADO' && p.status!=='CANCELADO');
  const nextMaint = nextMaintenanceDue();
  const pendingTasks = DB.tasks.filter(t=>t.status!=='COMPLETADA').sort((a,b)=>(a.date||'').localeCompare(b.date||''));

  const recentSpaces = lastLoaded(activeSpaces, 3);
  const recentNeeds = lastLoaded(DB.needs, 3);
  const recentProjects = lastLoaded(DB.projects, 3);
  const recentRequests = lastLoaded(DB.requests, 3);
  const recentEvents = lastLoaded(DB.events, 3);

  // --- Indicadores nuevos (se suman a los existentes, no los reemplazan) ---
  const hoy = todayISO();
  ensurePurchases();
  const overduePurchases = DB.purchases.filter(pu=>pu.status==='PENDIENTE' && pu.date && pu.date < hoy);
  const uncategorizedNeeds = DB.needs.filter(n=>!n.category);
  const overdueTasks = pendingTasks.filter(t=>t.date && t.date < hoy);
  const openNeeds = DB.needs.filter(n=>n.status!=='SOLUCIONADO' && n.status!=='CONVERTIDO_EN_PROYECTO');
  const pendingRequests = DB.requests.filter(r=>!r.projectId);
  const materialsTotal = allProjectsMaterialsTotal();
  const attentionCount = overduePurchases.length + uncategorizedNeeds.length + overdueTasks.length;

  const html = `
    <div class="panel-band-title first">Requiere atención</div>
    <div class="attention-grid" style="margin-bottom:18px;">
      <div class="attention-chip ${overduePurchases.length?'on':''}" onclick="goRoute('purchases')">
        <div class="v">${overduePurchases.length}</div><div class="l">Compras vencidas sin aprobar</div>
      </div>
      <div class="attention-chip ${uncategorizedNeeds.length?'on':''}" onclick="renderNeeds._filterCategory='__SIN__'; goRoute('needs');">
        <div class="v">${uncategorizedNeeds.length}</div><div class="l">Necesidades sin categorizar</div>
      </div>
      <div class="attention-chip ${overdueTasks.length?'on':''}" onclick="goRoute('tasks')">
        <div class="v">${overdueTasks.length}</div><div class="l">Tareas vencidas</div>
      </div>
      <div class="attention-chip ${attentionCount?'':'ok'}">
        <div class="v">${attentionCount}</div><div class="l">Total a resolver hoy</div>
      </div>
    </div>

    <div class="panel-band-title">Estado general</div>
    <div class="stat-strip" style="margin-bottom:10px;">
      <div class="stat-chip accent"><div class="v">${ongoing.length}</div><div class="l">Proyectos activos</div></div>
      <div class="stat-chip accent"><div class="v">${openNeeds.length}</div><div class="l">Necesidades abiertas</div></div>
      <div class="stat-chip accent"><div class="v">${pendingRequests.length}</div><div class="l">Solicitudes pendientes</div></div>
      <div class="stat-chip accent"><div class="v" style="font-size:14px;">${money(materialsTotal)}</div><div class="l">Materiales consolidado</div></div>
    </div>
    <div class="stat-strip" style="margin-bottom:16px;">
      <div class="stat-chip"><div class="v">${m2(totals.total)} m²</div><div class="l">Superficie total</div></div>
      <div class="stat-chip"><div class="v">${m2(totals.CUBIERTA)} m²</div><div class="l">Cubierta</div></div>
      <div class="stat-chip"><div class="v">${m2(totals.SEMICUBIERTA)} m²</div><div class="l">Semicubierta</div></div>
      <div class="stat-chip"><div class="v">${m2(totals.DESCUBIERTA)} m²</div><div class="l">Descubierta</div></div>
      <div class="stat-chip accent"><div class="v">${activeSpaces.length}</div><div class="l">Espacios relevados</div></div>
      <div class="stat-chip accent"><div class="v">${criticalNeeds.length}</div><div class="l">Necesidades críticas</div></div>
      <div class="stat-chip accent"><div class="v">${ongoing.length}</div><div class="l">Proyectos en curso</div></div>
    </div>

    <div class="grid-dep-tasks" style="margin-bottom:16px;">
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <h3 style="font-size:13px;margin:0;">Dependencias</h3>
          <span class="link-tab" onclick="goRoute('stations')">Ver todo →</span>
        </div>
        ${DB.stations.length===0 ? '<div class="empty">Todavía no hay dependencias cargadas.</div>' : `
          <div class="dep-list">
            ${DB.stations.map(st=>`
              <div class="dep-row tap" onclick="goRoute('stations'); openStationDetail('${st.id}')">
                ${st.planImage && st.planImage.url ? `<img src="${esc(st.planImage.url)}" alt="${esc(st.name)}">` : `<div class="dep-row-ph"></div>`}
                <div class="dep-row-body">
                  <div class="dep-row-name">${esc(st.name)}</div>
                  <div class="dep-row-meta">${m2(stationSurfaceTotal(st.id))} m²</div>
                </div>
              </div>`).join('')}
          </div>`}
      </div>
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <h3 style="font-size:13px;margin:0;">Tareas pendientes</h3>
          <span class="link-tab" onclick="goRoute('tasks')">Ver todo →</span>
        </div>
        ${pendingTasks.length===0 ? '<div class="empty" style="padding:6px 0;">Sin tareas pendientes.</div>' :
          pendingTasks.slice(0,5).map(t=>{
            const proj = t.projectId ? DB.projects.find(x=>x.id===t.projectId) : null;
            return `<div class="tap" style="padding:6px 0;border-bottom:1px solid var(--line);" onclick="goRoute('tasks')">
              <div style="font-size:11.5px;font-weight:600;">${esc(t.description.slice(0,44))}${t.description.length>44?'…':''}</div>
              <div style="font-size:10.5px;color:var(--ink-soft);">${esc(t.date||'Sin fecha')} · ${esc(t.responsible||'Sin responsable')}${proj?' · '+esc(proj.code):''}</div>
            </div>`;
          }).join('')}
      </div>
    </div>

    <div class="panel-band-title">Distribuciones</div>
    <div class="grid3" style="margin-bottom:18px;">
      ${needsByCategoryHtml()}
      ${purchasesByStatusHtml()}
      ${projectStatusChartHtml()}
    </div>

    <div class="panel-band-title">Seguimiento operativo</div>
    <div class="grid2" style="margin-bottom:18px;">
      ${requestsByResponsibleHtml()}
      ${activeProjectsProgressHtml(ongoing)}
    </div>

    <div class="grid4" style="margin-bottom:16px;">
      <div class="card">
        <h3 style="font-size:13px;margin:0 0 8px;">Necesidades críticas abiertas</h3>
        ${criticalNeeds.length===0 ? '<div class="empty">No hay necesidades críticas abiertas.</div>' :
          criticalNeeds.slice(0,6).map(n=>`<div class="tap" style="padding:7px 0;border-bottom:1px solid var(--line);" onclick="goRoute('needs')">
            <div style="font-size:12.5px;font-weight:600;">${esc(n.title||n.description)} ${priorityBadge(n.priority)}</div>
            <div style="font-size:11px;color:var(--ink-soft);margin-top:2px;"><span class="mono">${esc(n.code||'')}</span> · Dependencia: ${esc(stationNameById(n.stationId))}</div>
          </div>`).join('')}
      </div>
      <div class="card">
        <h3 style="font-size:13px;margin:0 0 8px;">Proyectos en curso</h3>
        ${ongoing.length===0 ? '<div class="empty">No hay proyectos en curso.</div>' :
          ongoing.slice(0,6).map(p=>`<div class="tap" style="padding:7px 0;border-bottom:1px solid var(--line);" onclick="goRoute('projects'); openProjectDetail('${p.id}')">
            <div style="font-size:12.5px;font-weight:600;">${esc(p.name)} <span class="badge gray" style="margin-left:4px;">${esc(p.status)}</span> ${priorityBadge(p.priority)}</div>
            <div style="font-size:11px;color:var(--ink-soft);margin-top:2px;"><span class="mono">${esc(p.code||'')}</span> · Dependencia: ${esc(stationNameById(p.stationId))}</div>
          </div>`).join('')}
      </div>
      ${monthCalendarHtml()}
    </div>

    <div class="grid5" style="margin-bottom:16px;">
      ${dashboardRecentCard('Relevamientos', recentSpaces, 'Sin espacios cargados.', 'spaces', s=>`
        <div class="tap" style="padding:7px 0;border-bottom:1px solid var(--line);" onclick="goRoute('spaces'); openSpaceDetail('${s.id}')">
          <div style="font-size:12.5px;font-weight:600;">${esc(s.name)}</div>
          <div style="font-size:11px;color:var(--ink-soft);">${esc(s.cue)} · ${esc(stationNameById(s.stationId))}</div>
        </div>`)}
      ${dashboardRecentCard('Necesidades', recentNeeds, 'Sin necesidades cargadas.', 'needs', n=>`
        <div class="tap" style="padding:7px 0;border-bottom:1px solid var(--line);" onclick="goRoute('needs')">
          <div style="font-size:12.5px;font-weight:600;">${esc(n.title||n.description)} ${priorityBadge(n.priority)}</div>
          <div style="font-size:11px;color:var(--ink-soft);margin-top:2px;"><span class="mono">${esc(n.code||'')}</span> · ${esc(stationNameById(n.stationId))}</div>
        </div>`)}
      ${dashboardRecentCard('Proyectos', recentProjects, 'Sin proyectos cargados.', 'projects', p=>`
        <div class="tap" style="padding:7px 0;border-bottom:1px solid var(--line);" onclick="goRoute('projects'); openProjectDetail('${p.id}')">
          <div style="font-size:12.5px;font-weight:600;">${esc(p.name)} ${priorityBadge(p.priority)}</div>
          <div style="font-size:11px;color:var(--ink-soft);margin-top:2px;"><span class="mono">${esc(p.code||'')}</span> · ${esc(stationNameById(p.stationId))}</div>
        </div>`)}
      ${dashboardRecentCard('Pedidos', recentRequests, 'Sin pedidos cargados.', 'requests', r=>`
        <div class="tap" style="padding:7px 0;border-bottom:1px solid var(--line);" onclick="goRoute('requests')">
          <div style="font-size:12.5px;font-weight:600;">${esc(r.description.slice(0,42))}${r.description.length>42?'…':''}</div>
          <div style="font-size:11px;color:var(--ink-soft);">${esc(r.date)} · ${esc(requestOriginLabel(r))}</div>
        </div>`)}
      ${dashboardRecentCard('Eventos', recentEvents, 'Sin eventos cargados.', 'events', e=>`
        <div class="tap" style="padding:7px 0;border-bottom:1px solid var(--line);" onclick="goRoute('events')">
          <div style="font-size:12.5px;font-weight:600;">${esc(e.title)}</div>
          <div style="font-size:11px;color:var(--ink-soft);">${esc(e.date)} · ${esc(e.type||'')}</div>
        </div>`)}
    </div>

    <div class="card" style="margin-bottom:16px;">
      <h3 style="font-size:13px;margin:0 0 8px;">Próxima tarea de mantenimiento</h3>
      ${!nextMaint ? '<div class="empty">No hay tareas de mantenimiento cargadas.</div>' : `
        <div class="tap" onclick="goRoute('maintenance')">
          <div style="font-size:12.5px;font-weight:600;">${esc(nextMaint.title)}</div>
          <div style="font-size:11px;color:var(--ink-soft);margin-top:2px;">Vence: ${esc(nextMaint.nextDueDate)} · Cada ${nextMaint.frequencyValue} ${esc(maintFreqUnitLabel(nextMaint.frequencyUnit))}</div>
        </div>`}
    </div>

    <div class="card">
      <h3 style="font-size:11.5px;margin:0 0 6px;">Actividad reciente</h3>
      ${DB.audit.length===0 ? '<div class="empty" style="font-size:11px;padding:8px 0;">Sin eventos todavía.</div>' :
        DB.audit.slice(0,5).map(e=>`<div style="font-size:9px;line-height:1.35;padding:3px 0;border-bottom:1px solid var(--line);">
          <span class="mono" style="color:var(--accent);font-weight:700;">${esc(e.action)}</span> ${esc(e.entity)} — ${esc(e.user)}
          <span style="color:var(--ink-soft);font-size:8px;"> · ${new Date(e.ts).toLocaleString('es-AR')}${e.description ? ' · '+esc(e.description) : ''}</span>
        </div>`).join('')}
    </div>`;
  renderShell(html, '', '');
}


/* ===================== MODAL genérico ===================== */
function renderModal(innerHtml){
  const wrap = document.createElement('div');
  wrap.className = 'modal-wrap';
  wrap.id = 'modal-wrap';
  wrap.innerHTML = `<div class="modal">${innerHtml}</div>`;
  document.body.appendChild(wrap);
}
function closeModal(){
  const el = document.getElementById('modal-wrap');
  if(el) el.remove();
  modal = null;
}
