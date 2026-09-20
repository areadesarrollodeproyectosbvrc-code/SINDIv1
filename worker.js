/* ============================================================
   SINDI — Worker único de Cloudflare.

   Un solo Worker hace dos cosas, en el mismo dominio:
   1) Sirve la app (index.html, js/, css/, icons/) como sitio estático
      (binding ASSETS, definido en wrangler.jsonc).
   2) Atiende la API de archivos bajo /api/*, escribiendo directo en un
      bucket de R2 (binding SINDI_BUCKET) — sin Google Drive ni Apps
      Script de por medio.

   Como todo vive en el mismo origen, el frontend (js/config.js) no
   necesita ninguna URL configurada a mano: le habla a /api/... con
   ruta relativa, y punto.
   ============================================================ */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/api/file') {
      return streamFile(request, url, env);
    }
    if (url.pathname === '/api/storage') {
      return handleStorage(request, env, ctx, url);
    }
    if (url.pathname === '/api/state') {
      return handleState(request, env);
    }

    // Cualquier otra ruta: la app estática (index.html, js/, css/, icons/).
    // El fallback a index.html para rutas desconocidas (SPA) lo resuelve
    // "not_found_handling": "single-page-application" en wrangler.jsonc.
    return env.ASSETS.fetch(request);
  },
};

// Estado compartido de la app (cuarteles, espacios, necesidades, proyectos,
// usuarios, etc.) — todo lo que antes vivía SOLO en localStorage de cada
// dispositivo. Se guarda como un único JSON en R2 (mismo bucket que los
// archivos, bajo una key separada), así todos los dispositivos ven los
// mismos datos.
//
// Es "el último que guarda gana": no hay resolución de conflictos fina.
// Para el volumen de uso de esta app (un equipo chico) es un compromiso
// razonable a cambio de no montar una base de datos aparte.
const STATE_KEY = '_state/sindi-db.json';

async function handleState(request, env) {
  const cors_ = cors();
  if (request.method === 'OPTIONS') return new Response(null, { headers: cors_ });

  if (request.method === 'GET') {
    const obj = await env.SINDI_BUCKET.get(STATE_KEY);
    if (!obj) return json({ ok: true, state: null });
    const text = await obj.text();
    return new Response(text, { headers: { 'Content-Type': 'application/json', ...cors_ } });
  }

  if (request.method === 'POST' || request.method === 'PUT') {
    let bodyText;
    try { bodyText = await request.text(); JSON.parse(bodyText); }
    catch (e) { return json({ ok: false, error: 'JSON inválido.' }, 400); }
    await env.SINDI_BUCKET.put(STATE_KEY, bodyText, {
      httpMetadata: { contentType: 'application/json' },
    });
    return json({ ok: true });
  }

  return json({ ok: false, error: 'Método no soportado.' }, 405);
}

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}
function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json', ...cors() },
  });
}

async function handleStorage(request, env, ctx, url) {
  if (request.method === 'OPTIONS') return new Response(null, { headers: cors() });
  if (request.method === 'GET') {
    // Sirve para probar que el Worker está activo desde Ajustes.
    return json({ ok: true, message: 'SINDI Worker activo. Usar POST para operar.' });
  }
  if (request.method !== 'POST') return json({ ok: false, error: 'Método no soportado.' }, 405);

  let body;
  try { body = await request.json(); }
  catch (e) { return json({ ok: false, error: 'JSON inválido en el pedido.' }, 400); }

  try {
    const result = await dispatch(body, env, url.origin);
    return json(result);
  } catch (err) {
    return json({ ok: false, error: String((err && err.message) || err) }, 500);
  }
}

async function dispatch(body, env, origin) {
  switch (body.action) {
    case 'uploadFile': return handleUploadFile(body, env, origin);
    case 'listFiles': return handleListFiles(body, env, origin);
    case 'deleteFile': return handleDeleteFile(body, env);
    default: return { ok: false, error: 'Acción no reconocida: ' + body.action };
  }
}

function safeSegment(s) {
  return String(s || '').replace(/[\/\\]/g, '-').replace(/[^\w\-. áéíóúÁÉÍÓÚñÑ]/g, '_').slice(0, 140);
}
function keyFor(folderPath, fileName) {
  const folder = (folderPath || []).map(safeSegment).join('/');
  const safeName = safeSegment(fileName || 'archivo');
  const unique = Date.now() + '_' + Math.random().toString(36).slice(2, 8) + '_' + safeName;
  return (folder ? folder + '/' : '') + unique;
}
function fileUrlFor(origin, key) {
  return origin + '/api/file?key=' + encodeURIComponent(key);
}
function base64ToBytes(base64) {
  const binStr = atob(base64 || '');
  const bytes = new Uint8Array(binStr.length);
  for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);
  return bytes;
}

async function handleUploadFile(body, env, origin) {
  const key = keyFor(body.folderPath, body.fileName);
  const bytes = base64ToBytes(body.base64);
  await env.SINDI_BUCKET.put(key, bytes, {
    httpMetadata: { contentType: body.mimeType || 'application/octet-stream' },
    customMetadata: {
      name: body.fileName || 'archivo',
      description: body.description || '',
      uploadedAt: new Date().toISOString(),
    },
  });
  const fileUrl = fileUrlFor(origin, key);
  return { ok: true, fileId: key, name: body.fileName || 'archivo', url: fileUrl, viewUrl: fileUrl };
}

async function handleListFiles(body, env, origin) {
  const prefix = (body.folderPath || []).map(safeSegment).join('/') + '/';
  const listed = await env.SINDI_BUCKET.list({ prefix });
  const files = listed.objects.map(obj => ({
    fileId: obj.key,
    name: (obj.customMetadata && obj.customMetadata.name) || obj.key.split('/').pop(),
    description: (obj.customMetadata && obj.customMetadata.description) || '',
    url: fileUrlFor(origin, obj.key),
    viewUrl: fileUrlFor(origin, obj.key),
    uploadedAt: (obj.customMetadata && obj.customMetadata.uploadedAt) || obj.uploaded.toISOString(),
  }));
  return { ok: true, files };
}

async function handleDeleteFile(body, env) {
  await env.SINDI_BUCKET.delete(body.fileId);
  return { ok: true };
}

async function streamFile(request, url, env) {
  const key = url.searchParams.get('key');
  if (!key) return json({ ok: false, error: 'Falta el parámetro key.' }, 400);
  const obj = await env.SINDI_BUCKET.get(key);
  if (!obj) return json({ ok: false, error: 'No encontrado.' }, 404);
  const headers = new Headers(cors());
  obj.writeHttpMetadata(headers);
  headers.set('etag', obj.httpEtag);
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  headers.set('Content-Disposition', 'inline');
  return new Response(obj.body, { headers });
}
