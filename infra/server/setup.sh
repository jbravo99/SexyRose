#!/usr/bin/env bash
# SexyRose — preparación y endurecimiento del VPS (Ubuntu 24.04 / 26.04).
#
# Se corre UNA vez (es idempotente: se puede repetir sin romper nada) con el usuario sudo:
#   sudo bash setup.sh
#
# Hace: actualizaciones, unattended-upgrades (seguridad + reinicio 04:30), ufw (solo SSH),
# fail2ban (sshd), endurecimiento de sshd, swap de 4 GB, zona horaria UTC, Docker Engine +
# compose plugin desde el repo oficial, grupo docker, límite de journald, rotación de logs de Docker.
#
# Antes de tocar sshd verifica que tu usuario tenga ~/.ssh/authorized_keys con al menos una clave.
set -euo pipefail

SWAP_SIZE_GB=4
REBOOT_TIME="04:30"
JOURNAL_MAX="500M"
FALLBACK_CODENAME="noble"   # última LTS con paquetes de Docker seguros

log()  { printf '\n==> %s\n' "$*"; }
warn() { printf '\nAVISO: %s\n' "$*" >&2; }
die()  { printf '\nERROR: %s\n' "$*" >&2; exit 1; }

# Escribe $2 en $1 solo si cambió. Devuelve 0 si escribió, 1 si ya estaba igual.
write_if_changed() {
  local path="$1" content="$2"
  if [[ -f "$path" ]] && [[ "$(cat "$path")" == "$content" ]]; then
    return 1
  fi
  install -d -m 0755 "$(dirname "$path")"
  printf '%s\n' "$content" > "$path"
  return 0
}

# ---------------------------------------------------------------------------
# 0. Comprobaciones previas (antes de cambiar NADA)
# ---------------------------------------------------------------------------
[[ "$(id -u)" -eq 0 ]] || die "correr con sudo:  sudo bash $0"
TARGET_USER="${SUDO_USER:-}"
[[ -n "$TARGET_USER" && "$TARGET_USER" != "root" ]] || die "correr desde tu usuario con sudo (no como root directo): sudo bash $0"
TARGET_HOME="$(getent passwd "$TARGET_USER" | cut -d: -f6)"
[[ -n "$TARGET_HOME" && -d "$TARGET_HOME" ]] || die "no encuentro el home de $TARGET_USER"

AUTH_KEYS="$TARGET_HOME/.ssh/authorized_keys"
if [[ ! -s "$AUTH_KEYS" ]] || ! grep -Eq '^[[:space:]]*(ssh-|ecdsa-|sk-)' "$AUTH_KEYS"; then
  die "$AUTH_KEYS no existe o no tiene ninguna clave. Si desactivo las contraseñas te quedás afuera. Cargá tu clave pública y volvé a correr."
fi
echo "OK: $AUTH_KEYS tiene $(grep -Ec '^[[:space:]]*(ssh-|ecdsa-|sk-)' "$AUTH_KEYS") clave(s)."
# sshd rechaza la llave si el dueño o los permisos están mal: se corrigen antes de cerrar las contraseñas.
chown "$TARGET_USER": "$TARGET_HOME/.ssh" "$AUTH_KEYS"
chmod 700 "$TARGET_HOME/.ssh"
chmod 600 "$AUTH_KEYS"
chmod go-w "$TARGET_HOME"

[[ -r /etc/os-release ]] || die "no encuentro /etc/os-release"
# shellcheck disable=SC1091
. /etc/os-release
[[ "${ID:-}" == "ubuntu" ]] || warn "este script está pensado para Ubuntu (detectado: ${ID:-desconocido})."
CODENAME="${UBUNTU_CODENAME:-${VERSION_CODENAME:-}}"
[[ -n "$CODENAME" ]] || die "no pude detectar el codename de Ubuntu"
ARCH="$(dpkg --print-architecture)"
echo "Sistema: ${PRETTY_NAME:-?} (codename $CODENAME, arquitectura $ARCH). Usuario: $TARGET_USER"

export DEBIAN_FRONTEND=noninteractive
export NEEDRESTART_MODE=a
APT_OPTS=(-y -o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold)

# ---------------------------------------------------------------------------
# 1. Actualizaciones y paquetes base
# ---------------------------------------------------------------------------
log "Actualizando paquetes"
apt-get update
apt-get "${APT_OPTS[@]}" upgrade
apt-get "${APT_OPTS[@]}" install \
  ca-certificates curl gnupg git ufw fail2ban python3-systemd unattended-upgrades age

# ---------------------------------------------------------------------------
# 2. Zona horaria UTC
# ---------------------------------------------------------------------------
log "Zona horaria UTC"
if [[ "$(timedatectl show -p Timezone --value 2>/dev/null || true)" != "UTC" ]]; then
  timedatectl set-timezone UTC
fi

# ---------------------------------------------------------------------------
# 3. unattended-upgrades (seguridad, reinicio automático 04:30 hora del servidor = UTC)
# ---------------------------------------------------------------------------
log "unattended-upgrades"
write_if_changed /etc/apt/apt.conf.d/20auto-upgrades 'APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";' || true
# Los orígenes de seguridad ya vienen habilitados en 50unattended-upgrades; acá solo el reinicio.
write_if_changed /etc/apt/apt.conf.d/52sexyrose-unattended-upgrades "Unattended-Upgrade::Automatic-Reboot \"true\";
Unattended-Upgrade::Automatic-Reboot-WithUsers \"true\";
Unattended-Upgrade::Automatic-Reboot-Time \"$REBOOT_TIME\";
Unattended-Upgrade::Remove-Unused-Kernel-Packages \"true\";
Unattended-Upgrade::Remove-Unused-Dependencies \"true\";" || true
systemctl enable --now unattended-upgrades >/dev/null 2>&1 || true

# ---------------------------------------------------------------------------
# 4. sshd: endurecimiento (drop-in con prioridad sobre 50-cloud-init.conf)
# ---------------------------------------------------------------------------
log "Endureciendo sshd"
SSHD_DROPIN=/etc/ssh/sshd_config.d/00-sexyrose-hardening.conf
if ! grep -Eq '^[[:space:]]*Include[[:space:]]+/etc/ssh/sshd_config\.d/' /etc/ssh/sshd_config; then
  warn "/etc/ssh/sshd_config no incluye sshd_config.d/; el drop-in no tendría efecto."
fi
SSHD_CONTENT='# Gestionado por SexyRose infra/server/setup.sh
# sshd usa el PRIMER valor que encuentra: este archivo (00-) gana sobre 50-cloud-init.conf.
PubkeyAuthentication yes
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
PermitEmptyPasswords no
MaxAuthTries 6
LoginGraceTime 30
X11Forwarding no'
mkdir -p /run/sshd   # sshd -t / -T lo necesitan
SSHD_BACKUP=""
if [[ -f "$SSHD_DROPIN" ]]; then
  SSHD_BACKUP="$(mktemp)"
  cp -a "$SSHD_DROPIN" "$SSHD_BACKUP"
fi
if write_if_changed "$SSHD_DROPIN" "$SSHD_CONTENT"; then
  chmod 0644 "$SSHD_DROPIN"
  if ! sshd -t; then
    if [[ -n "$SSHD_BACKUP" ]]; then cp -a "$SSHD_BACKUP" "$SSHD_DROPIN"; else rm -f "$SSHD_DROPIN"; fi
    die "sshd -t falló con la configuración nueva. Revertí el drop-in; sshd no se recargó."
  fi
  systemctl reload ssh 2>/dev/null || systemctl restart ssh
  echo "sshd recargado. Las sesiones abiertas siguen vivas."
else
  echo "sshd ya estaba endurecido."
fi
[[ -n "$SSHD_BACKUP" ]] && rm -f "$SSHD_BACKUP"

# Verificar la configuración efectiva.
SSHD_EFFECTIVE="$(sshd -T 2>/dev/null || true)"
for kv in "passwordauthentication no" "permitrootlogin no" "kbdinteractiveauthentication no" "pubkeyauthentication yes"; do
  grep -qx "$kv" <<<"$SSHD_EFFECTIVE" || warn "sshd efectivo NO tiene '$kv' (¿algún Match o archivo que lo pisa?)."
done
mapfile -t SSH_PORTS < <(awk '$1=="port"{print $2}' <<<"$SSHD_EFFECTIVE" | sort -u)
[[ ${#SSH_PORTS[@]} -gt 0 ]] || SSH_PORTS=(22)

# ---------------------------------------------------------------------------
# 5. Firewall: denegar todo lo entrante salvo SSH
# ---------------------------------------------------------------------------
log "Firewall (ufw)"
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw allow OpenSSH >/dev/null 2>&1 || ufw allow 22/tcp >/dev/null
for p in "${SSH_PORTS[@]}"; do
  [[ "$p" == "22" ]] || ufw allow "${p}/tcp" >/dev/null
done
ufw --force enable >/dev/null

# ---------------------------------------------------------------------------
# 6. fail2ban para sshd (lee el journal; cubre sshd y sshd-session de OpenSSH >= 9.8)
# ---------------------------------------------------------------------------
log "fail2ban"
F2B_CHANGED=0
write_if_changed /etc/fail2ban/jail.d/sexyrose-sshd.local '# Gestionado por SexyRose infra/server/setup.sh
[sshd]
enabled    = true
backend    = systemd
journalmatch = _SYSTEMD_UNIT=ssh.service + _SYSTEMD_UNIT=sshd.service + _COMM=sshd + _COMM=sshd-session
port       = ssh
maxretry   = 5
findtime   = 10m
bantime    = 1h' && F2B_CHANGED=1
write_if_changed /etc/fail2ban/filter.d/sshd.local '# Gestionado por SexyRose infra/server/setup.sh
[DEFAULT]
_daemon = sshd(?:-session)?' && F2B_CHANGED=1
if ! fail2ban-client -t >/dev/null 2>&1; then
  warn "la config de fail2ban no validó con el override del filtro; lo quito y reintento."
  rm -f /etc/fail2ban/filter.d/sshd.local
  F2B_CHANGED=1
fi
if fail2ban-client -t >/dev/null 2>&1; then
  systemctl enable fail2ban >/dev/null 2>&1 || true
  if [[ "$F2B_CHANGED" -eq 1 ]] || ! systemctl is-active --quiet fail2ban; then
    systemctl restart fail2ban
  fi
else
  warn "fail2ban sigue sin validar (fail2ban-client -t). Sigo con el resto; revisalo después."
fi

# ---------------------------------------------------------------------------
# 7. Swap
# ---------------------------------------------------------------------------
log "Swap"
if [[ -n "$(swapon --show=NAME --noheadings 2>/dev/null)" ]]; then
  echo "Ya hay swap activa: $(swapon --show=NAME,SIZE --noheadings | tr '\n' ' ')"
else
  if [[ ! -f /swapfile ]]; then
    fallocate -l "${SWAP_SIZE_GB}G" /swapfile 2>/dev/null \
      || dd if=/dev/zero of=/swapfile bs=1M count=$((SWAP_SIZE_GB * 1024)) status=none
    chmod 600 /swapfile
    mkswap /swapfile >/dev/null
  fi
  swapon /swapfile
  grep -qE '^/swapfile[[:space:]]' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo "Swap de ${SWAP_SIZE_GB} GB creada en /swapfile."
fi
if write_if_changed /etc/sysctl.d/90-sexyrose.conf 'vm.swappiness = 10'; then
  sysctl -q -p /etc/sysctl.d/90-sexyrose.conf
fi

# ---------------------------------------------------------------------------
# 8. journald: tope de tamaño
# ---------------------------------------------------------------------------
log "journald"
if write_if_changed /etc/systemd/journald.conf.d/00-sexyrose.conf "[Journal]
SystemMaxUse=$JOURNAL_MAX
SystemKeepFree=2G"; then
  systemctl restart systemd-journald
fi

# ---------------------------------------------------------------------------
# 9. Docker Engine + compose plugin (repo oficial de Docker)
# ---------------------------------------------------------------------------
log "Docker"
for pkg in docker.io docker-doc docker-compose docker-compose-v2 podman-docker containerd runc; do
  if dpkg-query -W -f='${Status}' "$pkg" 2>/dev/null | grep -q "install ok installed"; then
    apt-get "${APT_OPTS[@]}" remove "$pkg"
  fi
done

install -m 0755 -d /etc/apt/keyrings
if [[ ! -s /etc/apt/keyrings/docker.asc ]]; then
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
fi

docker_has_codename() {
  local release
  release="$(curl -fsSL "https://download.docker.com/linux/ubuntu/dists/$1/Release" 2>/dev/null)" || return 1
  grep -q "stable/binary-${ARCH}/Packages" <<<"$release"
}
DOCKER_SUITE="$CODENAME"
if ! docker_has_codename "$CODENAME"; then
  DOCKER_SUITE="$FALLBACK_CODENAME"
  warn "Docker todavía no publica paquetes para '$CODENAME' ($ARCH). Uso los de '$FALLBACK_CODENAME' (24.04 LTS).
         Suele funcionar, pero cuando Docker publique '$CODENAME' volvé a correr este script para cambiar el repo."
  docker_has_codename "$FALLBACK_CODENAME" || die "tampoco encuentro paquetes de Docker para '$FALLBACK_CODENAME'. ¿Hay salida a internet?"
fi
rm -f /etc/apt/sources.list.d/docker.list
write_if_changed /etc/apt/sources.list.d/docker.sources "Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: $DOCKER_SUITE
Components: stable
Architectures: $ARCH
Signed-By: /etc/apt/keyrings/docker.asc" || true
apt-get update
apt-get "${APT_OPTS[@]}" install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Rotación de logs de Docker (se combina con un daemon.json existente, si lo hay).
DAEMON_JSON=/etc/docker/daemon.json
install -d -m 0755 /etc/docker
DOCKER_CFG_CHANGED="$(python3 - "$DAEMON_JSON" <<'PY'
import json, os, sys
path = sys.argv[1]
cfg = {}
if os.path.exists(path) and os.path.getsize(path) > 0:
    with open(path) as f:
        cfg = json.load(f)
want = {"log-driver": "json-file", "log-opts": {"max-size": "10m", "max-file": "3"}, "live-restore": True}
new = dict(cfg)
new.update(want)
if new != cfg:
    with open(path, "w") as f:
        json.dump(new, f, indent=2)
        f.write("\n")
    print("1")
else:
    print("0")
PY
)"
systemctl enable --now docker containerd >/dev/null
if [[ "$DOCKER_CFG_CHANGED" == "1" ]]; then
  systemctl restart docker
fi

if ! id -nG "$TARGET_USER" | tr ' ' '\n' | grep -qx docker; then
  usermod -aG docker "$TARGET_USER"
  ADDED_TO_DOCKER=1
else
  ADDED_TO_DOCKER=0
fi

# ---------------------------------------------------------------------------
# 10. Resumen
# ---------------------------------------------------------------------------
log "Resumen"
echo "Usuario:          $TARGET_USER (grupo docker: sí)"
echo "Zona horaria:     $(timedatectl show -p Timezone --value 2>/dev/null || echo '?')"
echo "SSH:              puertos ${SSH_PORTS[*]}; $(grep -E '^(passwordauthentication|permitrootlogin|kbdinteractiveauthentication) ' <<<"$SSHD_EFFECTIVE" | tr '\n' ' ')"
echo "Firewall:         $(ufw status | head -1)"
ufw status | sed -n '/^--/,$p' | tail -n +2 | sed 's/^/                  /'
echo "fail2ban sshd:    $(fail2ban-client status sshd >/dev/null 2>&1 && echo activo || echo 'NO activo (revisar)')"
echo "Swap:             $(swapon --show=NAME,SIZE --noheadings | tr '\n' ' ')"
echo "Auto-updates:     seguridad diaria, reinicio automático a las $REBOOT_TIME UTC si hace falta"
echo "Docker:           $(docker --version 2>/dev/null) / $(docker compose version 2>/dev/null) (repo: $DOCKER_SUITE)"
echo "Logs Docker:      json-file 10m x 3; journald tope $JOURNAL_MAX"
echo
echo "IMPORTANTE:"
echo " - NO cierres esta sesión todavía. Abrí OTRA terminal y probá entrar por SSH con tu clave."
[[ "$ADDED_TO_DOCKER" -eq 1 ]] && echo " - Te agregué al grupo docker: salí y volvé a entrar por SSH para que tome efecto."
[[ -f /var/run/reboot-required ]] && echo " - El sistema pide reinicio (kernel/librerías nuevas): sudo reboot cuando puedas."
echo "Listo."
