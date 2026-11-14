# Sabores de Latinoamérica — barebones

Atlas gastronómico interactivo de Latinoamérica: mapa, países, recetas, ingredientes, videos, favoritos y panel de administración. Esta es una copia **barebones**: conserva la aplicación y su API, pero no incluye páginas legales, consentimiento de cookies, tests, CI ni documentación de compliance.

## Stack

- **Frontend:** React 19 + TypeScript + Vite 8, React Router, TanStack Query, GSAP y Lenis.
- **Backend:** Node 24+ con Fastify 5, MySQL/MariaDB y `mysql2`.
- **Servidor:** Apache de XAMPP sirviendo `frontend/dist` y proxeando la API a Node.
- **Base de datos:** `sabores_barebones`, creada desde un único archivo SQL.

## Estructura

| Ruta | Contenido |
|---|---|
| `frontend/` | SPA React + Vite. |
| `backend/` | API Fastify, auth, favoritos, admin y CLI de administrador. |
| `db/sabores_barebones.sql` | Esquema completo + datos de países, recetas e ingredientes. |
| `.htaccess` | Defensa en profundidad y cabeceras de seguridad. |

## Requisitos

- XAMPP con Apache y MySQL/MariaDB iniciados.
- Node.js 24 o superior (`node -v`).
- Puerto `3002` libre para el backend y `80` para Apache.

## 1. Base de datos

El SQL crea la base `sabores_barebones` y carga todo el contenido. Importalo en un servidor MySQL/MariaDB vacío:

```powershell
mysql -u root --default-character-set=utf8mb4 < db/sabores_barebones.sql
```

También podés importarlo desde phpMyAdmin (pestaña **Importar**). Si la base ya existe y querés recrearla:

```sql
DROP DATABASE IF EXISTS sabores_barebones;
```

Después volvé a importar el archivo.

## 2. Backend

```powershell
cd backend
npm ci
Copy-Item .env.example .env
```

Completá `backend/.env`:

```dotenv
DB_HOST=127.0.0.1
DB_NAME=sabores_barebones
DB_USER=root
DB_PASS=

JWT_SECRET=<clave aleatoria de al menos 32 caracteres>
JWT_TTL=900
SESSION_DAYS=7

CORS_ORIGIN=
COOKIE_SECURE=auto
APP_DEBUG=0

ADMIN_USER=<usuario admin>
ADMIN_PASS=<contraseña admin>

PORT=3002
BASE_PATH=/sabores-barebones/api
COOKIE_PATH=/sabores-barebones/api
TRUST_PROXY=127.0.0.1
```

Generá el `JWT_SECRET` con:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Compilá y arrancá la API:

```powershell
npm run build
npm start
```

`npm start` tiene que quedar corriendo en otra consola. El backend escucha en `127.0.0.1:3002`.

Creá el administrador inicial (lee `ADMIN_USER`/`ADMIN_PASS` de `.env`):

```powershell
npm run create-admin
```

El registro web solo crea usuarios comunes. El rol `admin` se otorga únicamente con este comando. Si el admin ya existe y rotaste `ADMIN_PASS`, actualizá la clave con:

```powershell
npm run create-admin -- --force
```

## 3. Frontend

```powershell
cd frontend
npm ci
Copy-Item .env.example .env
npm run build
```

El build queda en `frontend/dist` y `frontend/.env` apunta a la API correcta:

```dotenv
VITE_API_BASE=/sabores-barebones/api
```

Para desarrollo con hot reload:

```powershell
npm run dev
```

Vite sirve en `http://localhost:5173/sabores-barebones/` y proxya `/sabores-barebones/api` a Apache.

## 4. Apache

El bloque de este proyecto ya está aplicado en `httpd.conf`; verificalo o agregalo después de los bloques existentes:

```apache
# --- sabores-barebones ---
ProxyPass /sabores-barebones/api http://127.0.0.1:3002/sabores-barebones/api
ProxyPassReverse /sabores-barebones/api http://127.0.0.1:3002/sabores-barebones/api

Alias /sabores-barebones/ "C:/xampp/htdocs/sabores-barebones/frontend/dist/"
<Directory "C:/xampp/htdocs/sabores-barebones/frontend/dist">
    Options +FollowSymLinks -Indexes
    AllowOverride None
    Require all granted
    <IfModule mod_headers.c>
        Header always set X-Content-Type-Options "nosniff"
        Header always set X-Frame-Options "DENY"
        Header always set Referrer-Policy "strict-origin-when-cross-origin"
        Header always set Permissions-Policy "camera=(), microphone=(), geolocation=()"
    </IfModule>
    <FilesMatch "index\.html$">
        <IfModule mod_headers.c>
            Header set Cache-Control "no-cache, must-revalidate"
        </IfModule>
    </FilesMatch>
    <FilesMatch "\.(js|css|woff2)$">
        <IfModule mod_headers.c>
            Header set Cache-Control "public, max-age=31536000, immutable"
        </IfModule>
    </FilesMatch>
    <IfModule mod_deflate.c>
        AddOutputFilterByType DEFLATE text/html text/plain text/css application/javascript application/json image/svg+xml
    </IfModule>
    FallbackResource /sabores-barebones/index.html
</Directory>
# Un asset inexistente debe dar 404, no el index.
<Directory "C:/xampp/htdocs/sabores-barebones/frontend/dist/assets">
    Options +FollowSymLinks -Indexes
    AllowOverride None
    Require all granted
    FallbackResource disabled
</Directory>
```

Requiere `mod_headers`, `mod_deflate` y `mod_filter` habilitados. Validá la configuración y reiniciá Apache:

```powershell
C:\xampp\apache\bin\httpd.exe -t
C:\xampp\apache\bin\httpd.exe -k restart
```

Antes de editar `httpd.conf`, hacé una copia de respaldo.

### Producción HTTPS

Detrás de Apache, `COOKIE_SECURE=auto` puede no detectar TLS si el proxy no envía `X-Forwarded-Proto`. En producción, forzá `COOKIE_SECURE=1` en `backend/.env` o agregá en el vhost 443:

```apache
RequestHeader set X-Forwarded-Proto "https"
```

Asegurate también de que Apache reenvíe `X-Forwarded-For` para que el rate limiting y las sesiones usen la IP real.

## URLs

- Sitio: `http://localhost/sabores-barebones/`
- Health de la API: `http://localhost/sabores-barebones/api/health`
- Deep link de ejemplo: `http://localhost/sabores-barebones/pais/1`

## Scripts

### Backend

| Script | Función |
|---|---|
| `npm run dev` | API con recarga en caliente (`tsx watch`). |
| `npm run build` | Compila TypeScript a `dist/`. |
| `npm start` | Arranca `dist/server.js`. |
| `npm run lint` | Biome. |
| `npm run typecheck` | TypeScript sin emitir. |
| `npm run create-admin` | Crea o actualiza el admin inicial. |

### Frontend

| Script | Función |
|---|---|
| `npm run dev` | Vite en modo desarrollo. |
| `npm run build` | Typecheck + build de producción en `dist/`. |
| `npm run preview` | Sirve el build localmente. |
| `npm run lint` | Biome. |
| `npm run typecheck` | TypeScript sin emitir. |

## Notas

- Esta copia **no** incluye banner ni preferencias de cookies, políticas de privacidad/términos, auditoría de compliance, tests, E2E, CI, OpenAPI ni Drizzle.
- El video de YouTube se carga con click explícito desde `youtube-nocookie.com`.
- Se mantienen auth con refresh token, rate limits, borrado de cuenta, cabeceras de seguridad y panel de sesiones.
- `backend/.env` y `frontend/.env` no se versionan. No subas secretos.
- Si el sitio devuelve 502, verificá que `npm start` esté corriendo en el puerto 3002.
- Si el login entra en loop, revisá que `COOKIE_PATH` y `VITE_API_BASE` sean `/sabores-barebones/api`.
- Si la página queda en blanco, revisá que `base` de Vite, `Alias`, `FallbackResource` y la URL coincidan en `/sabores-barebones/`.
