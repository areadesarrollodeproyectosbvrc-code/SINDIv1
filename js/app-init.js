/* ===================== ROUTER ===================== */
function render(){
  saveNav(); // recuerda usuario + pantalla para sobrevivir a una recarga
  if(!session){ renderLogin(); return; }
  if(route==='dashboard') return renderDashboard();
  if(route==='stations') return renderStations();
  if(route==='spaces') return renderSpaces();
  if(route==='needs') return renderNeeds();
  if(route==='projects') return renderProjects();
  if(route==='completed-projects') return renderCompletedProjects();
  if(route==='purchases') return renderPurchases();
  if(route==='files') return renderFiles();
  if(route==='events') return renderEvents();
  if(route==='requests') return renderRequests();
  if(route==='maintenance') return renderMaintenance();
  if(route==='tasks') return renderTasks();
  if(route==='personal') return renderPersonal();
  if(route==='audit') return renderAudit();
  if(route==='settings') return renderSettings();
}

document.addEventListener('DOMContentLoaded', init);
