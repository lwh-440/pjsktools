#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

CONFIG_FILE="${COMPLIANCE_CONFIG_FILE:-/etc/pjsktools/compliance.env}"
[[ "$EUID" -eq 0 ]] || { echo "run as root" >&2; exit 1; }
[[ -f "$CONFIG_FILE" && ! -L "$CONFIG_FILE" ]] || { echo "missing compliance config" >&2; exit 1; }
[[ "$(stat -c '%u' "$CONFIG_FILE")" == "0" ]] || { echo "config must be owned by root" >&2; exit 1; }
mode="$(stat -c '%a' "$CONFIG_FILE")"
(( (8#$mode & 8#077) == 0 )) || { echo "config permissions are too broad" >&2; exit 1; }
# shellcheck disable=SC1090
source "$CONFIG_FILE"

: "${COMPLIANCE_STATE_DIR:=/var/lib/pjsktools-compliance}"
: "${MONITOR_DISK_PERCENT:=85}"
: "${MONITOR_BACKUP_MAX_AGE_HOURS:=30}"
: "${MONITOR_COS_MAX_AGE_HOURS:=30}"
: "${MONITOR_CERT_HOST:=sekai-tools.cn}"
: "${MONITOR_CERT_MIN_DAYS:=21}"
: "${ALERT_EMAIL:=security@sekai-tools.cn}"

problems=()
disk_used="$(df -P / | awk 'NR==2 {gsub(/%/,"",$5); print $5}')"
(( disk_used < MONITOR_DISK_PERCENT )) || problems+=("root filesystem is ${disk_used}% full")

check_age() {
  local file="$1" max_hours="$2" label="$3" age
  if [[ ! -f "$file" ]]; then
    problems+=("$label success marker is missing")
    return
  fi
  age=$(( ($(date +%s) - $(stat -c '%Y' "$file")) / 3600 ))
  (( age <= max_hours )) || problems+=("$label last succeeded ${age} hours ago")
}
check_age "$COMPLIANCE_STATE_DIR/last-backup-success" "$MONITOR_BACKUP_MAX_AGE_HOURS" "encrypted backup"
check_age "$COMPLIANCE_STATE_DIR/last-log-cos-success" "$MONITOR_COS_MAX_AGE_HOURS" "log COS upload"
check_age "$COMPLIANCE_STATE_DIR/last-backup-cos-success" "$MONITOR_COS_MAX_AGE_HOURS" "backup COS upload"
check_age "$COMPLIANCE_STATE_DIR/last-tombstone-cos-success" "$MONITOR_COS_MAX_AGE_HOURS" "deletion tombstone COS upload"

cert_seconds=$(( MONITOR_CERT_MIN_DAYS * 86400 ))
if ! timeout 15 openssl s_client -connect "${MONITOR_CERT_HOST}:443" -servername "$MONITOR_CERT_HOST" </dev/null 2>/dev/null \
  | openssl x509 -checkend "$cert_seconds" -noout >/dev/null 2>&1; then
  problems+=("TLS certificate for $MONITOR_CERT_HOST expires within $MONITOR_CERT_MIN_DAYS days or could not be checked")
fi

if command -v fail2ban-client >/dev/null 2>&1 && ! fail2ban-client status sshd >/dev/null 2>&1; then
  problems+=("fail2ban sshd jail is inactive")
fi
if systemctl is-failed --quiet pjsktools-tombstone-export.service; then
  problems+=("deletion tombstone export service is failed")
fi

if (( ${#problems[@]} == 0 )); then
  logger -t pjsktools-compliance "monitor checks passed"
  exit 0
fi

message="pjsktools compliance alert:\n- $(printf '%s\n- ' "${problems[@]}")"
logger -p auth.warning -t pjsktools-compliance -- "$message"
if [[ "$ALERT_EMAIL" =~ ^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+$ ]] && command -v sendmail >/dev/null 2>&1; then
  printf 'To: %s\nSubject: [pjsktools] compliance operation alert\n\n%b\n' "$ALERT_EMAIL" "$message" | sendmail -t
fi
printf '%b\n' "$message" >&2
exit 1
