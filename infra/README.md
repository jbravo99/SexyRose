## Infraestructura y despliegue

Un solo servidor (VPS FlokiNET, Países Bajos, Ubuntu 24.04/26.04) con Docker Compose:

| Servicio      | Qué es                                            | Puertos                         |
|---------------|---------------------------------------------------|---------------------------------|
| `app`         | Node 22: páginas, API, admin y demo (`app/`)       | ninguno publicado (red interna) |
| `db`          | Postgres 16, volumen `pgdata`                      | ninguno (red sin salida a internet) |
| `cloudflared` | Cloudflare Tunnel: la única entrada del público    | ninguno (conexión saliente a Cloudflare) |

El servidor expone solamente SSH. El tráfico web entra por Cloudflare y llega al app por el túnel en `http://app:3000`.

### Archivos

- `app/Dockerfile` — imagen única. Contexto de build = raíz del repo (`docker build -f app/Dockerfile .`). Etapa 1 genera la demo desde `mvp/` con `app/scripts/build-demo.*` (se cambia en un solo lugar: `ARG DEMO_BUILD_SCRIPT` al principio del Dockerfile); etapa 2 es el runtime, usuario `node`, healthcheck a `/healthz`.
- `.dockerignore` — en la raíz (es la del contexto de build).
- `.env.example` — todas las variables, comentadas. El `.env` real nunca va al repo.
- `infra/docker-compose.yml` — producción. `infra/docker-compose.dev.yml` — override para la Mac.
- `infra/gen-env.sh` — crea `.env` con claves aleatorias.
- `infra/server/setup.sh` — prepara y endurece el VPS. `infra/server/deploy.sh` — despliega/actualiza. `infra/server/install-timers.sh` — instala los timers de copias y monitoreo.
- `infra/backup/backup.sh` + `infra/backup/restore.md` — copias de la base.
- `infra/monitor/check.sh` — chequeo cada 5 minutos con aviso por Telegram.
- `infra/systemd/` — plantillas de los timers.

---

### Correr en la Mac (Docker Desktop)

Desde la raíz del repo:

```bash
bash infra/gen-env.sh --dev        # crea .env con SITE_URL=http://localhost:3000 (una sola vez)
docker compose -f infra/docker-compose.yml -f infra/docker-compose.dev.yml up --build
```

- Sitio: http://localhost:3000 — demo: http://localhost:3000/demo/ — admin: http://localhost:3000/admin
- Usuario del admin: `admin`. Clave: `grep ^ADMIN_PASSWORD= .env`
- No necesita token del túnel: cloudflared no se levanta con el override.
- Frenar: `Ctrl+C` o `docker compose -f infra/docker-compose.yml -f infra/docker-compose.dev.yml down`
- Borrar también la base local: agregar `-v` al `down`.

La imagen construye igual en arm64 (Mac) y amd64 (servidor).

---

### Primer deploy en el servidor

Datos que necesitás: IP del VPS, el usuario sudo que creaste al contratar (`USUARIO`) y tu clave `~/.ssh/sexyrose_srv1`.

#### 1. Preparar el servidor

Desde la Mac, subir el script de preparación y entrar:

```bash
scp -o IdentitiesOnly=yes -i ~/.ssh/sexyrose_srv1 infra/server/setup.sh USUARIO@IP:~/
ssh -o IdentitiesOnly=yes -i ~/.ssh/sexyrose_srv1 USUARIO@IP
```

En el servidor:

```bash
sudo bash ~/setup.sh
```

Qué hace: actualiza todo, activa actualizaciones automáticas de seguridad (con reinicio a las 04:30 UTC si hace falta, 01:30 en Argentina), firewall que solo deja entrar SSH, fail2ban para SSH, desactiva contraseñas y login de root en SSH (antes verifica que tengas tu clave cargada), 4 GB de swap, zona horaria UTC, Docker oficial con compose, rotación de logs.

Al terminar, **sin cerrar esa sesión**, abrí otra terminal en la Mac y probá entrar de nuevo con `ssh -o IdentitiesOnly=yes -i ~/.ssh/sexyrose_srv1 USUARIO@IP`. Si entra, cerrá la vieja. Volver a entrar es necesario igual para que tome el grupo `docker`.

#### 2. Clave de despliegue para GitHub (solo lectura)

El repo `jbravo99/SexyRose` es privado. El servidor usa su propia clave, generada en el servidor y con permiso de solo lectura sobre ese repo. **Nunca copies tu clave personal al servidor.**

En el servidor:

```bash
ssh-keygen -t ed25519 -C "sexyrose-srv1-deploy" -f ~/.ssh/sexyrose_deploy -N ""
cat ~/.ssh/sexyrose_deploy.pub
cat >> ~/.ssh/config <<'EOF'
Host github.com
  HostName github.com
  User git
  IdentityFile ~/.ssh/sexyrose_deploy
  IdentitiesOnly yes
EOF
chmod 600 ~/.ssh/config
```

En GitHub: repo `SexyRose` > Settings > Deploy keys > Add deploy key. Título: `srv1 (solo lectura)`. Pegar la línea que mostró `cat ... .pub`. **No tildar** "Allow write access".

Probar y clonar:

```bash
ssh -T git@github.com
```

La primera vez pregunta por la huella de GitHub. Tiene que ser `SHA256:+DiY3wvvV6TuJJhbpZisF/zLDA0zPMSvHdkr4UvCOqU` (ED25519; comparala con la página "GitHub's SSH key fingerprints" de docs.github.com). Si coincide, `yes`. Tiene que responder "Hi jbravo99/SexyRose! You've successfully authenticated...".

```bash
git clone git@github.com:jbravo99/SexyRose.git ~/SexyRose
cd ~/SexyRose
```

#### 3. Crear el túnel en Cloudflare

Requisito: `sexyrose.net` agregado a Cloudflare con los nameservers ya apuntando ahí.

1. Cloudflare > Zero Trust > Networks > Tunnels > Create a tunnel > tipo **Cloudflared** > nombre `sexyrose-srv1`.
2. En "Install and run connector" elegí **Docker**. El comando que muestra termina en `--token eyJ...`. Copiá solo el token (lo que va después de `--token`). No corras ese comando: el servidor ya tiene cloudflared en el compose.
3. Siguiente paso, **Public hostnames** (en el panel nuevo puede llamarse "Published application routes"). Agregar dos:
   - Subdomain vacío, Domain `sexyrose.net`, Service type `HTTP`, URL `app:3000`
   - Subdomain `www`, Domain `sexyrose.net`, Service type `HTTP`, URL `app:3000`
4. Si ya existían registros DNS A/AAAA/CNAME para `sexyrose.net` o `www`, Cloudflare no puede crear los del túnel: borralos antes en DNS > Records.
5. Recomendado: SSL/TLS > Edge Certificates > **Always Use HTTPS** activado.

#### 4. Variables de entorno

En el servidor:

```bash
cd ~/SexyRose
bash infra/gen-env.sh
nano .env
```

- `TUNNEL_TOKEN=` pegar el token del paso anterior.
- Opcionales: `OPERATOR_NAME`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `AGE_RECIPIENT` (ver Copias y Monitoreo).
- Guardá la clave del admin en tu gestor: `grep ^ADMIN_PASSWORD= .env`

`gen-env.sh` no muestra las claves (salvo con `--show`), deja el archivo con permisos 600 y se niega a pisar un `.env` existente.

#### 5. Desplegar

```bash
bash ~/SexyRose/infra/server/deploy.sh
```

Construye la imagen, levanta todo, espera a que el app esté healthy y muestra el estado y las últimas líneas de cloudflared (tiene que aparecer `Registered tunnel connection`).

#### 6. Copias y monitoreo automáticos

```bash
sudo bash ~/SexyRose/infra/server/install-timers.sh
bash ~/SexyRose/infra/backup/backup.sh     # primera copia ya, para no esperar a las 03:15
```

#### 7. Verificar

Desde la Mac:

```bash
curl -s https://sexyrose.net/healthz          # {"ok":true}
curl -sI https://www.sexyrose.net | head -1
```

En el servidor, confirmar que no escucha nada hacia afuera salvo SSH:

```bash
sudo ss -tlnp          # solo :22 (y 127.0.0.53/127.0.0.54 del DNS local)
sudo ufw status
```

---

### Actualizar

1. En la Mac: commit y `git push`.
2. En el servidor:

```bash
bash ~/SexyRose/infra/server/deploy.sh
```

Para volver a una versión anterior: `cd ~/SexyRose && git checkout <commit>` y `bash infra/server/deploy.sh --no-pull`. Para volver a la última: `git checkout main` y deploy normal.

Atajo útil (agregalo a `~/.bashrc` del servidor):

```bash
alias dc='docker compose -f ~/SexyRose/infra/docker-compose.yml'
```

---

### Copias de seguridad

- Todos los días a las 03:15 UTC: `pg_dump` de la base, gzip y cifrado con `age`, en `~/backups/`. Se conservan 14.
- Cifrado: generá el par de claves **en tu Mac** (`brew install age && age-keygen -o ~/.config/sexyrose/backup-age.key`), poné la clave pública (`age1...`) en `AGE_RECIPIENT` del `.env` del servidor y guardá la privada en el gestor. Sin `AGE_RECIPIENT` las copias quedan sin cifrar y el script avisa.
- Copia a mano: `bash ~/SexyRose/infra/backup/backup.sh`
- Ver la última ejecución: `journalctl -u sexyrose-backup.service -n 30 --no-pager`
- Restaurar: `infra/backup/restore.md`.
- **Pendiente:** copia fuera del servidor (Storj o Backblaze B2, sin elegir). Hasta entonces, bajá copias a la Mac de vez en cuando: `scp -o IdentitiesOnly=yes -i ~/.ssh/sexyrose_srv1 'USUARIO@IP:backups/*.age' ~/sexyrose-backups/`

### Monitoreo

Cada 5 minutos `infra/monitor/check.sh` revisa: app healthy, `db` y `cloudflared` corriendo, disco por encima del 80 %, y que la última copia tenga menos de 26 h.

Avisa por Telegram si `TELEGRAM_BOT_TOKEN` y `TELEGRAM_CHAT_ID` están en `.env` (los mismos que usa el app para avisar denuncias). Avisa una vez al fallar, recuerda cada 6 h si sigue igual y avisa cuando se resuelve. Sin Telegram, los mensajes quedan solo en el journal.

Armar el bot: en Telegram hablale a `@BotFather` > `/newbot` > te da el token. Mandale cualquier mensaje a tu bot y abrí `https://api.telegram.org/bot<TOKEN>/getUpdates` en el navegador: el `chat.id` que aparece es el `TELEGRAM_CHAT_ID`. Después de editar `.env`, reiniciá el app para que lo tome: `docker compose -f ~/SexyRose/infra/docker-compose.yml up -d app`.

Probar: `bash ~/SexyRose/infra/monitor/check.sh` (si todo está bien no imprime nada).

### Logs

```bash
cd ~/SexyRose
docker compose -f infra/docker-compose.yml ps
docker compose -f infra/docker-compose.yml logs -f app            # en vivo
docker compose -f infra/docker-compose.yml logs --since 1h app
docker compose -f infra/docker-compose.yml logs --tail 50 cloudflared
docker compose -f infra/docker-compose.yml logs --tail 50 db
journalctl -u sexyrose-monitor.service --since today --no-pager
journalctl -u sexyrose-backup.service -n 30 --no-pager
sudo fail2ban-client status sshd                                   # IPs bloqueadas
ls /var/log/unattended-upgrades/                                   # actualizaciones automáticas
```

Los logs de los contenedores rotan solos (10 MB x 3 por contenedor) y el journal tiene tope de 500 MB.

### A tener en cuenta

- `cloudflared` usa el tag `latest` (`infra/docker-compose.yml`); `deploy.sh` lo actualiza con `compose pull` en cada deploy. Mejora pendiente: fijar un tag de hub.docker.com/r/cloudflare/cloudflared/tags. Cloudflare da soporte a versiones de hasta un año.
- `POSTGRES_PASSWORD` solo se aplica cuando se crea el volumen `pgdata` por primera vez. Cambiarla después en `.env` rompe la conexión del app (ver `restore.md`).
- Estar en el grupo `docker` equivale a ser root en el servidor. Solo tu usuario debe estarlo.
- Docker se saltea ufw para los puertos que publica. En producción no se publica ninguno; no agregues `ports:` al compose de producción.
- El reinicio automático de las 04:30 UTC puede cortar el sitio uno o dos minutos; todo vuelve solo (`restart: unless-stopped`).
- Opcional: proteger `/admin` además con Cloudflare Access (Zero Trust > Access > Applications) para que ni siquiera llegue la pantalla de clave a terceros.
