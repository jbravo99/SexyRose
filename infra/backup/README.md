# Copias de seguridad: el servidor las hace y la PC de casa se las lleva

## Cómo funciona

1. **Todos los días, a las 03:15 UTC**, el servidor corre `infra/backup/backup.sh` (timer `sexyrose-backup.timer`). Deja en `/srv/sexyrose-copias` un juego de tres archivos:
   - `sexyrose-AAAAMMDDTHHMMSSZ-db.dump.age` — la base completa (`pg_dump`, formato custom).
   - `sexyrose-AAAAMMDDTHHMMSSZ-data.tar.gz.age` — los archivos privados del volumen `/data`: verificaciones (selfie y documento), contenido de los pedidos personalizados y lo demás que guarda el app.
   - `sexyrose-AAAAMMDDTHHMMSSZ.sha256` — las sumas de control de los dos anteriores. Se escribe al final: si está, el juego está completo.

   Los dos primeros salen **cifrados con age** usando la clave pública de tu PC de casa. Sin esa clave no se hace ninguna copia. En el servidor quedan los últimos 7 juegos.
2. **Todos los días, a las 05:15 UTC (02:15 en Argentina)**, tu PC de casa se conecta al servidor y trae lo nuevo. Verifica las sumas y guarda:
   - 14 diarias;
   - 8 semanales (la primera de cada semana);
   - 12 mensuales (la primera de cada mes).
3. **El servidor nunca tiene acceso a tu casa.** Es tu PC la que entra al servidor, con un usuario (`sr-copias`) que solo puede **leer** esa carpeta por rsync: no tiene terminal, no puede ejecutar comandos ni abrir túneles, y no puede escribir ni borrar.
4. **La clave privada para abrir las copias está solo en tu casa** (y en tu gestor de contraseñas). Si alguien entra al servidor, ve archivos cifrados que no puede abrir.

Las fotos y los videos públicos están en bunny.net, no en el servidor: no entran en estas copias.

## Lo que hacés una sola vez

**PC de casa** = tu Linux que queda prendida. **Servidor** = el VPS (entrás con `bash infra/local/srv.sh entrar shelbyadm` desde la Mac).

### 1. Clave de cifrado (en la PC de casa)

```bash
sudo apt install age
mkdir -p ~/.config/sexyrose-copias && chmod 700 ~/.config/sexyrose-copias
age-keygen -o ~/.config/sexyrose-copias/age.key
chmod 600 ~/.config/sexyrose-copias/age.key
```

El comando muestra una línea `Public key: age1...`. Esa es la clave **pública**: copiala, va al servidor en el paso 2.

El archivo `age.key` es la clave **privada**. Guardá una copia en tu gestor de contraseñas: si se rompe el disco de casa y no la tenés en otro lado, las copias no se pueden abrir. Nunca la subas al servidor ni al repo.

### 2. Clave pública en el servidor

En el servidor, editá `~/SexyRose/.env` (`nano ~/SexyRose/.env`) y completá la línea:

```
AGE_RECIPIENT=age1...   ← la clave pública del paso 1
```

Esta variable la usan solo los scripts del servidor: no va a ningún contenedor.

### 3. Llave SSH solo para las copias (en la PC de casa)

```bash
ssh-keygen -t ed25519 -C "sexyrose-copias-casa" -f ~/.ssh/sexyrose_copias -N ""
cat ~/.ssh/sexyrose_copias.pub
```

Copiá la línea que empieza con `ssh-ed25519`. Es la parte **pública**; la otra (`sexyrose_copias`, sin `.pub`) no sale nunca de tu casa.

### 4. Habilitar al usuario de copias (en el servidor)

```bash
cd ~/SexyRose
git pull
sudo bash infra/backup/servidor/habilitar-copias.sh "ssh-ed25519 AAAA... sexyrose-copias-casa"
bash infra/backup/backup.sh           # primera copia ya, para probar
```

El primer comando:
- crea `sr-copias`;
- crea `/srv/sexyrose-copias`;
- configura SSH (`sshd`) para que ese usuario solo pueda leer la carpeta de copias.

Al final muestra la **huella del servidor** (`SHA256:...`). Anotala.

### 5. Confiar en el servidor (en la PC de casa)

```bash
ssh-keyscan -t ed25519 213.218.161.153 > ~/.config/sexyrose-copias/known_hosts
ssh-keygen -lf ~/.config/sexyrose-copias/known_hosts
```

La huella `SHA256:...` tiene que ser **igual** a la que mostró el servidor en el paso 4. Si no coincide, no sigas: alguien está en el medio.

### 6. Instalar el timer (en la PC de casa)

Copiá la carpeta `infra/backup/casa/` del repo a la PC de casa (con `scp`, un pendrive o clonando el repo) y en esa carpeta:

```bash
sudo bash instalar-en-casa.sh
nano ~/.config/sexyrose-copias/config     # revisar VPS, LLAVE, DESTINO; opcional TELEGRAM_*
sudo systemctl start sexyrose-traer-copias.service
journalctl -u sexyrose-traer-copias.service -n 30 --no-pager
```

Tiene que terminar con `OK: 1 juego(s) nuevo(s)...`.

- **`DESTINO`** conviene que sea un disco distinto del sistema (por ejemplo `/mnt/discocopias/sexyrose`).
- **Avisos por Telegram:** si completás `TELEGRAM_BOT_TOKEN` y `TELEGRAM_CHAT_ID`, te avisa cuando falla o cuando pasan más de 36 h sin copias nuevas. Puede ser el mismo bot del sitio.

## Día a día

- **Ver qué hizo:** `journalctl -u sexyrose-traer-copias.service -n 50 --no-pager` (en casa) y `journalctl -u sexyrose-backup.service -n 20 --no-pager` (en el servidor).
- **Copias que quedan en casa:**
  - `diarias/`: las últimas 14
  - `semanales/`: 8
  - `mensuales/`: 12
  - `espejo/`: lo mismo que hay en el servidor

  Repetir un juego en varias carpetas no ocupa espacio extra.
- **Si la PC de casa estuvo apagada,** al prender trae lo que falte. Si estuvo apagada más de 7 días, se pierden los días que el servidor ya rotó.
- **Cambiar la llave de casa:** generá una nueva (paso 3) y volvé a correr el paso 4 con la nueva. La vieja deja de funcionar.

## Restaurar

Ver [restore.md](restore.md). Una vez por mes, hacé la prueba de restauración que está al final de ese archivo.
