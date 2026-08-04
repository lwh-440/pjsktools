#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

CONFIG_FILE="${COMPLIANCE_CONFIG_FILE:-/etc/pjsktools/compliance.env}"
COS_CONFIG_FILE="${COS_CONFIG_FILE:-/etc/pjsktools/cos.env}"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"

require_root_only_file() {
  local file="$1"
  [[ -f "$file" && ! -L "$file" ]] || { echo "missing regular config: $file" >&2; exit 1; }
  [[ "$(stat -c '%u' "$file")" == "0" ]] || { echo "config must be owned by root: $file" >&2; exit 1; }
  local mode
  mode="$(stat -c '%a' "$file")"
  (( (8#$mode & 8#077) == 0 )) || { echo "config must not be group/world accessible: $file" >&2; exit 1; }
}

[[ "$EUID" -eq 0 ]] || { echo "run as root" >&2; exit 1; }
require_root_only_file "$CONFIG_FILE"
require_root_only_file "$COS_CONFIG_FILE"
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

: "${COMPLIANCE_LOG_DIR:=/var/log/pjsktools}"
: "${COMPLIANCE_STATE_DIR:=/var/lib/pjsktools-compliance}"
: "${COMPLIANCE_LOCAL_LOG_DAYS:=200}"
: "${COMPLIANCE_COS_LOG_PREFIX:=logs}"
: "${COMPLIANCE_PYTHON_BIN:=/opt/pjsktools-compliance/venv/bin/python}"
[[ -x "$COMPLIANCE_PYTHON_BIN" ]] || { echo "compliance Python is not installed" >&2; exit 1; }

install -d -m 0700 "$COMPLIANCE_STATE_DIR" "$COMPLIANCE_STATE_DIR/uploaded"
exec 9>"$COMPLIANCE_STATE_DIR/log-archive.lock"
flock -n 9 || exit 0

host_id="$(hostname -s | tr -cd 'A-Za-z0-9._-')"
[[ -n "$host_id" ]] || host_id="server"
uploaded_any=0

marker_for() {
  local key="$1" digest="$2" marker_id
  marker_id="$(printf '%s\n%s\n' "$key" "$digest" | sha256sum | awk '{print $1}')"
  printf '%s/uploaded/%s.ok\n' "$COMPLIANCE_STATE_DIR" "$marker_id"
}

while IFS= read -r -d '' archive; do
  chmod 0600 "$archive"
  digest="$(sha256sum -- "$archive" | awk '{print $1}')"
  basename="$(basename -- "$archive")"
  date_path="$(date -u -r "$archive" '+%Y/%m/%d')"
  object_key="${COMPLIANCE_COS_LOG_PREFIX%/}/${host_id}/${date_path}/${basename}"
  marker="$(marker_for "$object_key" "$digest")"
  printf '%s  %s\n' "$digest" "$basename" >"${archive}.sha256"
  chmod 0600 "${archive}.sha256"
  manifest_digest="$(sha256sum -- "${archive}.sha256" | awk '{print $1}')"
  if [[ ! -f "$marker" ]]; then
    "$COMPLIANCE_PYTHON_BIN" "$SCRIPT_DIR/cos_archive.py" upload --file "$archive" --key "$object_key"
    "$COMPLIANCE_PYTHON_BIN" "$SCRIPT_DIR/cos_archive.py" upload --file "${archive}.sha256" --key "${object_key}.sha256"
    printf '%s\t%s\t%s\t%s\t%s\n' "$object_key" "$digest" "${object_key}.sha256" "$manifest_digest" "$(date -u '+%FT%TZ')" >"$marker.tmp"
    mv -f -- "$marker.tmp" "$marker"
    chmod 0600 "$marker"
    uploaded_any=1
  fi
done < <(find "$COMPLIANCE_LOG_DIR" -maxdepth 1 -type f \( \
  -name 'access-*.json.gz' -o -name 'access-*.log.gz' -o -name 'security*.json.gz' \
  \) -print0)

# Caddy already keeps 200 days. This explicit cleanup is a second guard and
# removes only archives proven uploaded and HEAD-verified by the marker above.
while IFS= read -r -d '' archive; do
  digest="$(sha256sum -- "$archive" | awk '{print $1}')"
  basename="$(basename -- "$archive")"
  date_path="$(date -u -r "$archive" '+%Y/%m/%d')"
  expected_key="${COMPLIANCE_COS_LOG_PREFIX%/}/${host_id}/${date_path}/${basename}"
  marker="$(marker_for "$expected_key" "$digest")"
  if [[ -f "$marker" && -f "${archive}.sha256" ]]; then
    IFS=$'\t' read -r data_key data_digest manifest_key manifest_digest verified_at <"$marker" || true
    actual_manifest_digest="$(sha256sum -- "${archive}.sha256" | awk '{print $1}')"
  else
    data_key=""
    data_digest=""
    manifest_key=""
    manifest_digest=""
    verified_at=""
    actual_manifest_digest=""
  fi
  if [[ "$data_key" == "$expected_key" && "$data_digest" == "$digest" && "$manifest_key" == "${expected_key}.sha256" && "$manifest_digest" == "$actual_manifest_digest" && -n "$verified_at" ]]; then
    rm -f -- "$archive" "${archive}.sha256"
  fi
done < <(find "$COMPLIANCE_LOG_DIR" -maxdepth 1 -type f \( \
  -name 'access-*.json.gz' -o -name 'access-*.log.gz' -o -name 'security*.json.gz' \
  \) -mtime "+$COMPLIANCE_LOCAL_LOG_DAYS" -print0)

if (( uploaded_any == 1 )); then
  printf '%s\n' "$(date -u '+%FT%TZ')" >"$COMPLIANCE_STATE_DIR/last-log-cos-success"
  chmod 0600 "$COMPLIANCE_STATE_DIR/last-log-cos-success"
fi
