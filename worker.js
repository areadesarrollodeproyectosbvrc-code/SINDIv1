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
      return handleState(request, env, ctx);
    }

    // Cualquier otra ruta: la app estática (index.html, js/, css/, icons/).
    // El fallback a index.html para rutas desconocidas (SPA) lo resuelve
    // "not_found_handling": "single-page-application" en wrangler.jsonc.
    return env.ASSETS.fetch(request);
  },
};

// ------------------------------------------------------------------
// ESTADO COMPARTIDO de la app (cuarteles, espacios, necesidades,
// proyectos, usuarios, etc.). Es la ÚNICA fuente de verdad: los
// dispositivos no guardan datos propios, todos leen y escriben acá.
//
// Se guarda como un JSON en R2. Para que dos dispositivos editando a la
// vez no se pisen entre sí, el cliente NO manda la base entera: manda
// solo lo que cambió (registros nuevos/modificados y ids borrados) y
// el Worker lo aplica sobre la versión más reciente del servidor.
// La escritura es condicional (etag), con reintento automático si
// alguien escribió en el medio.
// ------------------------------------------------------------------
const STATE_KEY = '_state/sindi-db.json';
const MAX_ATTEMPTS = 6;
const MAX_AUDIT = 200;
// Colecciones con código correlativo (NEC-001, PR-001): si dos dispositivos
// crean un registro a la vez y les toca el mismo número, se reasigna.
const CODE_SEQ = { needs: 'need', projects: 'project' };

function isReservedKey(k) { return String(k || '').startsWith('_state/'); }

async function handleState(request, env, ctx) {
  if (request.method === 'OPTIONS') return new Response(null, { headers: cors() });
  const url = new URL(request.url);

  if (request.method === 'GET') {
    const obj = await env.SINDI_BUCKET.get(STATE_KEY);
    const state = obj ? await obj.json() : null;
    const rev = state ? (state._rev || 1) : 0;

    // Sin parámetros: estado de la app (para abrir la URL en el navegador).
    // No expone datos, solo un resumen.
    if (url.searchParams.get('full') !== '1') {
      const counts = {};
      if (state) for (const k of Object.keys(state)) if (Array.isArray(state[k])) counts[k] = state[k].length;
      return json({
        ok: true, app: 'SINDI', status: 'activo', almacenamiento: 'R2 conectado',
        hayDatos: !!state, rev, actualizado: state ? state.updatedAt || null : null, registros: counts,
      });
    }
    // Con full=1: los datos. Si el cliente ya tiene esta revisión, no se reenvía nada.
    const since = Number(url.searchParams.get('since')) || 0;
    if (state && since === rev) return json({ ok: true, changed: false, rev });
    return json({ ok: true, changed: true, rev, state });
  }

  if (request.method !== 'POST') return json({ ok: false, error: 'Método no soportado.' }, 405);

  let body;
  try { body = await request.json(); }
  catch (e) { return json({ ok: false, error: 'JSON inválido.' }, 400); }

  // Primer uso: el servidor todavía no tiene datos. Solo se acepta si de verdad no hay nada.
  if (body && body.mode === 'init' && body.state && typeof body.state === 'object') {
    const existing = await env.SINDI_BUCKET.get(STATE_KEY);
    if (existing) {
      const state = await existing.json();
      return json({ ok: true, existed: true, rev: state._rev || 1, state });
    }
    const state = Object.assign({}, body.state, { _rev: 1, updatedAt: new Date().toISOString() });
    await env.SINDI_BUCKET.put(STATE_KEY, JSON.stringify(state), { httpMetadata: { contentType: 'application/json' } });
    return json({ ok: true, existed: false, rev: 1, state });
  }

  // Uso normal: aplicar cambios sobre la última versión del servidor.
  if (body && body.patch && typeof body.patch === 'object') {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const obj = await env.SINDI_BUCKET.get(STATE_KEY);
      const current = obj ? await obj.json() : {};
      const next = mergePatch(current, body.patch);
      next._rev = (current._rev || (obj ? 1 : 0)) + 1;
      next.updatedAt = new Date().toISOString();

      // Copia de respaldo rotativa: una por hora (168 archivos como máximo,
      // se pisan solas cada semana).
      const d = new Date();
      const hourKey = d.toISOString().slice(0, 13);
      const doBackup = current._lastBackupHour !== hourKey;
      if (doBackup) next._lastBackupHour = hourKey;

      const text = JSON.stringify(next);
      const opts = { httpMetadata: { contentType: 'application/json' } };
      if (obj) opts.onlyIf = { etagMatches: obj.etag };
      const written = await env.SINDI_BUCKET.put(STATE_KEY, text, opts);
      if (written) {
        if (doBackup && ctx) {
          const slot = '_state/backup/' + d.getUTCDay() + '-' + String(d.getUTCHours()).padStart(2, '0') + '.json';
          ctx.waitUntil(env.SINDI_BUCKET.put(slot, text, { httpMetadata: { contentType: 'application/json' } }));
        }
        return json({ ok: true, rev: next._rev, state: next });
      }
      // Alguien escribió en el medio: se vuelve a leer y se reintenta.
    }
    return json({ ok: false, error: 'El servidor está ocupado, reintentá en unos segundos.' }, 409);
  }

  return json({ ok: false, error: 'Pedido de estado no reconocido (versión vieja de la app en caché?). Recargá la página.' }, 400);
}

// Aplica un patch { collections: { nombre: { upsert:[...], remove:[ids] } }, seq:{...} }
// sobre el estado. Función pura (sin red): se puede probar aparte.
function mergePatch(state, patch) {
  const out = Object.assign({}, state);
  const cols = (patch && patch.collections) || {};
  const newIds = {};

  for (const name of Object.keys(cols)) {
    if (!/^[a-zA-Z]+$/.test(name)) continue;
    const c = cols[name] || {};
    const removeSet = new Set(Array.isArray(c.remove) ? c.remove : []);
    let list = (Array.isArray(out[name]) ? out[name] : []).filter(it => it && !removeSet.has(it.id));
    const index = new Map(list.map((it, i) => [it.id, i]));
    newIds[name] = new Set();
    for (const it of (Array.isArray(c.upsert) ? c.upsert : [])) {
      if (!it || !it.id) continue;
      if (index.has(it.id)) list[index.get(it.id)] = it;
      else { index.set(it.id, list.length); list.push(it); newIds[name].add(it.id); }
    }
    out[name] = list;
  }

  const seq = Object.assign({}, state.seq || {});
  const pseq = (patch && patch.seq) || {};
  for (const k of Object.keys(pseq)) seq[k] = Math.max(Number(seq[k]) || 0, Number(pseq[k]) || 0);

  // Códigos correlativos repetidos entre registros NUEVOS y los existentes.
  for (const name of Object.keys(CODE_SEQ)) {
    if (!Array.isArray(out[name]) || !newIds[name] || !newIds[name].size) continue;
    const key = CODE_SEQ[name];
    const seen = new Set();
    for (const it of out[name]) {
      if (newIds[name].has(it.id) && it.code && seen.has(it.code)) {
        const prefix = String(it.code).split('-')[0];
        let n = (Number(seq[key]) || 0) + 1;
        while (seen.has(prefix + '-' + String(n).padStart(3, '0'))) n++;
        seq[key] = n;
        it.code = prefix + '-' + String(n).padStart(3, '0');
      }
      if (it.code) seen.add(it.code);
    }
  }
  out.seq = seq;

  if (Array.isArray(out.audit)) {
    out.audit = out.audit.slice().sort((a, b) => String(b.ts || '').localeCompare(String(a.ts || ''))).slice(0, MAX_AUDIT);
  }
  return out;
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
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...cors() },
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
    case 'deleteFiles': return handleDeleteFiles(body, env);
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
  if (String((body.folderPath || [])[0]) === '_state') return { ok: false, error: 'Ruta reservada.' };
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
  if (isReservedKey(body.fileId)) return { ok: false, error: 'Archivo reservado.' };
  await env.SINDI_BUCKET.delete(body.fileId);
  return { ok: true };
}

// Borra varios archivos de una vez (p. ej. al quitar una patología con sus fotos).
async function handleDeleteFiles(body, env) {
  const keys = (Array.isArray(body.fileIds) ? body.fileIds : [])
    .filter(k => typeof k === 'string' && k && !isReservedKey(k));
  for (let i = 0; i < keys.length; i += 500) {
    await env.SINDI_BUCKET.delete(keys.slice(i, i + 500));
  }
  return { ok: true, deleted: keys.length };
}

async function streamFile(request, url, env) {
  const key = url.searchParams.get('key');
  if (!key) return json({ ok: false, error: 'Falta el parámetro key.' }, 400);
  if (isReservedKey(key)) return json({ ok: false, error: 'No encontrado.' }, 404);
  const obj = await env.SINDI_BUCKET.get(key);
  if (!obj) return json({ ok: false, error: 'No encontrado.' }, 404);
  const headers = new Headers(cors());
  obj.writeHttpMetadata(headers);
  headers.set('etag', obj.httpEtag);
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  headers.set('Content-Disposition', 'inline');
  return new Response(obj.body, { headers });
}
