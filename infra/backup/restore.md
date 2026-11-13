# Restaurar una copia

Las copias están en la PC de casa, en `DESTINO` (por defecto `~/sexyrose-copias`), dentro de `diarias/`, `semanales/` o `mensuales/`. Cada juego es una carpeta `sexyrose-AAAAMMDDTHHMMSSZ/` con:

- `…-db.dump.age` — base (pg_dump formato custom), cifrada.
- `…-data.tar.gz.age` — archivos privados de `/data`, cifrados.
- `….sha256` — sumas de control.

La clave para abrirlas está en la PC de casa: `~/.config/sexyrose-copias/age.key`. También tiene que estar en tu gestor de contraseñas.

En los comandos de abajo, `J` es la carpeta del juego que querés restaurar y `ID` su nombre. Por ejemplo:

```bash
J=~/sexyrose-copias/diarias/sexyrose-20261113T031500Z
ID=$(basename "$J")
```

## 1. Comprobar y descifrar (en la PC de casa)

```bash
cd "$J" && sha256sum -c "$ID.sha256"            # tiene que decir OK dos veces
age -d -i ~/.config/sexyrose-copias/age.key "$ID-db.dump.age"      > /tmp/db.dump
age -d -i ~/.config/sexyrose-copias/age.key "$ID-data.tar.gz.age"  > /tmp/data.tar.gz
```

## 2. Subir al servidor

```bash
scp -o IdentitiesOnly=yes -i ~/.ssh/TU_LLAVE_PERSONAL /tmp/db.dump /tmp/data.tar.gz shelbyadm@213.218.161.153:/tmp/
shred -u /tmp/db.dump /tmp/data.tar.gz
```

Usá tu llave personal de administración, no la de copias: el usuario `sr-copias` solo puede leer.

## 3. Restaurar en el servidor

```bash
cd ~/SexyRose
DC="docker compose -f infra/docker-compose.yml"
$DC stop app cloudflared                      # nadie escribe mientras restaurás (la base sigue arriba)
bash infra/backup/backup.sh                   # copia del estado actual, por las dudas

PGU="$(grep -m1 '^POSTGRES_USER=' .env | cut -d= -f2-)"
PGD="$(grep -m1 '^POSTGRES_DB=' .env | cut -d= -f2-)"
$DC exec -T db pg_restore -U "$PGU" -d "$PGD" --clean --if-exists --no-owner --exit-on-error < /tmp/db.dump

# Archivos privados: se descomprimen sobre el volumen /data con la imagen del app
$DC run --rm -T --no-deps --entrypoint tar app -xzf - -C /data < /tmp/data.tar.gz

shred -u /tmp/db.dump /tmp/data.tar.gz
bash infra/server/deploy.sh --no-pull         # vuelve a levantar todo
```

Revisá el admin y algunos perfiles (la dirección del admin: `bash infra/server/admin-path.sh`).

## Restaurar desde cero (servidor nuevo)

1. Seguí el README de `infra/` hasta tener `.env` y el primer deploy hecho. La base arranca vacía y el app crea las tablas.
2. Hacé los pasos 1 a 3 de arriba.
3. Usá el **mismo `.env`** de antes: guardalo en tu gestor de contraseñas. Importan sobre todo:
   - `SECRETS_KEY`: sin ella no se pueden leer las cuentas de Mercado Pago cargadas desde el admin.
   - `IP_HASH_SALT`: mantiene la continuidad de los hashes de IP.
   - `ADMIN_PATH`: la dirección del admin.
4. Volvé a habilitar las copias: `habilitar-copias.sh`, paso 4 de `README.md`.

Ojo: `POSTGRES_PASSWORD` solo se aplica la primera vez que se crea el volumen `pgdata`. Si la cambiás en `.env` con un volumen existente, el app no va a poder conectarse. En ese caso cambiala también adentro de Postgres (`ALTER USER sexyrose PASSWORD '...'`).

## Prueba mensual (en la PC de casa, 10 minutos)

Una copia que nunca se probó no es una copia. Una vez por mes, con la última semanal:

```bash
J=$(ls -d ~/sexyrose-copias/semanales/sexyrose-* | sort | tail -1); ID=$(basename "$J")
cd "$J" && sha256sum -c "$ID.sha256"

docker run --rm -d --name sr-prueba -e POSTGRES_PASSWORD=prueba postgres:16
sleep 8
age -d -i ~/.config/sexyrose-copias/age.key "$ID-db.dump.age" \
  | docker exec -i sr-prueba pg_restore -U postgres -d postgres --no-owner
docker exec sr-prueba psql -U postgres -c 'select count(*) as cuentas from cuentas;' -c 'select count(*) as perfiles from perfiles;'
docker rm -f sr-prueba

age -d -i ~/.config/sexyrose-copias/age.key "$ID-data.tar.gz.age" | tar -tzf - | wc -l
```

Lista de control:

- [ ] Las sumas dan OK.
- [ ] `pg_restore` termina sin errores.
- [ ] Las cantidades de cuentas y perfiles son las esperadas, parecidas a las del admin.
- [ ] El `.tar.gz` se abre y lista archivos.
- [ ] La clave `age.key` también está en el gestor de contraseñas, no solo en la PC.
- [ ] La copia más nueva tiene menos de 36 h: `ls ~/sexyrose-copias/diarias | tail -1`.
