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

: "${AGE_RECIPIENT:?AGE_RECIPIENT is required}"
: "${COMPOSE_PROJECT_DIR:=/opt/pjsktools}"
: "${COMPOSE_FILE:=$COMPOSE_PROJECT_DIR/compose.prod.yml}"
: "${COMPOSE_ENV_FILE:=$COMPOSE_PROJECT_DIR/.env.production}"
: "${POSTGRES_SERVICE:=postgres}"
: "${POSTGRES_USER:=pjsktools}"
: "${POSTGRES_DB:=pjsktools}"
: "${COMPLIANCE_TOMBSTONE_DIR:=/var/backups/pjsktools/tombstones}"
: "${COMPLIANCE_TOMBSTONE_PLAINTEXT_DIR:=/dev/shm/pjsktools-tombstones}"
: "${COMPLIANCE_TOMBSTONE_DAYS:=200}"
: "${COMPLIANCE_COS_TOMBSTONE_PREFIX:=deletions/tombstones}"
: "${COMPLIANCE_STATE_DIR:=/var/lib/pjsktools-compliance}"
: "${COMPLIANCE_PYTHON_BIN:=/opt/pjsktools-compliance/venv/bin/python}"

command -v age >/dev/null || { echo "age is not installed" >&2; exit 1; }
command -v docker >/dev/null || { echo "docker is not installed" >&2; exit 1; }
[[ -x "$COMPLIANCE_PYTHON_BIN" ]] || { echo "compliance Python is not installed" >&2; exit 1; }
[[ "$AGE_RECIPIENT" == age1* ]] || { echo "AGE_RECIPIENT is not an age public recipient" >&2; exit 1; }
[[ -f "$COMPOSE_FILE" && -f "$COMPOSE_ENV_FILE" ]] || { echo "compose configuration is missing" >&2; exit 1; }

install -d -m 0700 "$COMPLIANCE_TOMBSTONE_DIR" "$COMPLIANCE_TOMBSTONE_PLAINTEXT_DIR" \
  "$COMPLIANCE_STATE_DIR" "$COMPLIANCE_STATE_DIR/uploaded"
exec 9>"$COMPLIANCE_STATE_DIR/tombstone-export.lock"
flock -n 9 || exit 0

timestamp="$(date -u '+%Y%m%dT%H%M%SZ')"
plain="$COMPLIANCE_TOMBSTONE_PLAINTEXT_DIR/tombstones-${timestamp}.json"
encrypted="$COMPLIANCE_TOMBSTONE_DIR/tombstones-${timestamp}.json.age"
encrypted_tmp="${encrypted}.tmp"
trap 'rm -f -- "$plain" "$encrypted_tmp"' EXIT

# The table contains only HMAC-SHA256 identifiers and deletion timestamps.
# Explicit json_build_object keys prevent future schema columns from leaking.
(
  cd -- "$COMPOSE_PROJECT_DIR"
  docker compose --env-file "$COMPOSE_ENV_FILE" -f "$COMPOSE_FILE" \
    exec -T "$POSTGRES_SERVICE" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
      -X -q -A -t -v ON_ERROR_STOP=1 -c \
      "select json_build_object(
         'exportedAt', now(),
         'tombstones', coalesce(
           json_agg(json_build_object(
             'user_hash', user_hash,
             'email_hash', email_hash,
             'deleted_at', deleted_at
           ) order by deleted_at),
           '[]'::json
         )
       )
       from account_deletion_tombstones;"
) >"$plain"
chmod 0600 "$plain"
"$COMPLIANCE_PYTHON_BIN" "$SCRIPT_DIR/cos_archive.py" validate-tombstones --file "$plain"

age -r "$AGE_RECIPIENT" -o "$encrypted_tmp" "$plain"
[[ -s "$encrypted_tmp" ]] || { echo "encrypted tombstone export is empty" >&2; exit 1; }
head -c 64 "$encrypted_tmp" | grep -a -q 'age-encryption.org/v1' || { echo "invalid age header" >&2; exit 1; }
chmod 0600 "$encrypted_tmp"
mv -- "$encrypted_tmp" "$encrypted"
rm -f -- "$plain"

digest="$(sha256sum -- "$encrypted" | awk '{print $1}')"
printf '%s  %s\n' "$digest" "$(basename -- "$encrypted")" >"${encrypted}.sha256"
chmod 0600 "${encrypted}.sha256"
manifest_digest="$(sha256sum -- "${encrypted}.sha256" | awk '{print $1}')"
key="${COMPLIANCE_COS_TOMBSTONE_PREFIX%/}/$(date -u '+%Y/%m/%d')/$(basename -- "$encrypted")"
marker="$COMPLIANCE_STATE_DIR/uploaded/${digest}.ok"

"$COMPLIANCE_PYTHON_BIN" "$SCRIPT_DIR/cos_archive.py" upload --file "$encrypted" --key "$key"
"$COMPLIANCE_PYTHON_BIN" "$SCRIPT_DIR/cos_archive.py" upload --file "${encrypted}.sha256" --key "${key}.sha256"
printf '%s\t%s\t%s\t%s\t%s\n' "$key" "$digest" "${key}.sha256" "$manifest_digest" "$(date -u '+%FT%TZ')" >"$marker.tmp"
mv -f -- "$marker.tmp" "$marker"
chmod 0600 "$marker"

# Fail-safe cleanup: no valid five-field marker or paired manifest means retain.
while IFS= read -r -d '' old; do
  old_digest="$(sha256sum -- "$old" | awk '{print $1}')"
  old_marker="$COMPLIANCE_STATE_DIR/uploaded/${old_digest}.ok"
  if [[ -f "$old_marker" && -f "${old}.sha256" ]]; then
    IFS=$'\t' read -r data_key data_digest manifest_key saved_manifest_digest verified_at <"$old_marker" || true
    actual_manifest_digest="$(sha256sum -- "${old}.sha256" | awk '{print $1}')"
  else
    data_key=""
    data_digest=""
    manifest_key=""
    saved_manifest_digest=""
    verified_at=""
    actual_manifest_digest=""
  fi
  if [[ "$data_digest" == "$old_digest" && "$manifest_key" == "${data_key}.sha256" && "$saved_manifest_digest" == "$actual_manifest_digest" && -n "$verified_at" ]]; then
    rm -f -- "$old" "${old}.sha256"
  fi
done < <(find "$COMPLIANCE_TOMBSTONE_DIR" -maxdepth 1 -type f -name '*.json.age' -mtime "+$COMPLIANCE_TOMBSTONE_DAYS" -print0)

printf '%s\n' "$(date -u '+%FT%TZ')" >"$COMPLIANCE_STATE_DIR/last-tombstone-cos-success"
chmod 0600 "$COMPLIANCE_STATE_DIR/last-tombstone-cos-success"
