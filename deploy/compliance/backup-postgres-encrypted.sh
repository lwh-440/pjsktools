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
: "${COMPLIANCE_BACKUP_DIR:=/var/backups/pjsktools}"
: "${COMPLIANCE_STATE_DIR:=/var/lib/pjsktools-compliance}"
: "${COMPLIANCE_DAILY_BACKUP_DAYS:=35}"
: "${COMPLIANCE_WEEKLY_BACKUP_DAYS:=92}"
: "${COMPLIANCE_COS_DAILY_PREFIX:=backups/daily}"
: "${COMPLIANCE_COS_WEEKLY_PREFIX:=backups/weekly}"
: "${COMPLIANCE_PYTHON_BIN:=/opt/pjsktools-compliance/venv/bin/python}"

command -v age >/dev/null || { echo "age is not installed" >&2; exit 1; }
command -v docker >/dev/null || { echo "docker is not installed" >&2; exit 1; }
[[ -x "$COMPLIANCE_PYTHON_BIN" ]] || { echo "compliance Python is not installed" >&2; exit 1; }
[[ "$AGE_RECIPIENT" == age1* ]] || { echo "AGE_RECIPIENT is not an age public recipient" >&2; exit 1; }
[[ -f "$COMPOSE_FILE" && -f "$COMPOSE_ENV_FILE" ]] || { echo "compose configuration is missing" >&2; exit 1; }

daily_dir="$COMPLIANCE_BACKUP_DIR/daily"
weekly_dir="$COMPLIANCE_BACKUP_DIR/weekly"
install -d -m 0700 "$daily_dir" "$weekly_dir" "$COMPLIANCE_STATE_DIR" "$COMPLIANCE_STATE_DIR/uploaded"
exec 9>"$COMPLIANCE_STATE_DIR/backup.lock"
flock -n 9 || exit 0

marker_for() {
  local key="$1" digest="$2" marker_id
  marker_id="$(printf '%s\n%s\n' "$key" "$digest" | sha256sum | awk '{print $1}')"
  printf '%s/uploaded/%s.ok\n' "$COMPLIANCE_STATE_DIR" "$marker_id"
}

backup_key_for() {
  local file="$1" prefix="$2" name stamp
  name="$(basename -- "$file")"
  stamp="${name#pjsktools-}"
  [[ "$stamp" =~ ^[0-9]{8}T[0-9]{6}Z\.dump\.age$ ]] || {
    echo "unexpected backup filename: $name" >&2
    return 1
  }
  printf '%s/%s/%s/%s\n' "${prefix%/}" "${stamp:0:4}" "${stamp:4:2}" "$name"
}

timestamp="$(date -u '+%Y%m%dT%H%M%SZ')"
daily="$daily_dir/pjsktools-${timestamp}.dump.age"
temporary="${daily}.tmp"
trap 'rm -f -- "$temporary"' EXIT

(
  cd -- "$COMPOSE_PROJECT_DIR"
  docker compose --env-file "$COMPOSE_ENV_FILE" -f "$COMPOSE_FILE" \
    exec -T "$POSTGRES_SERVICE" pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc
) | age -r "$AGE_RECIPIENT" -o "$temporary"

[[ -s "$temporary" ]] || { echo "encrypted backup is empty" >&2; exit 1; }
head -c 64 "$temporary" | grep -a -q 'age-encryption.org/v1' || { echo "invalid age header" >&2; exit 1; }
chmod 0600 "$temporary"
mv -- "$temporary" "$daily"
digest="$(sha256sum -- "$daily" | awk '{print $1}')"
printf '%s  %s\n' "$digest" "$(basename -- "$daily")" >"${daily}.sha256"
chmod 0600 "${daily}.sha256"

upload_verified() {
  local file="$1" prefix="$2" marker key sum manifest_sum
  sum="$(sha256sum -- "$file" | awk '{print $1}')"
  manifest_sum="$(sha256sum -- "${file}.sha256" | awk '{print $1}')"
  key="$(backup_key_for "$file" "$prefix")"
  marker="$(marker_for "$key" "$sum")"
  "$COMPLIANCE_PYTHON_BIN" "$SCRIPT_DIR/cos_archive.py" upload --file "$file" --key "$key"
  "$COMPLIANCE_PYTHON_BIN" "$SCRIPT_DIR/cos_archive.py" upload --file "${file}.sha256" --key "${key}.sha256"
  printf '%s\t%s\t%s\t%s\t%s\n' "$key" "$sum" "${key}.sha256" "$manifest_sum" "$(date -u '+%FT%TZ')" >"$marker.tmp"
  mv -f -- "$marker.tmp" "$marker"
  chmod 0600 "$marker"
}

upload_verified "$daily" "$COMPLIANCE_COS_DAILY_PREFIX"

if [[ "$(date -u '+%u')" == "7" ]]; then
  weekly="$weekly_dir/$(basename -- "$daily")"
  cp --reflink=auto -- "$daily" "$weekly"
  cp -- "${daily}.sha256" "${weekly}.sha256"
  chmod 0600 "$weekly" "${weekly}.sha256"
  upload_verified "$weekly" "$COMPLIANCE_COS_WEEKLY_PREFIX"
fi

# The server never stores the age private identity. Cleanup is permitted only
# after upload and HEAD metadata verification created a matching marker.
for spec in "$daily_dir:$COMPLIANCE_DAILY_BACKUP_DAYS" "$weekly_dir:$COMPLIANCE_WEEKLY_BACKUP_DAYS"; do
  directory="${spec%%:*}"
  days="${spec##*:}"
  while IFS= read -r -d '' old; do
    old_digest="$(sha256sum -- "$old" | awk '{print $1}')"
    if [[ "$directory" == "$daily_dir" ]]; then
      expected_key="$(backup_key_for "$old" "$COMPLIANCE_COS_DAILY_PREFIX")"
    else
      expected_key="$(backup_key_for "$old" "$COMPLIANCE_COS_WEEKLY_PREFIX")"
    fi
    marker="$(marker_for "$expected_key" "$old_digest")"
    if [[ -f "$marker" && -f "${old}.sha256" ]]; then
      IFS=$'\t' read -r data_key data_digest manifest_key manifest_digest verified_at <"$marker" || true
      actual_manifest_digest="$(sha256sum -- "${old}.sha256" | awk '{print $1}')"
    else
      data_key=""
      data_digest=""
      manifest_key=""
      manifest_digest=""
      verified_at=""
      actual_manifest_digest=""
    fi
    if [[ "$data_key" == "$expected_key" && "$data_digest" == "$old_digest" && "$manifest_key" == "${expected_key}.sha256" && "$manifest_digest" == "$actual_manifest_digest" && -n "$verified_at" ]]; then
      rm -f -- "$old" "${old}.sha256"
    fi
  done < <(find "$directory" -maxdepth 1 -type f -name '*.dump.age' -mtime "+$days" -print0)
done

printf '%s\n' "$(date -u '+%FT%TZ')" >"$COMPLIANCE_STATE_DIR/last-backup-success"
printf '%s\n' "$(date -u '+%FT%TZ')" >"$COMPLIANCE_STATE_DIR/last-backup-cos-success"
chmod 0600 "$COMPLIANCE_STATE_DIR/last-backup-success"
chmod 0600 "$COMPLIANCE_STATE_DIR/last-backup-cos-success"
