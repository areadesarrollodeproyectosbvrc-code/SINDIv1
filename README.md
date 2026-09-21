# SINDI
**Sistema Integral de Necesidades y Diagnóstico de Infraestructura**
Bomberos Voluntarios de Río Cuarto

SINDI es una app web (HTML + CSS + JavaScript, sin frameworks) publicada
como **un solo Worker de Cloudflare**. Ese Worker sirve la app y, en el
mismo dominio, una API de archivos que guarda todo (fotos, comprobantes,
planos) directo en **Cloudflare R2**. No hay Google Drive ni Apps Script
en ningún punto, y la app no necesita ninguna URL cargada a mano: todo
queda configurado con el propio deploy.

```
SINDI (Worker de Cloudflare)
 ├── / , /index.html, /js/*, /css/*, /icons/*   → app (Workers Static Assets)
 └── /api/storage, /api/file                    → API de archivos → R2
```

Los datos de gestión (cuarteles, espacios, necesidades, proyectos,
eventos, usuarios, auditoría) también viven en el servidor (R2, vía
`/api/state`): **ningún dato se guarda en el dispositivo**, todos los
que entran a SINDI ven lo mismo. Lo único que recuerda el navegador es
quién está logueado y en qué pantalla está (para no volver al inicio al
recargar).

---

## 0. Novedades de esta versión

- **Panel General rediseñado (estilo sala de control)**: en escritorio todo
  el Inicio entra en una sola pantalla, sin scroll. Cada marcador muestra
  solo el dato más relevante y sigue llevando a su sección al tocarlo.
  El calendario distingue por color **eventos (celeste)** y **tareas
  (ámbar)**, con navegación por mes y agenda del día elegido. En celular
  y tablet las tarjetas se apilan (calendario primero) con áreas de toque
  de 44 px. Código en `js/app-dashboard.js` y estilos en `css/dashboard.css`.
- **iPhone / Android**: respeta notch y barra de estado (`viewport-fit=cover`
  + `env(safe-area-inset-*)`), inputs a 16 px (evita el zoom automático de
  iOS) y barra superior que no desborda en pantallas angostas.
- Se corrigió `todayISO()`: usaba hora UTC, por lo que en Argentina, después
  de las 21:00, "hoy" era mañana (afectaba fechas por defecto y vencimientos).

- **Todo en Cloudflare**: se sacó Google Drive/Apps Script por completo.
  Un solo Worker sirve la app y la API de archivos (R2) en el mismo
  dominio — cero configuración manual de URLs desde la app.
- **Compras**: cada compra tiene su propio apartado de comprobantes/fotos
  (JPG o PDF), con miniatura y sin un paso extra para adjuntar.
- **Impresión a PDF con fotos**: se corrigió un bug real donde el diálogo
  de impresión se disparaba antes de que las fotos terminaran de cargar,
  dejándolas en blanco. Ahora se espera a que carguen (con un techo de
  tiempo) antes de imprimir.
- **Usuarios**: los 5 perfiles fijos (Leonardo Villarreal, Micaela Mercado,
  Ulises Sayago, Nicolás Cabral, Victoria Torres) siguen existiendo como base
  inicial, con contraseña `0405` editable. Los usuarios nuevos (\"+ Nuevo
  usuario\" en el login) cargan su propio usuario y contraseña.
- **Ajustes / Personal**: cada usuario edita su nombre, área/especialidad,
  rol, imagen de perfil y contraseña desde **Ajustes**. \"Personal\" muestra
  esos mismos datos en modo solo lectura para todos.
- **Proyectos**: estructura de archivos por proyecto
  `PROYECTOS/<código> - <nombre>/{PLANOS, ARCHIVOS, PRESUPUESTOS}`. Campo
  \"Inversión\" (en millones de pesos).
- **Relevamientos**: cada espacio tiene su propia carpeta de \"Fotos
  generales\" (separada de las fotos por patología) y un apartado
  \"Instalaciones\" (Electricidad, Plomería, CCTV, Climatización).
- **Panel General**: franja de estadísticas compacta, tarjetas de
  \"últimos 3 registros\" por sección, clickeables a su ficha.

## 1. Estructura del proyecto

```
sindi/
├── index.html                 → página principal
├── worker.js                  → Worker de Cloudflare: app estática + API de R2
├── wrangler.jsonc             → configuración de despliegue (nombre, bucket)
├── manifest.webmanifest       → PWA: nombre, iconos, colores
├── sw.js                      → PWA: service worker (offline + caché)
├── icons/                     → iconos de la app instalada
├── .assetsignore              → qué NO se publica como parte del sitio
├── .gitignore
├── .github/workflows/
│   └── deploy-cloudflare.yml  → despliegue automático a Cloudflare en cada push
├── css/
│   ├── styles.css             → estilos generales y ajustes para celular
│   └── dashboard.css          → estilos del Panel General (sala de control)
└── js/
    ├── config.js              → endpoint de almacenamiento (relativo) y nombre de la organización
    ├── storage.js              → sincronización del estado con el servidor (/api/state)
    ├── api.js                  → comunicación con el Worker (/api/storage)
    ├── app-core.js             → login, navegación, reloj
    ├── app-dashboard.js        → Panel General (Inicio): marcadores, calendario eventos/tareas
    ├── app-catalog.js          → dependencias, espacios, patologías + fotos
    ├── app-needs-projects.js   → necesidades, proyectos (con COMPLETADOS, etapa y render), eventos
    ├── app-milestones.js       → plan de trabajo: hitos y curva de avance
    ├── app-materials-purchases.js → cómputo de materiales y compras (con comprobantes)
    ├── app-requests.js         → apartado "Pedidos"
    ├── app-maintenance.js      → mantenimiento y tareas
    ├── app-files.js            → apartado "Archivos" (gestor documental genérico)
    ├── app-users.js            → "Ajustes" y "Personal"
    ├── app-audit.js            → auditoría
    ├── app-export.js           → exportar a Excel / informes PDF A4
    └── app-init.js             → router e inicialización
```

No hay credenciales ni claves en el código del repositorio: el Worker
usa un binding nativo a R2 (Cloudflare lo resuelve solo, sin Access Keys
ni Secrets) y el despliegue automático usa un token guardado como
secreto de GitHub, nunca en el código.

---

## 2. Puesta en marcha

Ver **`PUESTA_EN_MARCHA.md`** para la guía paso a paso completa (primer
deploy manual + deploy automático con GitHub Actions). En resumen:

```bash
npx wrangler login
npx wrangler r2 bucket create sindi-archivos
npx wrangler deploy
```

Con eso, la app queda publicada y funcionando en una URL tipo
`https://sindi.tu-cuenta.workers.dev`, ya con el almacenamiento
conectado — no hay un paso 2 de "configurar la URL desde Ajustes".

### Publicar una versión nueva

Cualquier cambio se sube con `git push` a `main`: el workflow de GitHub
Actions despliega solo. También se puede hacer manualmente con
`npx wrangler deploy` desde la carpeta del repo.

Cuando cambies archivos de la app (no del Worker), subí el número de
versión en `sw.js`:

```javascript
const CACHE_VERSION = 'sindi-v25';   // antes: sindi-v24
```

Sin eso, los navegadores que ya tienen la app instalada pueden seguir
usando archivos viejos en caché.

### Instalar la app (PWA)

- **Android / Chrome**: menú ⋮ → *Instalar aplicación*.
- **iPhone / Safari**: Compartir → *Agregar a pantalla de inicio*.
- **Escritorio**: ícono de instalar en la barra de direcciones.

---

## 3. Variables que se pueden ajustar

| Variable | Archivo | Qué es |
|---|---|---|
| `ORG_NAME` | `js/config.js` | Nombre que aparece en login e impresiones |
| `CACHE_VERSION` | `sw.js` | Subir el número con cada publicación nueva |
| `name` / `r2_buckets` | `wrangler.jsonc` | Nombre del Worker y del bucket de R2 |

No hay ninguna URL de almacenamiento para configurar: `STORAGE_ENDPOINT`
en `js/config.js` es siempre `/api/storage` (mismo origen).

---

## 4. Cómo funciona la comunicación SINDI → Worker → R2

1. El usuario selecciona un archivo o foto en SINDI (una foto de
   patología, un plano, un comprobante de compra).
2. El navegador convierte el archivo a **base64** y hace un `fetch()`
   con método `POST` hacia `/api/storage` (mismo dominio), enviando un
   JSON con la acción (`uploadFile`), la ruta destino, el nombre, el
   tipo de archivo y el contenido en base64.
3. El Worker recibe el pedido y escribe el archivo directo en el bucket
   de R2 (binding nativo, sin credenciales expuestas), bajo una key
   única armada a partir de la ruta y el nombre.
4. SINDI guarda ese metadato (nombre, URL, fecha, descripción) en el
   estado compartido (`/api/state`) para mostrarlo en la interfaz. La URL que devuelve el
   Worker (`/api/file?key=...`) sirve tanto para la miniatura (`<img>`)
   como para abrir el archivo — el propio Worker transmite los bytes
   con el `Content-Type` correcto.
5. Para listar archivos ya subidos (por ejemplo, los de un proyecto),
   SINDI le pide al Worker el listado real de esa carpeta (acción
   `listFiles`), como respaldo del metadato local.

---

## 5. Notas y límites de esta versión

- El estado de gestión (cuarteles, espacios, necesidades, proyectos,
  eventos, auditoría, usuarios) vive **solo en el servidor** (R2, vía
  `/api/state`). Al abrir la app se descarga; cada cambio se envía como
  un parche (solo los registros modificados/nuevos/borrados), que el
  Worker aplica sobre la última versión con escritura condicional
  (etag) — así dos personas editando registros distintos a la vez no se
  pisan. Si dos editan el *mismo* registro a la vez, gana el último en
  guardar. Cada ~8 segundos la app consulta si hubo cambios de otros.
- **Borrado de archivos**: cuando se quita cualquier archivo del programa
  (foto general, foto de patología, plano, comprobante, documento), se
  borra también de R2. Quitar una patología borra sus fotos; quitar una
  compra borra sus comprobantes; dar de baja una dependencia borra su
  plano; reemplazar un plano borra el anterior. Si el servidor no responde,
  el registro se conserva y se avisa, para no dejar archivos huérfanos.
- Se necesita conexión para abrir la app y guardar. Un indicador en la
  barra superior muestra "Sincronizado / Guardando… / Sin conexión".
- El Worker guarda una copia de respaldo por hora (rotativa, 7 días) en
  `_state/backup/` dentro del mismo bucket.
- Al recargar, la app vuelve a la misma pantalla y sesión (se recuerdan
  24 h; `SESSION_MAX_HOURS` en `js/app-core.js`).
- `GET /api/state` (sin parámetros) devuelve el estado de la app (activo,
  revisión, cantidad de registros) sin exponer los datos.
- Migración: si un dispositivo tiene datos de versiones anteriores en
  `localStorage`, se suben una sola vez al servidor y se borran del
  dispositivo.
- La exportación a Excel usa la librería [SheetJS](https://sheetjs.com/)
  cargada desde CDN.
- La impresión a PDF usa el diálogo nativo de impresión del navegador
  (`Ctrl/Cmd + P` → Guardar como PDF), con una hoja de estilos dedicada
  a formato A4, esperando a que las imágenes carguen antes de imprimir.
