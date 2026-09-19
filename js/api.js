/* ============================================================
   CAPA DE COMUNICACIÓN: SINDI (frontend) -> Worker de Cloudflare -> R2
   Ningún archivo/imagen se guarda en GitHub. Todo viaja como base64
   hacia STORAGE_ENDPOINT (/api/storage, mismo dominio — ver worker.js),
   que lo escribe directo en el bucket de R2.
   ============================================================ */

function fileToBase64(file){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Data URL completo (con encabezado): para la foto de perfil del usuario,
// que se guarda junto con el resto de DB (localStorage), sin pasar por R2.
function fileToDataURL(file){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Se usa POST con body de texto plano (JSON.stringify) para evitar
// preflights de CORS innecesarios (mismo origen igual, pero así el
// Worker no tiene que lidiar con Content-Type multipart).
async function gasRequest(payload){
  let res;
  try{
    res = await fetch(STORAGE_ENDPOINT, { method: 'POST', body: JSON.stringify(payload) });
  }catch(networkErr){
    console.error('[SINDI] Error de red contactando el servidor de archivos:', networkErr, { url: STORAGE_ENDPOINT, payload });
    throw new Error('No se pudo contactar el servidor de archivos (error de red). Revisá tu conexión a internet.');
  }
  const text = await res.text();
  let data = null;
  try{ data = JSON.parse(text); }catch(parseErr){ /* no era JSON, se diagnostica abajo */ }

  if(!data){
    console.error('[SINDI] El servidor de archivos no devolvió JSON. Respuesta cruda:', text.slice(0,500), { status: res.status, url: STORAGE_ENDPOINT, payload });
    throw new Error(`El servidor respondió algo inesperado (código ${res.status}). Mirá la consola del navegador (F12) para el detalle completo.`);
  }
  if(data.ok === false){
    console.error('[SINDI] El servidor de archivos devolvió un error:', data.error, { payload });
    throw new Error(data.error || 'Error en el servidor de archivos');
  }
  const expectedField = { uploadFile:'fileId', listFiles:'files', deleteFile:'ok' }[payload.action];
  if(expectedField && data[expectedField] === undefined){
    console.error('[SINDI] Respuesta sin el campo esperado:', expectedField, data);
    throw new Error('El servidor respondió "activo" pero no ejecutó la acción pedida. Revisá el último deploy del Worker.');
  }
  return data;
}

/**
 * Sube un archivo al bucket de R2 (la "carpeta" se arma sola con la
 * primera subida, no hace falta crearla antes).
 * folderPath: array de segmentos, ej ['ARCHIVOS','PLANOS'] o ['PROYECTOS','PR-001_Nombre','Fotografias']
 */
async function driveUploadFile({ file, folderPath, description }){
  const base64 = await fileToBase64(file);
  return gasRequest({
    action: 'uploadFile',
    folderPath,
    fileName: file.name,
    mimeType: file.type || 'application/octet-stream',
    base64,
    description: description || ''
  });
}

async function driveListFiles(folderPath){
  return gasRequest({ action: 'listFiles', folderPath });
}

async function driveDeleteFile(fileId){
  return gasRequest({ action: 'deleteFile', fileId });
}
