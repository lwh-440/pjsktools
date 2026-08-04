#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

CONFIG_FILE="${COMPLIANCE_CONFIG_FILE:-/etc/pjsktools/compliance.env}"
COS_CONFIG_FILE="${COS_CONFIG_FILE:-/etc/pjsktools/cos.env}"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"

[[ "$EUID" -eq 0 ]] || { echo "run as root" >&2; exit 1; }
for file in "$CONFIG_FILE" "$COS_CONFIG_FILE"; do
  [[ -f "$file" && ! -L "$file" ]] || { echo "missing regular config: $file" >&2; exit 1; }
  [[ "$(stat -c '%u' "$file")" == "0" ]] || { echo "config must be owned by root: $file" >&2; exit 1; }
  mode="$(stat -c '%a' "$file")"
  (( (8#$mode & 8#077) == 0 )) || { echo "config permissions are too broad: $file" >&2; exit 1; }
done
# shellcheck disable=SC1090
source "$CONFIG_FILE"
# shellcheck disable=SC1090
source "$COS_CONFIG_FILE"
: "${COS_SECRET_ID:?COS_SECRET_ID is required}"
: "${COS_SECRET_KEY:?COS_SECRET_KEY is required}"
: "${COS_REGION:?COS_REGION is required}"
: "${COS_BUCKET:?COS_BUCKET is required}"
: "${COS_SESSION_TOKEN:=}"
export COS_SECRET_ID COS_SECRET_KEY COS_SESSION_TOKEN COS_REGION COS_BUCKET

: "${COMPLIANCE_STATE_DIR:=/var/lib/pjsktools-compliance}"
: "${COMPLIANCE_COS_LOG_PREFIX:=logs}"
: "${COMPLIANCE_COS_DAILY_PREFIX:=backups/daily}"
: "${COMPLIANCE_COS_WEEKLY_PREFIX:=backups/weekly}"
: "${COMPLIANCE_PYTHON_BIN:=/opt/pjsktools-compliance/venv/bin/python}"
[[ -x "$COMPLIANCE_PYTHON_BIN" ]] || { echo "compliance Python is not installed" >&2; exit 1; }
install -d -m 0700 "$COMPLIANCE_STATE_DIR"
exec 9>"$COMPLIANCE_STATE_DIR/cos-restore-check.lock"
flock -n 9 || exit 0

"$COMPLIANCE_PYTHON_BIN" "$SCRIPT_DIR/cos_archive.py" random-verify --prefix "$COMPLIANCE_COS_LOG_PREFIX"
"$COMPLIANCE_PYTHON_BIN" "$SCRIPT_DIR/cos_archive.py" random-verify --prefix "$COMPLIANCE_COS_DAILY_PREFIX" --suffix .dump.age
"$COMPLIANCE_PYTHON_BIN" "$SCRIPT_DIR/cos_archive.py" random-verify --prefix "$COMPLIANCE_COS_WEEKLY_PREFIX" --suffix .dump.age
printf '%s\n' "$(date -u '+%FT%TZ')" >"$COMPLIANCE_STATE_DIR/last-cos-restore-check"
chmod 0600 "$COMPLIANCE_STATE_DIR/last-cos-restore-check"
