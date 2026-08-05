#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

CONFIG_FILE="${DATABASE_ROLE_CONFIG_FILE:-/etc/pjsktools/database-roles.env}"
TEST_MODE=false
ENVIRONMENT_MODE=false
if [[ "${DATABASE_ROLE_CONFIG_SOURCE:-file}" == "environment" ]]; then
  [[ "${NODE_ENV:-}" == "production" ]] || { echo "environment bootstrap is production-only" >&2; exit 1; }
  [[ "$EUID" -eq 0 ]] || { echo "environment bootstrap must run as root" >&2; exit 1; }
  [[ "${DATABASE_ROLE_BOOTSTRAP_CONFIRMATION:-}" == "migrations-complete-runtime-logins-only" ]] || {
    echo "missing production bootstrap confirmation" >&2
    exit 1
  }
  ENVIRONMENT_MODE=true
elif [[ "${DATABASE_ROLE_TEST_MODE:-false}" == "true" ]]; then
  [[ "${DATABASE_ROLE_TEST_CONFIRMATION:-}" == "isolated-harness-only" ]] || { echo "missing isolated harness confirmation" >&2; exit 1; }
  [[ "${NODE_ENV:-}" != "production" ]] || { echo "test mode is forbidden in production" >&2; exit 1; }
  [[ -n "${DATABASE_ROLE_TEST_DIRECTORY:-}" ]] || { echo "missing test harness directory" >&2; exit 1; }
  [[ -d "$DATABASE_ROLE_TEST_DIRECTORY" && ! -L "$DATABASE_ROLE_TEST_DIRECTORY" ]] || { echo "invalid test harness directory" >&2; exit 1; }
  test_directory="$(realpath "$DATABASE_ROLE_TEST_DIRECTORY")"
  [[ "$CONFIG_FILE" == "$test_directory/database-roles.env" ]] || { echo "test config must use the fixed harness path" >&2; exit 1; }
  [[ "$(stat -c '%u' "$test_directory")" == "$EUID" ]] || { echo "test harness directory has an unexpected owner" >&2; exit 1; }
  directory_mode="$(stat -c '%a' "$test_directory")"
  [[ "$directory_mode" == "700" ]] || { echo "test harness directory permissions must be exactly 0700" >&2; exit 1; }
  TEST_MODE=true
else
  [[ "$EUID" -eq 0 ]] || { echo "run as root" >&2; exit 1; }
fi
if [[ "$ENVIRONMENT_MODE" != "true" ]]; then
  [[ -f "$CONFIG_FILE" && ! -L "$CONFIG_FILE" ]] || { echo "missing regular config: $CONFIG_FILE" >&2; exit 1; }
  exec {config_fd}<"$CONFIG_FILE"
  config_fd_path="/proc/self/fd/$config_fd"
  [[ -f "$config_fd_path" ]] || { echo "config descriptor is not a regular file" >&2; exit 1; }
  expected_uid=0
  [[ "$TEST_MODE" == "true" ]] && expected_uid="$EUID"
  [[ "$(stat -Lc '%u' "$config_fd_path")" == "$expected_uid" ]] || { echo "config has an unexpected owner" >&2; exit 1; }
  mode="$(stat -Lc '%a' "$config_fd_path")"
  (( (8#$mode & 8#077) == 0 )) || { echo "config permissions are too broad" >&2; exit 1; }
  [[ "$mode" == "600" ]] || { echo "config permissions must be exactly 0600" >&2; exit 1; }
  config_identity_before="$(stat -Lc '%d:%i:%u:%a' "$config_fd_path")"
  config_digest_before="$(sha256sum -- "$config_fd_path" | awk '{print $1}')"
  # shellcheck disable=SC1090
  source "$config_fd_path"
  config_identity_after="$(stat -Lc '%d:%i:%u:%a' "$config_fd_path")"
  config_digest_after="$(sha256sum -- "$config_fd_path" | awk '{print $1}')"
  [[ "$config_identity_after" == "$config_identity_before" ]] || { echo "config changed while it was being read" >&2; exit 1; }
  [[ "$config_digest_after" == "$config_digest_before" ]] || { echo "config content changed while it was being read" >&2; exit 1; }
  exec {config_fd}<&-
fi

: "${POSTGRES_ADMIN_URL:?POSTGRES_ADMIN_URL is required}"
: "${APP_RUNTIME_ROLE:=pjsktools_app}"
: "${APP_RUNTIME_PASSWORD:?APP_RUNTIME_PASSWORD is required}"
: "${AUTH_RUNTIME_ROLE:=pjsktools_auth}"
: "${AUTH_RUNTIME_PASSWORD:?AUTH_RUNTIME_PASSWORD is required}"
: "${COMPLIANCE_RUNTIME_ROLE:=pjsktools_compliance}"
: "${COMPLIANCE_RUNTIME_PASSWORD:?COMPLIANCE_RUNTIME_PASSWORD is required}"
: "${HARUKI_RUNTIME_ROLE:=pjsktools_haruki}"

if [[ "$ENVIRONMENT_MODE" == "true" ]]; then
  : "${DATABASE_URL:?DATABASE_URL is required for bootstrap verification}"
  : "${AUTH_DATABASE_URL:?AUTH_DATABASE_URL is required for bootstrap verification}"
  : "${COMPLIANCE_DATABASE_URL:?COMPLIANCE_DATABASE_URL is required for bootstrap verification}"
fi

case "$APP_RUNTIME_ROLE:$AUTH_RUNTIME_ROLE:$COMPLIANCE_RUNTIME_ROLE:$HARUKI_RUNTIME_ROLE" in
  *[!a-zA-Z0-9_:]*) echo "role names must be alphanumeric or underscore" >&2; exit 1 ;;
esac
[[ "$APP_RUNTIME_ROLE" != "$AUTH_RUNTIME_ROLE" && "$APP_RUNTIME_ROLE" != "$COMPLIANCE_RUNTIME_ROLE" && "$APP_RUNTIME_ROLE" != "$HARUKI_RUNTIME_ROLE" && "$AUTH_RUNTIME_ROLE" != "$COMPLIANCE_RUNTIME_ROLE" && "$AUTH_RUNTIME_ROLE" != "$HARUKI_RUNTIME_ROLE" && "$COMPLIANCE_RUNTIME_ROLE" != "$HARUKI_RUNTIME_ROLE" ]] || { echo "runtime roles must be distinct" >&2; exit 1; }

trap 'unset PGAPP_RUNTIME_PASSWORD PGAUTH_RUNTIME_PASSWORD PGCOMPLIANCE_RUNTIME_PASSWORD PGHARUKI_RUNTIME_PASSWORD POSTGRES_ADMIN_URL DATABASE_URL AUTH_DATABASE_URL COMPLIANCE_DATABASE_URL' EXIT

export PGAPP_RUNTIME_ROLE="$APP_RUNTIME_ROLE"
export PGAPP_RUNTIME_PASSWORD="$APP_RUNTIME_PASSWORD"
export PGAUTH_RUNTIME_ROLE="$AUTH_RUNTIME_ROLE"
export PGAUTH_RUNTIME_PASSWORD="$AUTH_RUNTIME_PASSWORD"
export PGCOMPLIANCE_RUNTIME_ROLE="$COMPLIANCE_RUNTIME_ROLE"
export PGCOMPLIANCE_RUNTIME_PASSWORD="$COMPLIANCE_RUNTIME_PASSWORD"
export PGHARUKI_RUNTIME_ROLE="$HARUKI_RUNTIME_ROLE"
export PGHARUKI_RUNTIME_PASSWORD="${HARUKI_RUNTIME_PASSWORD:-}"

psql "$POSTGRES_ADMIN_URL" -X -v ON_ERROR_STOP=1 <<'SQL'
\getenv app_role PGAPP_RUNTIME_ROLE
\getenv app_password PGAPP_RUNTIME_PASSWORD
\getenv auth_role PGAUTH_RUNTIME_ROLE
\getenv auth_password PGAUTH_RUNTIME_PASSWORD
\getenv compliance_role PGCOMPLIANCE_RUNTIME_ROLE
\getenv compliance_password PGCOMPLIANCE_RUNTIME_PASSWORD
\getenv haruki_role PGHARUKI_RUNTIME_ROLE
\getenv haruki_password PGHARUKI_RUNTIME_PASSWORD
select set_config('bootstrap.app_role', :'app_role', false);
select set_config('bootstrap.app_password', :'app_password', false);
select set_config('bootstrap.auth_role', :'auth_role', false);
select set_config('bootstrap.auth_password', :'auth_password', false);
select set_config('bootstrap.compliance_role', :'compliance_role', false);
select set_config('bootstrap.compliance_password', :'compliance_password', false);
select set_config('bootstrap.haruki_role', :'haruki_role', false);
select set_config('bootstrap.haruki_password', :'haruki_password', false);

do $bootstrap$
declare
  app_role text := current_setting('bootstrap.app_role');
  app_password text := current_setting('bootstrap.app_password');
  auth_role text := current_setting('bootstrap.auth_role');
  auth_password text := current_setting('bootstrap.auth_password');
  compliance_role text := current_setting('bootstrap.compliance_role');
  compliance_password text := current_setting('bootstrap.compliance_password');
  haruki_role text := current_setting('bootstrap.haruki_role');
  haruki_password text := current_setting('bootstrap.haruki_password');
  parent_role text;
begin
  if not exists (select 1 from pg_roles where rolname = app_role) then
    execute format('create role %I login password %L nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls', app_role, app_password);
  else
    execute format('alter role %I login password %L nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls', app_role, app_password);
  end if;
  if not exists (select 1 from pg_roles where rolname = compliance_role) then
    execute format('create role %I login password %L nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls', compliance_role, compliance_password);
  else
    execute format('alter role %I login password %L nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls', compliance_role, compliance_password);
  end if;
  if not exists (select 1 from pg_roles where rolname = auth_role) then
    execute format('create role %I login password %L nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls', auth_role, auth_password);
  else
    execute format('alter role %I login password %L nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls', auth_role, auth_password);
  end if;

  for parent_role in select parent.rolname from pg_auth_members m join pg_roles parent on parent.oid=m.roleid join pg_roles member on member.oid=m.member where member.rolname=app_role loop
    execute format('revoke %I from %I',parent_role,app_role);
  end loop;
  for parent_role in select parent.rolname from pg_auth_members m join pg_roles parent on parent.oid=m.roleid join pg_roles member on member.oid=m.member where member.rolname=auth_role loop
    execute format('revoke %I from %I',parent_role,auth_role);
  end loop;
  for parent_role in select parent.rolname from pg_auth_members m join pg_roles parent on parent.oid=m.roleid join pg_roles member on member.oid=m.member where member.rolname=compliance_role loop
    execute format('revoke %I from %I',parent_role,compliance_role);
  end loop;
  execute format('grant pjsktools_app_user, pjsktools_ranking_service, pjsktools_idempotency_service to %I', app_role);
  execute format('grant pjsktools_auth_api to %I', auth_role);
  execute format('grant pjsktools_compliance_user, pjsktools_compliance_maintenance to %I', compliance_role);
  if haruki_password <> '' then
    if not exists (select 1 from pg_roles where rolname = haruki_role) then
      execute format('create role %I login password %L nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls', haruki_role, haruki_password);
    else
      execute format('alter role %I login password %L nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls', haruki_role, haruki_password);
    end if;
    for parent_role in select parent.rolname from pg_auth_members m join pg_roles parent on parent.oid=m.roleid join pg_roles member on member.oid=m.member where member.rolname=haruki_role loop
      execute format('revoke %I from %I',parent_role,haruki_role);
    end loop;
    execute format('grant pjsktools_haruki_user, pjsktools_haruki_worker to %I', haruki_role);
  elsif exists(select 1 from pg_roles where rolname=haruki_role) then
    for parent_role in select parent.rolname from pg_auth_members m join pg_roles parent on parent.oid=m.roleid join pg_roles member on member.oid=m.member where member.rolname=haruki_role loop
      execute format('revoke %I from %I',parent_role,haruki_role);
    end loop;
    execute format('alter role %I nologin password null nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls',haruki_role);
  end if;
end
$bootstrap$;
SQL

verify_runtime_login() {
  local url="$1" expected_role="$2" expected_memberships="$3" actual_role actual_memberships target admin_target
  actual_role="$(psql "$url" -X -v ON_ERROR_STOP=1 -Atc 'select current_user')"
  [[ "$actual_role" == "$expected_role" ]] || { echo "runtime URL uses an unexpected role" >&2; exit 1; }
  actual_memberships="$(psql "$url" -X -v ON_ERROR_STOP=1 -Atc \
    "select coalesce(string_agg(parent.rolname, ',' order by parent.rolname),'') from pg_auth_members membership join pg_roles parent on parent.oid=membership.roleid join pg_roles member on member.oid=membership.member where member.rolname=current_user")"
  [[ "$actual_memberships" == "$expected_memberships" ]] || { echo "runtime role membership verification failed for $expected_role" >&2; exit 1; }
  psql "$url" -X -v ON_ERROR_STOP=1 -Atc \
    "select case when rolcanlogin and not rolsuper and not rolcreatedb and not rolcreaterole and not rolinherit and not rolreplication and not rolbypassrls then 0 else 1 end from pg_roles where rolname=current_user" \
    | grep -qx '0' || { echo "runtime role has forbidden attributes: $expected_role" >&2; exit 1; }
  psql "$url" -X -v ON_ERROR_STOP=1 -Atc \
    "select count(*) from (select n.oid from pg_namespace n join pg_roles r on r.oid=n.nspowner where r.rolname=current_user union all select c.oid from pg_class c join pg_roles r on r.oid=c.relowner where r.rolname=current_user union all select p.oid from pg_proc p join pg_roles r on r.oid=p.proowner where r.rolname=current_user) owned" \
    | grep -qx '0' || { echo "runtime role unexpectedly owns database objects: $expected_role" >&2; exit 1; }
  target="$(psql "$url" -X -v ON_ERROR_STOP=1 -Atc "select current_database() || '|' || coalesce(inet_server_addr()::text,'local') || '|' || inet_server_port()")"
  admin_target="$(psql "$POSTGRES_ADMIN_URL" -X -v ON_ERROR_STOP=1 -Atc "select current_database() || '|' || coalesce(inet_server_addr()::text,'local') || '|' || inet_server_port()")"
  [[ "$target" == "$admin_target" ]] || { echo "runtime URL does not target the migrated database" >&2; exit 1; }
}

if [[ "$ENVIRONMENT_MODE" == "true" ]]; then
  verify_runtime_login "$DATABASE_URL" "$APP_RUNTIME_ROLE" "pjsktools_app_user,pjsktools_idempotency_service,pjsktools_ranking_service"
  verify_runtime_login "$AUTH_DATABASE_URL" "$AUTH_RUNTIME_ROLE" "pjsktools_auth_api"
  verify_runtime_login "$COMPLIANCE_DATABASE_URL" "$COMPLIANCE_RUNTIME_ROLE" "pjsktools_compliance_maintenance,pjsktools_compliance_user"
fi

echo "Database runtime roles are configured. Keep the admin URL outside the API environment."
