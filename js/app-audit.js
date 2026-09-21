/* ===================== AUDITORÍA ===================== */
function renderAudit(){
  const rows = DB.audit.map(e=>`
    <tr>
      <td class="mono" style="color:var(--accent);font-weight:700;">${esc(e.action)}</td>
      <td>${esc(e.entity)}</td>
      <td>${esc(e.description||'')}</td>
      <td>${esc(e.user)}</td>
      <td style="white-space:nowrap;">${new Date(e.ts).toLocaleString('es-AR')}</td>
    </tr>`).join('');
  const html = `<div class="card">
    ${DB.audit.length===0?'<div class="empty">Sin eventos todavía.</div>':
    `<table><thead><tr><th>Acción</th><th>Entidad</th><th>Detalle</th><th>Usuario</th><th>Fecha y hora</th></tr></thead><tbody>${rows}</tbody></table>`}
  </div>`;
  renderShell(html, 'Auditoría', 'Registro de toda alta, edición, baja y cambio de estado hecho en el sistema.');
}
