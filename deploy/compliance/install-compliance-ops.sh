#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

SOURCE_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
TARGET_DIR=/opt/pjsktools-compliance
mode="${1:---check}"

preflight() {
  local ready=1
  [[ "$EUID" -eq 0 ]] || { echo "run as root" >&2; exit 1; }
  [[ "$mode" == "--check" || "$mode" == "--apply" || "$mode" == "--enable-timers" ]] || {
    echo "usage: $0 [--check|--apply|--enable-timers]" >&2
    exit 2
  }
  for command in python3 docker flock sha256sum openssl logrotate setfacl systemctl; do
    command -v "$command" >/dev/null || { echo "not ready: missing command: $command" >&2; ready=0; }
  done
  [[ -f /etc/pjsktools/compliance.env ]] || { echo "not ready: create /etc/pjsktools/compliance.env (0600)"; ready=0; }
  [[ -f /etc/pjsktools/cos.env ]] || { echo "not ready: create /etc/pjsktools/cos.env (0600)"; ready=0; }
  [[ -x "$(command -v age || true)" ]] || { echo "not ready: install age"; ready=0; }
  [[ -x "$(command -v fail2ban-client || true)" ]] || { echo "not ready: install fail2ban"; ready=0; }
  (( ready == 1 )) || return 1
  echo "preflight ready"
}

preflight

for config in /etc/pjsktools/compliance.env /etc/pjsktools/cos.env; do
  [[ -f "$config" && ! -L "$config" ]] || { echo "missing regular config: $config" >&2; exit 1; }
  [[ "$(stat -c '%u' "$config")" == "0" ]] || { echo "config must be owned by root: $config" >&2; exit 1; }
  config_mode="$(stat -c '%a' "$config")"
  (( (8#$config_mode & 8#077) == 0 )) || { echo "config permissions are too broad: $config" >&2; exit 1; }
done

set -a
# These files are root-owned deployment configuration, not untrusted input.
source /etc/pjsktools/compliance.env
source /etc/pjsktools/cos.env
set +a

[[ "${API_LOG_UID:-}" =~ ^[1-9][0-9]*$ ]] || {
  echo "API_LOG_UID must be the inspected non-root UID used by the production API container" >&2
  exit 1
}
[[ "${AGE_RECIPIENT:-}" =~ ^age1[a-z0-9]+$ && "$AGE_RECIPIENT" != *replace* ]] || {
  echo "AGE_RECIPIENT is missing or still a placeholder" >&2
  exit 1
}
[[ -n "${COS_SECRET_ID:-}" && -n "${COS_SECRET_KEY:-}" ]] || {
  echo "COS credentials are missing" >&2
  exit 1
}
[[ -n "${COS_BUCKET:-}" && "$COS_BUCKET" != *APPID* ]] || {
  echo "COS_BUCKET is missing or still a placeholder" >&2
  exit 1
}

if [[ "$mode" == "--check" ]]; then
  echo "configuration readiness check passed"
  exit 0
fi

if [[ "$mode" == "--enable-timers" ]]; then
  [[ -d "$TARGET_DIR" ]] || { echo "$TARGET_DIR is not installed" >&2; exit 1; }
  systemctl enable --now \
    pjsktools-log-archive.timer \
    pjsktools-encrypted-backup.timer \
    pjsktools-tombstone-export.timer \
    pjsktools-cos-restore-check.timer \
    pjsktools-compliance-monitor.timer
  echo "compliance timers enabled; verify their next-run times and status"
  exit 0
fi

# Refuse to overwrite any prior installation or operator-managed unit/config.
[[ ! -e "$TARGET_DIR" ]] || { echo "$TARGET_DIR already exists; review and upgrade manually" >&2; exit 1; }
for target in \
  /etc/fail2ban/jail.d/pjsktools-sshd.local \
  /etc/logrotate.d/pjsktools-security \
  /etc/systemd/system/pjsktools-log-archive.service \
  /etc/systemd/system/pjsktools-log-archive.timer \
  /etc/systemd/system/pjsktools-encrypted-backup.service \
  /etc/systemd/system/pjsktools-encrypted-backup.timer \
  /etc/systemd/system/pjsktools-tombstone-export.service \
  /etc/systemd/system/pjsktools-tombstone-export.timer \
  /etc/systemd/system/pjsktools-cos-restore-check.service \
  /etc/systemd/system/pjsktools-cos-restore-check.timer \
  /etc/systemd/system/pjsktools-compliance-monitor.service \
  /etc/systemd/system/pjsktools-compliance-monitor.timer; do
  [[ ! -e "$target" ]] || { echo "refusing to overwrite existing file: $target" >&2; exit 1; }
done

command -v age >/dev/null || { echo "age must be installed before applying" >&2; exit 1; }
command -v fail2ban-client >/dev/null || { echo "fail2ban must be installed before applying" >&2; exit 1; }

install -d -m 0700 "$TARGET_DIR/bin" "$TARGET_DIR/venv"
python3 -m venv "$TARGET_DIR/venv"
"$TARGET_DIR/venv/bin/pip" install --disable-pip-version-check -r "$SOURCE_DIR/requirements.txt"
  for script in archive-logs.sh backup-postgres-encrypted.sh export-tombstones-encrypted.sh verify-cos-restore.sh verify-encrypted-backup-restore.sh monitor-compliance.sh cos_archive.py; do
  install -m 0700 "$SOURCE_DIR/$script" "$TARGET_DIR/bin/$script"
done
install -m 0600 "$SOURCE_DIR/fail2ban-pjsktools-sshd.local" /etc/fail2ban/jail.d/pjsktools-sshd.local
install -m 0644 "$SOURCE_DIR/logrotate-pjsktools-security" /etc/logrotate.d/pjsktools-security
for unit in "$SOURCE_DIR"/systemd/*; do
  install -m 0644 "$unit" "/etc/systemd/system/$(basename -- "$unit")"
done
install -d -m 0700 /var/log/pjsktools /var/lib/pjsktools-compliance /var/backups/pjsktools
# Caddy currently runs as root. Grant only the inspected API container UID
# directory traversal/create rights; never broaden this directory to 0777.
setfacl -m "u:${API_LOG_UID}:rwx,m::rwx" /var/log/pjsktools

fail2ban-client -t
logrotate --debug /etc/logrotate.d/pjsktools-security >/dev/null
systemctl daemon-reload
systemctl restart fail2ban

echo "operations installed. Caddy logging is not changed automatically."
echo "Validate the Caddy snippet separately before importing it into each site block."
echo "Timers remain disabled. Run each service manually and complete COS/restore checks first."
echo "Only then run: $0 --enable-timers"
