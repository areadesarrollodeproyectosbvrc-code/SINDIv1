/* ============================================================
   AJUSTES (editar el propio perfil y contraseña) y PERSONAL
   (listado de solo lectura de todos los usuarios). Ambas
   secciones leen y escriben sobre la misma fuente de datos,
   DB.users, para no duplicar información: lo que se edita en
   Ajustes se refleja automáticamente en Personal.
   ============================================================ */

/* ---- AJUSTES ---- */
function notificationsCardHtml(){
  if(!notificationsSupported()){
    return `<span class="badge gray">No disponible en este navegador</span>`;
  }
  if(Notification.permission === 'denied'){
    return `<span class="badge danger">Bloqueadas</span>
      <div style="font-size:11px;color:var(--ink-soft);margin-top:6px;">Las bloqueaste antes desde el navegador. Para activarlas, habilitá las notificaciones para este sitio desde la configuración del navegador o del celular.</div>`;
  }
  if(Notification.permission === 'granted' && notificationsEnabled()){
    return `<span class="badge ok">Activadas</span>
      <button class="btn btn-ghost btn-sm" style="margin-left:8px;" onclick="disableNotifications()">Desactivar</button>`;
  }
  return `<span class="badge gray">No activadas</span>
    <button class="btn btn-primary btn-sm" style="margin-left:8px;" onclick="enableNotifications()">Activar notificaciones</button>`;
}
function renderSettings(){
  const user = session ? findUserById(session.id) : null;
  if(!user){ toast('No se encontró tu usuario'); route='dashboard'; return renderDashboard(); }
  const html = `
    <div class="grid2">
      <div class="card">
        <h3 style="font-size:13.5px;margin:0 0 12px;">Mis datos</h3>
        <div style="display:flex;align-items:center;gap:14px;margin-bottom:14px;">
          ${avatarHtml(user, 56)}
          <label class="btn btn-ghost btn-sm" style="display:inline-block;">
            Cambiar imagen de perfil
            <input id="settings-photo-input" type="file" accept="image/*" style="display:none;">
          </label>
        </div>
        <label class="field light"><span>Nombre completo</span><input id="set-name" type="text" value="${esc(user.name)}"></label>
        <label class="field light"><span>Área / especialidad</span><input id="set-area" type="text" value="${esc(user.area||'')}" placeholder="Ej: Infraestructura"></label>
        <label class="field light"><span>Rol</span>
          <select id="set-role">${USER_ROLES.map(r=>`<option value="${r.key}" ${r.key===user.role?'selected':''}>${r.label}</option>`).join('')}</select>
        </label>
        <button class="btn btn-primary" onclick="saveOwnSettings()">Guardar cambios</button>
      </div>
      <div class="card">
        <h3 style="font-size:13.5px;margin:0 0 12px;">Cambiar contraseña</h3>
        <label class="field light"><span>Contraseña actual</span><input id="set-pass-old" type="password"></label>
        <label class="field light"><span>Contraseña nueva</span><input id="set-pass-new" type="password"></label>
        <label class="field light"><span>Repetir contraseña nueva</span><input id="set-pass-new2" type="password"></label>
        <button class="btn btn-primary" onclick="changeOwnPassword()">Actualizar contraseña</button>
        ${user.fixed ? `<div style="font-size:10.5px;color:var(--ink-soft);margin-top:10px;">Este perfil venía con la contraseña inicial "${esc(DEFAULT_PASSWORD)}". Podés cambiarla acá cuando quieras.</div>` : ''}
      </div>
    </div>

    <div class="card" style="margin-top:16px;">
      <h3 style="font-size:13.5px;margin:0 0 4px;">Notificaciones</h3>
      <div style="font-size:11.5px;color:var(--ink-soft);margin-bottom:10px;">
        Avisa de los eventos de hoy y de tus tareas pendientes para hoy, mientras SINDI esté abierto (en la pestaña o en segundo plano). Andá a Android: funciona con el navegador o instalado. En iPhone: instalá SINDI primero (Compartir → "Agregar a inicio") para poder activarlas.
      </div>
      ${notificationsCardHtml()}
    </div>

    <div class="card" style="margin-top:16px;">
      <h3 style="font-size:13.5px;margin:0 0 4px;">Almacenamiento de archivos</h3>
      <div style="font-size:11.5px;color:var(--ink-soft);margin-bottom:10px;">
        Fotos, comprobantes y planos se guardan en Cloudflare R2. Queda configurado solo con
        el deploy de la app — no hay nada para pegar ni configurar acá.
      </div>
      <span class="badge ok">Conectado</span>
    </div>`;
  renderShell(html, 'Ajustes', 'Editá tus datos, tu imagen de perfil y tu contraseña. Estos datos también se muestran en "Personal".');
  const photoInput = document.getElementById('settings-photo-input');
  if(photoInput){ photoInput.addEventListener('change', ()=> uploadOwnPhoto(photoInput)); }
}
function saveOwnSettings(){
  const user = session ? findUserById(session.id) : null;
  if(!user) return;
  const name = document.getElementById('set-name').value.trim();
  const area = document.getElementById('set-area').value.trim();
  const role = document.getElementById('set-role').value;
  if(!name){ toast('El nombre no puede quedar vacío'); return; }
  if(name !== user.name && findUserByName(name)){ toast('Ya existe otro usuario con ese nombre'); return; }
  user.name = name; user.area = area; user.role = role;
  session.name = user.name; session.role = user.role;
  logAudit('UPDATE','User', name);
  persist(); toast('Datos actualizados'); render();
}
async function uploadOwnPhoto(inputEl){
  const user = session ? findUserById(session.id) : null;
  const file = inputEl.files && inputEl.files[0];
  if(!user || !file) return;
  try{
    const dataUrl = await fileToDataURL(file);
    user.photo = dataUrl;
    logAudit('UPDATE','User photo', user.name);
    persist(); render();
  }catch(err){
    toast('No se pudo cargar la imagen');
  }
}
function changeOwnPassword(){
  const user = session ? findUserById(session.id) : null;
  if(!user) return;
  const oldPass = document.getElementById('set-pass-old').value;
  const newPass = document.getElementById('set-pass-new').value;
  const newPass2 = document.getElementById('set-pass-new2').value;
  if(oldPass !== user.password){ toast('La contraseña actual no es correcta'); return; }
  if(!newPass || newPass.length<4){ toast('La contraseña nueva debe tener al menos 4 caracteres'); return; }
  if(newPass !== newPass2){ toast('Las contraseñas nuevas no coinciden'); return; }
  user.password = newPass;
  logAudit('UPDATE','User password', user.name);
  persist(); toast('Contraseña actualizada'); render();
}

/* ---- PERSONAL (solo lectura, toma los datos directo de Ajustes) ---- */
function renderPersonal(){
  const html = `
    <div style="margin-bottom:14px;"><button class="btn btn-primary" onclick="openNewUserModal()">+ Agregar usuario</button></div>
    <div class="card">
      ${DB.users.length===0 ? '<div class="empty">Todavía no hay usuarios cargados.</div>' :
        DB.users.map(u=>`<div style="display:flex;align-items:center;gap:14px;padding:12px 0;border-bottom:1px solid var(--line);">
          ${avatarHtml(u, 44)}
          <div>
            <div style="font-size:13.5px;font-weight:700;">${esc(u.name)}</div>
            <div style="font-size:11.5px;color:var(--ink-soft);">${esc(u.area || 'Sin área asignada')} · ${esc(userRoleLabel(u.role))}</div>
          </div>
        </div>`).join('')}
    </div>`;
  renderShell(html, 'Personal', 'Vista de solo lectura: los datos se editan desde Ajustes, en la sesión de cada usuario. El alta de usuarios nuevos se hace acá.');
}

/* ---- Alta de usuario nuevo (solo disponible logueado, no desde el login) ---- */
function openNewUserModal(){
  modal = { type:'new-user' };
  renderModal(`
    <h2>Agregar usuario</h2>
    <label class="field light"><span>Nombre completo</span><input id="nu-name" type="text" placeholder="Nombre y apellido"></label>
    <label class="field light"><span>Área / especialidad (opcional)</span><input id="nu-area" type="text" placeholder="Ej: Infraestructura"></label>
    <label class="field light"><span>Rol</span>
      <select id="nu-role">${USER_ROLES.map(r=>`<option value="${r.key}" ${r.key==='MIEMBRO'?'selected':''}>${r.label}</option>`).join('')}</select>
    </label>
    <label class="field light"><span>Contraseña inicial</span><input id="nu-pass" type="password" placeholder="Mínimo 4 caracteres"></label>
    <label class="field light"><span>Repetir contraseña</span><input id="nu-pass2" type="password"></label>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="saveNewUser()">Crear usuario</button>
    </div>`);
}
function saveNewUser(){
  const name = document.getElementById('nu-name').value.trim();
  const area = document.getElementById('nu-area').value.trim();
  const role = document.getElementById('nu-role').value;
  const pass = document.getElementById('nu-pass').value;
  const pass2 = document.getElementById('nu-pass2').value;
  if(!name){ toast('Ingresá el nombre completo'); return; }
  if(findUserByName(name)){ toast('Ya existe un usuario con ese nombre'); return; }
  if(!pass || pass.length<4){ toast('La contraseña debe tener al menos 4 caracteres'); return; }
  if(pass !== pass2){ toast('Las contraseñas no coinciden'); return; }
  DB.users.push({ id: uid(), name, password: pass, area, role, photo:'', fixed:false });
  logAudit('CREATE','User', name);
  persist(); closeModal(); render();
  toast('Usuario creado');
}
