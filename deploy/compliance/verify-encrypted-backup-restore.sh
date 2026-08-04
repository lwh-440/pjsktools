#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

# Run this only on a trusted recovery workstation that holds the offline age
# identity. It creates a disposable PostgreSQL container and never connects to
# an existing database server.
[[ "${COMPLIANCE_ALLOW_ISOLATED_RESTORE:-}" == "isolated-only" ]] || {
  echo "set COMPLIANCE_ALLOW_ISOLATED_RESTORE=isolated-only" >&2
  exit 1
}
[[ "${COMPLIANCE_CONFIRM_DISPOSABLE_POSTGRES:-}" == "create-and-destroy" ]] || {
  echo "set COMPLIANCE_CONFIRM_DISPOSABLE_POSTGRES=create-and-destroy" >&2
  exit 1
}
[[ "${EUID}" -eq 0 ]] || { echo "run as root on the recovery workstation" >&2; exit 1; }

CONFIG_FILE="${COMPLIANCE_CONFIG_FILE:-/etc/pjsktools/compliance.env}"
COS_CONFIG_FILE="${COS_CONFIG_FILE:-/etc/pjsktools/cos.env}"
for file in "$CONFIG_FILE" "$COS_CONFIG_FILE"; do
  [[ -f "$file" && ! -L "$file" && "$(stat -c '%u' "$file")" == "0" ]] || {
    echo "configuration must be a root-owned regular file: $file" >&2; exit 1;
  }
  mode="$(stat -c '%a' "$file")"
  (( (8#$mode & 8#077) == 0 )) || { echo "configuration permissions are too broad: $file" >&2; exit 1; }
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

: "${AGE_IDENTITY_FILE:?AGE_IDENTITY_FILE must name the offline age identity}"
: "${COMPLIANCE_COS_DAILY_PREFIX:=backups/daily}"
: "${COMPLIANCE_PYTHON_BIN:=/opt/pjsktools-compliance/venv/bin/python}"
: "${RESTORE_POSTGRES_IMAGE:=postgres:16-alpine}"
[[ -f "$AGE_IDENTITY_FILE" && ! -L "$AGE_IDENTITY_FILE" ]] || { echo "invalid age identity file" >&2; exit 1; }
[[ "$(stat -c '%u' "$AGE_IDENTITY_FILE")" == "0" ]] || { echo "age identity must be owned by root" >&2; exit 1; }
identity_mode="$(stat -c '%a' "$AGE_IDENTITY_FILE")"
(( (8#$identity_mode & 8#077) == 0 )) || { echo "age identity must not be group/world accessible" >&2; exit 1; }
command -v age >/dev/null || { echo "age is not installed" >&2; exit 1; }
command -v docker >/dev/null || { echo "docker is not installed" >&2; exit 1; }
[[ -x "$COMPLIANCE_PYTHON_BIN" ]] || { echo "compliance Python is not installed" >&2; exit 1; }

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
work_dir="$(mktemp -d -t pjsktools-isolated-restore.XXXXXXXX)"
container="pjsktools-restore-$RANDOM-$$"
cleanup() {
  docker rm -f "$container" >/dev/null 2>&1 || true
  rm -rf -- "$work_dir"
}
trap cleanup EXIT INT TERM

"$COMPLIANCE_PYTHON_BIN" "$SCRIPT_DIR/cos_archive.py" random-download-pair \
  --prefix "$COMPLIANCE_COS_DAILY_PREFIX" --suffix .dump.age --output-dir "$work_dir"
age --decrypt -i "$AGE_IDENTITY_FILE" "$work_dir/archive" >"$work_dir/restore.dump"
chmod 0600 "$work_dir/restore.dump"
[[ -s "$work_dir/restore.dump" ]] || { echo "decrypted dump is empty" >&2; exit 1; }

docker run -d --name "$container" --network none --tmpfs /var/lib/postgresql/data:rw,noexec,nosuid,size=2g \
  -e POSTGRES_HOST_AUTH_METHOD=trust "$RESTORE_POSTGRES_IMAGE" >/dev/null
ready=0
for _ in $(seq 1 60); do
  if docker exec "$container" pg_isready -U postgres -d postgres >/dev/null 2>&1; then ready=1; break; fi
  sleep 1
done
(( ready == 1 )) || { echo "disposable PostgreSQL did not become ready" >&2; exit 1; }
docker exec "$container" createdb -U postgres restore_check
docker exec -i "$container" pg_restore -U postgres -d restore_check --clean --if-exists <"$work_dir/restore.dump"
table_count="$(docker exec "$container" psql -U postgres -d restore_check -Atc "select count(*) from pg_tables where schemaname='public'")"
(( table_count >= 13 )) || { echo "restore smoke failed: too few public tables" >&2; exit 1; }
docker exec "$container" psql -U postgres -d restore_check -Atc \
  "select to_regclass('public.users') is not null and to_regclass('public.schema_migrations') is not null" | grep -qx t
printf 'isolated encrypted backup restore: PASS (tables=%s)\n' "$table_count"
