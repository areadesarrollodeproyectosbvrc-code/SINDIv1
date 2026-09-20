/* ============================================================
   CONFIGURACIÓN DE SINDI

   El almacenamiento de archivos es Cloudflare R2, servido por el mismo
   Worker que sirve la app (ver worker.js y wrangler.jsonc en la raíz
   del repo). Como app y API viven en el mismo dominio, no hace falta
   configurar ninguna URL a mano desde ningún lado: STORAGE_ENDPOINT es
   siempre una ruta relativa a este mismo origen. No hay Google Drive
   ni Apps Script en ningún punto de esta app.
   ============================================================ */

const STORAGE_ENDPOINT = '/api/storage';

// Nombre visible de la organización (aparece en login e impresiones)
const ORG_NAME = "Bomberos Voluntarios de Río Cuarto";

// El almacenamiento está integrado en el propio deploy (mismo Worker),
// así que siempre está disponible en producción. El nombre de esta
// constante quedó de una versión anterior donde Drive/el Worker eran
// opcionales — se mantiene así porque la usan varios archivos del
// proyecto, para no tener que tocar cada uno.
const DRIVE_ENABLED = true;
