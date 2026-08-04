#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

[[ "${DATABASE_ROLE_BOOTSTRAP_CONFIRMATION:-}" == "pre-migration-fixed-roles-only" ]] || {
  echo "missing pre-migration bootstrap confirmation" >&2
  exit 1
}
if [[ "${NODE_ENV:-}" == "production" ]]; then
  [[ "$EUID" -eq 0 ]] || { echo "production bootstrap must run as root" >&2; exit 1; }
elif [[ "${DATABASE_ROLE_TEST_MODE:-false}" != "true" || "${DATABASE_ROLE_TEST_CONFIRMATION:-}" != "isolated-harness-only" ]]; then
  echo "non-production bootstrap is restricted to the isolated harness" >&2
  exit 1
fi

: "${POSTGRES_ADMIN_URL:?POSTGRES_ADMIN_URL is required}"
: "${DATABASE_MIGRATION_URL:?DATABASE_MIGRATION_URL is required}"
: "${DATABASE_MIGRATION_ROLE:?DATABASE_MIGRATION_ROLE is required}"
: "${DATABASE_MIGRATION_PASSWORD:?DATABASE_MIGRATION_PASSWORD is required}"
: "${APP_RUNTIME_ROLE:?APP_RUNTIME_ROLE is required}"
: "${AUTH_RUNTIME_ROLE:?AUTH_RUNTIME_ROLE is required}"
: "${COMPLIANCE_RUNTIME_ROLE:?COMPLIANCE_RUNTIME_ROLE is required}"
[[ "$DATABASE_MIGRATION_ROLE" =~ ^[a-zA-Z_][a-zA-Z0-9_]*$ ]] || {
  echo "invalid migration role name" >&2
  exit 1
}
trap 'unset POSTGRES_ADMIN_URL PGDATABASE_MIGRATION_ROLE PGDATABASE_MIGRATION_PASSWORD' EXIT
export PGDATABASE_MIGRATION_ROLE="$DATABASE_MIGRATION_ROLE"
export PGDATABASE_MIGRATION_PASSWORD="$DATABASE_MIGRATION_PASSWORD"
export PGAPP_RUNTIME_ROLE="$APP_RUNTIME_ROLE"
export PGAUTH_RUNTIME_ROLE="$AUTH_RUNTIME_ROLE"
export PGCOMPLIANCE_RUNTIME_ROLE="$COMPLIANCE_RUNTIME_ROLE"

psql "$POSTGRES_ADMIN_URL" -X -v ON_ERROR_STOP=1 <<'SQL'
\getenv migration_role PGDATABASE_MIGRATION_ROLE
\getenv migration_password PGDATABASE_MIGRATION_PASSWORD
\getenv app_runtime_role PGAPP_RUNTIME_ROLE
\getenv auth_runtime_role PGAUTH_RUNTIME_ROLE
\getenv compliance_runtime_role PGCOMPLIANCE_RUNTIME_ROLE
select set_config('bootstrap.migration_role', :'migration_role', false);
select set_config('bootstrap.migration_password', :'migration_password', false);
select set_config('bootstrap.app_runtime_role', :'app_runtime_role', false);
select set_config('bootstrap.auth_runtime_role', :'auth_runtime_role', false);
select set_config('bootstrap.compliance_runtime_role', :'compliance_runtime_role', false);
do $bootstrap$
declare
  role_name text;
  migration_role text := current_setting('bootstrap.migration_role');
  migration_password text := current_setting('bootstrap.migration_password');
  unexpected_parent text;
begin
  if not exists (select 1 from pg_roles where rolname=migration_role) then
    execute format(
      'create role %I login password %L nosuperuser nocreatedb nocreaterole inherit noreplication nobypassrls',
      migration_role, migration_password
    );
  end if;
  if not exists (select 1 from pg_roles where rolname=migration_role and rolcanlogin) then
    raise exception 'migration role is not a LOGIN: %', migration_role using errcode='42501';
  end if;
  if exists (
    select 1 from pg_roles where rolname=migration_role and (
      rolsuper or rolcreatedb or rolcreaterole or rolreplication or rolbypassrls
    )
  ) then
    raise exception 'refusing privileged migration LOGIN: %', migration_role
      using errcode='42501';
  end if;
  -- This deployment-only LOGIN must inherit the three fixed DDL roles so a
  -- migration remains repeatable after ownership has already been transferred.
  -- It is never exposed to the API runtime.
  execute format('alter role %I inherit', migration_role);
  foreach role_name in array array[
    'pjsktools_compliance_owner', 'pjsktools_compliance_user',
    'pjsktools_compliance_maintenance', 'pjsktools_account_deletion_executor',
    'pjsktools_auth_api', 'pjsktools_auth_executor', 'pjsktools_app_user',
    'pjsktools_ranking_service', 'pjsktools_idempotency_service',
    'pjsktools_haruki_user', 'pjsktools_haruki_worker'
  ] loop
    if not exists (select 1 from pg_roles where rolname=role_name) then
      execute format(
        'create role %I nologin nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls',
        role_name
      );
    end if;
    if exists (
      select 1 from pg_roles where rolname=role_name and (
        rolcanlogin or rolsuper or rolcreatedb or rolcreaterole or rolinherit
        or rolreplication or rolbypassrls
      )
    ) then
      raise exception 'refusing unsafe database role attributes: %', role_name
        using errcode='42501';
    end if;
    select parent.rolname into unexpected_parent
    from pg_auth_members membership
    join pg_roles parent on parent.oid=membership.roleid
    join pg_roles member on member.oid=membership.member
    where member.rolname=role_name
    limit 1;
    if unexpected_parent is not null then
      raise exception 'fixed capability role % has unexpected parent role %', role_name, unexpected_parent
        using errcode='42501';
    end if;
  end loop;

  select parent.rolname into unexpected_parent
  from pg_auth_members membership
  join pg_roles parent on parent.oid=membership.roleid
  join pg_roles member on member.oid=membership.member
  where member.rolname=migration_role
    and parent.rolname not in (
      'pjsktools_compliance_owner','pjsktools_account_deletion_executor','pjsktools_auth_executor'
    )
  limit 1;
  if unexpected_parent is not null then
    raise exception 'migration LOGIN has unexpected parent role: %', unexpected_parent
      using errcode='42501';
  end if;
end
$bootstrap$;

-- These memberships are deployment capabilities only. Runtime LOGINs are
-- created later and never receive an owner or SECURITY DEFINER executor role.
do $bootstrap$
declare migration_role text := current_setting('bootstrap.migration_role');
begin
  execute format(
    'grant pjsktools_compliance_owner, pjsktools_account_deletion_executor, pjsktools_auth_executor to %I',
    migration_role
  );
  execute format('grant usage, create on schema public to %I', migration_role);
  -- ALTER ... OWNER requires the target owner itself to hold CREATE on the
  -- containing schema. Grant it before the migration transaction begins;
  -- migrations 016-018 revoke CREATE again after ownership is established.
  grant usage, create on schema public to pjsktools_compliance_owner,
    pjsktools_account_deletion_executor, pjsktools_auth_executor;
end
$bootstrap$;

do $bootstrap$
declare
  migration_role text := current_setting('bootstrap.migration_role');
  actual_parents text[];
begin
  select coalesce(array_agg(parent.rolname order by parent.rolname),array[]::text[])
  into actual_parents
  from pg_auth_members membership
  join pg_roles parent on parent.oid=membership.roleid
  join pg_roles member on member.oid=membership.member
  where member.rolname=migration_role;
  if actual_parents <> array[
    'pjsktools_account_deletion_executor','pjsktools_auth_executor','pjsktools_compliance_owner'
  ]::text[] then
    raise exception 'migration LOGIN membership set is not exact: %', actual_parents
      using errcode='42501';
  end if;
end
$bootstrap$;

do $bootstrap$
declare
  capability_role text;
  member_role text;
  migration_role text := current_setting('bootstrap.migration_role');
  app_role text := current_setting('bootstrap.app_runtime_role');
  auth_role text := current_setting('bootstrap.auth_runtime_role');
  compliance_role text := current_setting('bootstrap.compliance_runtime_role');
begin
  for capability_role, member_role in
    select parent.rolname, member.rolname
    from pg_auth_members membership
    join pg_roles parent on parent.oid=membership.roleid
    join pg_roles member on member.oid=membership.member
    where parent.rolname like 'pjsktools_%'
  loop
    if capability_role in (
      'pjsktools_compliance_owner','pjsktools_account_deletion_executor','pjsktools_auth_executor'
    ) and member_role <> migration_role then
      raise exception 'sensitive capability role % has unexpected member %', capability_role, member_role
        using errcode='42501';
    elsif capability_role in (
      'pjsktools_app_user','pjsktools_ranking_service','pjsktools_idempotency_service'
    ) and member_role <> app_role then
      raise exception 'application capability role % has unexpected member %', capability_role, member_role
        using errcode='42501';
    elsif capability_role='pjsktools_auth_api' and member_role <> auth_role then
      raise exception 'auth capability role has unexpected member %', member_role using errcode='42501';
    elsif capability_role in ('pjsktools_compliance_user','pjsktools_compliance_maintenance')
      and member_role <> compliance_role then
      raise exception 'compliance capability role % has unexpected member %', capability_role, member_role
        using errcode='42501';
    elsif capability_role in ('pjsktools_haruki_user','pjsktools_haruki_worker') then
      raise exception 'disabled Haruki capability role % has unexpected member %', capability_role, member_role
        using errcode='42501';
    end if;
  end loop;
end
$bootstrap$;
SQL

admin_role="$(psql "$POSTGRES_ADMIN_URL" -X -v ON_ERROR_STOP=1 -Atqc 'select current_user')"
[[ "$admin_role" != "$DATABASE_MIGRATION_ROLE" ]] || {
  echo "POSTGRES_ADMIN_URL and DATABASE_MIGRATION_ROLE must use different roles" >&2
  exit 1
}

actual_migration_role="$(psql "$DATABASE_MIGRATION_URL" -X -v ON_ERROR_STOP=1 -Atqc 'select current_user')"
[[ "$actual_migration_role" == "$DATABASE_MIGRATION_ROLE" ]] || {
  echo "DATABASE_MIGRATION_URL does not authenticate as DATABASE_MIGRATION_ROLE" >&2
  exit 1
}
psql "$DATABASE_MIGRATION_URL" -X -v ON_ERROR_STOP=1 -Atqc \
  "select case when rolsuper or rolcreatedb or rolcreaterole or rolreplication or rolbypassrls then 1 else 0 end from pg_roles where rolname=current_user" \
  | grep -qx '0' || {
    echo "migration LOGIN has forbidden cluster privileges" >&2
    exit 1
  }

echo "Pre-migration fixed roles and migration LOGIN are ready."
