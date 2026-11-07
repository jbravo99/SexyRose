# Copias de la base: cómo restaurar

Las copias las hace `infra/backup/backup.sh` (timer `sexyrose-backup.timer`, todos los días a las 03:15 UTC) y quedan en `~/backups/` del servidor:

- `sexyrose-db-AAAAMMDDTHHMMSSZ.sql.gz.age` — cifrada con `age` (si `AGE_RECIPIENT` está en `.env`).
- `sexyrose-db-AAAAMMDDTHHMMSSZ.sql.gz` — sin cifrar (solo si falta `AGE_RECIPIENT`; el script avisa).

Se conservan las últimas 14. Es un volcado SQL plano (`pg_dump --clean --if-exists`): al restaurarlo borra y recrea las tablas que contiene.

## Clave de cifrado (una vez)

En tu Mac, no en el servidor:

```bash
brew install age
age-keygen -o ~/.config/sexyrose/backup-age.key   # crear la carpeta antes si no existe
```

El comando muestra la clave pública (`age1...`). Esa línea va en el `.env` del servidor como `AGE_RECIPIENT=age1...`.
El archivo `backup-age.key` es la clave privada: guardala en el gestor de contraseñas. Sin ella las copias no se pueden abrir. Nunca la subas al servidor ni al repo.

## Traer una copia a la Mac

```bash
scp -i ~/.ssh/sexyrose_srv1 USUARIO@IP:backups/sexyrose-db-20261105T031500Z.sql.gz.age .
age -d -i ~/.config/sexyrose/backup-age.key sexyrose-db-20261105T031500Z.sql.gz.age | gunzip > dump.sql
```

## Restaurar en el servidor

1. Frenar el app para que nadie escriba mientras restaurás (la base sigue arriba):

   ```bash
   cd ~/SexyRose
   docker compose -f infra/docker-compose.yml stop app cloudflared
   ```

2. Hacer una copia del estado actual por las dudas:

   ```bash
   bash infra/backup/backup.sh
   ```

3. Restaurar. Si la copia está cifrada, la descifrás en tu Mac (paso anterior) y subís el `.sql.gz`, o subís la clave privada temporalmente y la borrás después. Lo más simple es subir el `.sql.gz` descifrado:

   ```bash
   # desde la Mac
   gzip -9 dump.sql
   scp -i ~/.ssh/sexyrose_srv1 dump.sql.gz USUARIO@IP:/tmp/
   ```

   ```bash
   # en el servidor
   cd ~/SexyRose
   PGU="$(grep -m1 '^POSTGRES_USER=' .env | cut -d= -f2-)"
   PGD="$(grep -m1 '^POSTGRES_DB=' .env | cut -d= -f2-)"
   gunzip -c /tmp/dump.sql.gz \
     | docker compose -f infra/docker-compose.yml exec -T db \
         psql -v ON_ERROR_STOP=1 -U "$PGU" -d "$PGD"
   shred -u /tmp/dump.sql.gz
   ```

4. Levantar todo de nuevo:

   ```bash
   bash infra/server/deploy.sh --no-pull
   ```

5. Revisar el panel de admin y que los datos estén (la dirección: `bash infra/server/admin-path.sh`).

## Restaurar desde cero (servidor nuevo)

Seguir el README de infra hasta tener `.env` y el deploy hecho (la base arranca vacía y el app crea las tablas). Después aplicar los pasos 1 a 4. **Usar el mismo `.env`** (sobre todo `IP_HASH_SALT`) si querés conservar la continuidad de los hashes de IP.

Ojo: `POSTGRES_PASSWORD` solo se aplica la primera vez que se crea el volumen `pgdata`. Si cambiás la clave en `.env` con un volumen existente, el app no va a poder conectarse: cambiala también adentro de Postgres (`ALTER USER sexyrose PASSWORD '...'`) o recreá el volumen y restaurá.

## Probar que las copias sirven

Una vez por mes, restaurar la última copia en la Mac:

```bash
docker run --rm -d --name sr-restore-test -e POSTGRES_PASSWORD=test postgres:16
sleep 5
age -d -i ~/.config/sexyrose/backup-age.key sexyrose-db-....sql.gz.age | gunzip \
  | docker exec -i sr-restore-test psql -U postgres -d postgres
docker exec sr-restore-test psql -U postgres -c 'select count(*) from preregistros;'
docker rm -f sr-restore-test
```

El volcado usa `--no-owner`, así que restaura bien con cualquier usuario.

## Copia fuera del servidor (pendiente)

TODO: elegir proveedor (Storj o Backblaze B2). Cuando esté, crear `infra/backup/offsite.sh` (ejecutable) que reciba la ruta de la copia como `$1` y la suba, por ejemplo con `rclone copy "$1" remoto:sexyrose-backups/`. `backup.sh` lo llama solo si existe, y solo con copias cifradas. Hasta entonces, si el servidor se pierde, se pierden las copias: bajalas a la Mac de vez en cuando con `scp`.
