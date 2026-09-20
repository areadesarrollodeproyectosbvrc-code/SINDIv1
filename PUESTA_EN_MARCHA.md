# SINDI — Puesta en marcha (todo en Cloudflare)

Arquitectura de esta versión: **un solo Worker de Cloudflare** sirve la
app (`index.html`, `js/`, `css/`, `icons/`) y la API de archivos
(`/api/storage`, `/api/file`), que escribe directo en un bucket de
**Cloudflare R2**. Todo en el mismo dominio: la app nunca necesita que
le pegues ninguna URL a mano.

No hay Google Drive ni Apps Script en ningún punto.

## Requisitos

- Cuenta de Cloudflare (el plan gratuito alcanza para esto).
- Repositorio en GitHub con este código.
- Node.js instalado en tu computadora, para el primer despliegue manual.

## Paso 1 — Primer despliegue, manual, desde tu computadora

Esto es lo único que se hace "a mano", una sola vez, para crear el
bucket y confirmar que todo funciona:

```
npx wrangler login
npx wrangler r2 bucket create sindi-archivos
npx wrangler deploy
```

- El primer comando abre el navegador para loguearte en Cloudflare.
- El segundo crea el bucket donde se van a guardar todos los archivos
  (solo hace falta correrlo una vez).
- El tercero publica la app completa. Al terminar te da una URL como
  `https://sindi.tu-cuenta.workers.dev` — abrila y probá que cargue,
  que puedas iniciar sesión y subir una foto de prueba.

Si más adelante querés un dominio propio (por ejemplo `sindi.tuentidad.org`
en vez de `*.workers.dev`), se conecta desde el dashboard de Cloudflare,
en el mismo proyecto del Worker → Settings → Domains & Routes.

## Paso 2 — Despliegue automático en cada push (GitHub Actions)

Para no tener que repetir `wrangler deploy` a mano cada vez que se
cambia algo, `.github/workflows/deploy-cloudflare.yml` ya viene armado
para hacerlo solo. Necesita dos secretos en GitHub:

1. **Generar un API Token de Cloudflare**: en el dashboard de
   Cloudflare → ícono de usuario (arriba a la derecha) → My Profile →
   API Tokens → Create Token → plantilla "Edit Cloudflare Workers" →
   Continue to summary → Create Token. Copiá el token que te muestra
   (una sola vez, no se puede ver de nuevo después).
2. **Copiar el Account ID**: en cualquier página del dashboard de
   Cloudflare, columna derecha, dice "Account ID".
3. En GitHub: entrá al repositorio → Settings → Secrets and variables →
   Actions → New repository secret. Cargá dos:
   - `CLOUDFLARE_API_TOKEN` → el token del paso 1.
   - `CLOUDFLARE_ACCOUNT_ID` → el ID del paso 2.

Listo. A partir de ahora, cada `git push` a `main` dispara el deploy
solo (se ve en la pestaña "Actions" del repositorio en GitHub). No hace
falta tocar nada en el dashboard de Cloudflare (ni "Root directory" ni
ninguna otra configuración de build ahí) — el workflow ya sabe qué
desplegar porque `wrangler.jsonc` está en la raíz del repo.

## Verificar que está andando

Abrí `https://tu-worker.workers.dev/api/state` directo en el navegador.
Tiene que mostrar el estado de la app, algo así:
```json
{"ok":true,"app":"SINDI","status":"activo","almacenamiento":"R2 conectado","hayDatos":true,"rev":12,...}
```
(`/api/storage` también responde un mensaje de "Worker activo".)

Si en cambio ves la app (el login de SINDI), el deploy no tomó el
`run_worker_first` de `wrangler.jsonc`: volvé a desplegar y revisá que la
URL termine exactamente en `/api/state` (sin letras de más).

## Si el deploy falla

Correlo de nuevo manualmente desde tu computadora
(`cd` a la carpeta del repo, `npx wrangler deploy`) — el mensaje de
error ahí suele ser más claro que el de GitHub Actions. Los errores más
comunes:
- **"bucket not found"**: falta el paso 1 (`wrangler r2 bucket create`).
- **Error de autenticación en GitHub Actions**: revisá que los dos
  secretos estén bien copiados (sin espacios de más) en Settings →
  Secrets and variables → Actions.

## Actualizar la app más adelante

Cualquier cambio en el código (nueva función, ajuste visual, etc.) se
sube con un `git push` normal a `main` — el deploy a Cloudflare se
dispara solo. No hace falta redesplegar nada por separado ni tocar
configuración alguna.
