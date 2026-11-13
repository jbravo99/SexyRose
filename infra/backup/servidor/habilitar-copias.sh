#!/usr/bin/env bash
# SexyRose — prepara el servidor para que la PC de casa se lleve las copias (modo "pull").
#
#   sudo bash ~/SexyRose/infra/backup/servidor/habilitar-copias.sh "ssh-ed25519 AAAA... sexyrose-copias-casa"
#
# El argumento es la clave PÚBLICA SSH que generaste en la PC de casa (una sola línea).
# Idempotente: se puede repetir (por ejemplo, para cambiar la clave).
#
# Qué hace:
#  - Crea el usuario de sistema sr-copias, sin contraseña, que solo puede LEER /srv/sexyrose-copias por rsync
#    (rrsync -ro). Sin shell, sin terminal, sin reenvío de puertos ni de agente: aunque roben la clave de casa,
#    con ella no se puede entrar al servidor ni borrar nada.
#  - Crea /srv/sexyrose-copias (dueño: tu usuario; grupo: sr-copias; 2750), donde backup.sh deja las copias.
#  - Agrega un bloque Match para sr-copias en sshd (con ForceCommand) y recarga sshd si la config valida.
# El servidor nunca guarda credenciales de tu casa: es la PC de casa la que se conecta y trae.
set -euo pipefail

COPY_USER="sr-copias"
COPY_HOME="/var/lib/sr-copias"
COPY_DIR="/srv/sexyrose-copias"
RRSYNC="/usr/bin/rrsync"
SSHD_DROPIN="/etc/ssh/sshd_config.d/10-sexyrose-copias.conf"

die()  { printf '\nERROR: %s\n' "$*" >&2; exit 1; }
log()  { printf '\n==> %s\n' "$*"; }

[[ "$(id -u)" -eq 0 ]] || die "correr con sudo:  sudo bash $0 \"ssh-ed25519 AAAA...\""
OWNER="${SUDO_USER:-}"
[[ -n "$OWNER" && "$OWNER" != "root" ]] || die "correr desde tu usuario con sudo (no como root directo)"
PUBKEY="${1:-}"
[[ -n "$PUBKEY" ]] || die "falta la clave pública de la PC de casa (contenido de ~/.ssh/sexyrose_copias.pub, entre comillas)"
[[ "$PUBKEY" != *$'\n'* ]] || die "la clave tiene que ser una sola línea"
[[ "$PUBKEY" =~ ^(ssh-ed25519|ssh-rsa|ecdsa-sha2-nistp256|sk-ssh-ed25519@openssh\.com)\ [A-Za-z0-9+/=]+(\ .*)?$ ]] \
  || die "eso no parece una clave pública SSH (tiene que empezar con ssh-ed25519 AAAA...). ¿Pegaste la privada? Nunca la pegues."
TMPK="$(mktemp)"; trap 'rm -f "$TMPK"' EXIT
printf '%s\n' "$PUBKEY" > "$TMPK"
ssh-keygen -l -f "$TMPK" >/dev/null 2>&1 || die "ssh-keygen no reconoce esa clave pública"

log "rsync / rrsync"
if [[ ! -x "$RRSYNC" ]]; then
  apt-get update -q >/dev/null
  DEBIAN_FRONTEND=noninteractive apt-get install -y -q rsync python3 >/dev/null
fi
[[ -x "$RRSYNC" ]] || die "no encuentro $RRSYNC después de instalar rsync"

log "Usuario $COPY_USER"
getent group "$COPY_USER" >/dev/null || groupadd --system "$COPY_USER"
if ! id "$COPY_USER" >/dev/null 2>&1; then
  # /bin/sh hace falta para que sshd pueda ejecutar el ForceCommand; la terminal y todo lo demás quedan bloqueados.
  useradd --system --gid "$COPY_USER" --home-dir "$COPY_HOME" --create-home --shell /bin/sh "$COPY_USER"
fi
passwd -l "$COPY_USER" >/dev/null 2>&1 || true

log "Carpeta de copias $COPY_DIR"
install -d -m 2750 -o "$OWNER" -g "$COPY_USER" "$COPY_DIR"
# Copias que ya estén ahí: legibles por el grupo, no por otros.
find "$COPY_DIR" -maxdepth 1 -type f -exec chgrp "$COPY_USER" {} + -exec chmod 0640 {} + 2>/dev/null || true

log "Clave de la PC de casa"
# La carpeta .ssh y authorized_keys son de root: sr-copias no puede cambiar sus propias claves.
install -d -m 0755 -o root -g root "$COPY_HOME/.ssh"
AUTH="$COPY_HOME/.ssh/authorized_keys"
printf 'restrict,command="%s -ro %s/" %s\n' "$RRSYNC" "$COPY_DIR" "$PUBKEY" > "$AUTH.tmp"
chmod 0644 "$AUTH.tmp"; chown root:root "$AUTH.tmp"; mv "$AUTH.tmp" "$AUTH"
echo "Huella de la clave cargada: $(ssh-keygen -l -f "$TMPK" | awk '{print $1, $2}')"

log "sshd: bloque para $COPY_USER"
CONTENT="# Gestionado por SexyRose infra/backup/servidor/habilitar-copias.sh
# Solo lectura por rsync de $COPY_DIR. Nada más.
Match User $COPY_USER
    AuthenticationMethods publickey
    PasswordAuthentication no
    KbdInteractiveAuthentication no
    AllowTcpForwarding no
    AllowAgentForwarding no
    AllowStreamLocalForwarding no
    PermitTunnel no
    X11Forwarding no
    PermitTTY no
    PermitUserRC no
    ForceCommand $RRSYNC -ro $COPY_DIR/
# Cierra el Match para que no afecte lo que sigue en sshd_config.
Match all"
BACKUP=""
[[ -f "$SSHD_DROPIN" ]] && { BACKUP="$(mktemp)"; cp -a "$SSHD_DROPIN" "$BACKUP"; }
if [[ ! -f "$SSHD_DROPIN" ]] || [[ "$(cat "$SSHD_DROPIN")" != "$CONTENT" ]]; then
  printf '%s\n' "$CONTENT" > "$SSHD_DROPIN"
  chmod 0644 "$SSHD_DROPIN"
  mkdir -p /run/sshd
  if ! sshd -t; then
    if [[ -n "$BACKUP" ]]; then cp -a "$BACKUP" "$SSHD_DROPIN"; else rm -f "$SSHD_DROPIN"; fi
    die "sshd -t falló con el bloque nuevo. Lo revertí; sshd no se recargó."
  fi
  systemctl reload ssh 2>/dev/null || systemctl restart ssh
  echo "sshd recargado (las sesiones abiertas siguen)."
else
  echo "sshd ya tenía el bloque."
fi
[[ -n "$BACKUP" ]] && rm -f "$BACKUP"

# Comprobar la config efectiva para sr-copias.
EFF="$(sshd -T -C "user=$COPY_USER,host=casa,addr=127.0.0.1" 2>/dev/null || true)"
for kv in "permittty no" "allowtcpforwarding no" "passwordauthentication no"; do
  grep -qx "$kv" <<<"$EFF" || echo "AVISO: sshd efectivo para $COPY_USER NO tiene '$kv'." >&2
done
grep -q "^forcecommand $RRSYNC" <<<"$EFF" || echo "AVISO: no veo el ForceCommand para $COPY_USER en la config efectiva." >&2

log "Listo"
echo "Usuario:   $COPY_USER (solo lectura de $COPY_DIR por rsync)"
echo "Carpeta:   $COPY_DIR ($(stat -c '%U:%G %a' "$COPY_DIR"))"
echo
echo "Huella del servidor (comparala en la PC de casa cuando hagas ssh-keyscan, paso 4 del README):"
HOSTKEY=/etc/ssh/ssh_host_ed25519_key.pub
if [[ -f "$HOSTKEY" ]]; then ssh-keygen -l -f "$HOSTKEY"; else echo "(no encuentro $HOSTKEY)"; fi
echo
echo "Siguiente: correr una copia ya para probar:  bash ~/SexyRose/infra/backup/backup.sh"
