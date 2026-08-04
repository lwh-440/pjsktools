-- Database roles are created at a separate pre-migration bootstrap boundary.
-- This migration only consumes them and fails closed if bootstrap was skipped
-- or any fixed role acquired an unsafe attribute.
do $$
declare role_name text;
begin
  foreach role_name in array array[
    'pjsktools_compliance_owner', 'pjsktools_compliance_user',
    'pjsktools_compliance_maintenance', 'pjsktools_account_deletion_executor'
  ] loop
    if not exists (select 1 from pg_roles where rolname = role_name) then
      raise exception 'required database role is missing: %', role_name
        using errcode = '42501';
    end if;
    if exists (
      select 1 from pg_roles where rolname = role_name and (
        rolcanlogin or rolsuper or rolcreatedb or rolcreaterole or rolinherit
        or rolreplication or rolbypassrls
      )
    ) then
      raise exception 'refusing unsafe database role attributes: %', role_name
        using errcode = '42501';
    end if;
  end loop;
end $$;

do $$
begin
  if not pg_has_role(current_user, 'pjsktools_compliance_owner', 'MEMBER')
    or not pg_has_role(current_user, 'pjsktools_account_deletion_executor', 'MEMBER') then
    raise exception 'migration role bootstrap membership is incomplete'
      using errcode = '42501';
  end if;
end $$;

-- PostgreSQL requires the target owner to have CREATE on the containing schema
-- during ownership transfer. It is revoked again before this migration ends.
grant usage, create on schema public to pjsktools_compliance_owner,
  pjsktools_account_deletion_executor;

-- SECURITY DEFINER bodies below resolve pg_catalog objects with a locked
-- search_path, but the functions themselves still live in public. Their final
-- NOLOGIN owner must retain USAGE on that schema after CREATE is revoked.
grant usage on schema public to pjsktools_account_deletion_executor;

revoke all on legal_acceptances, account_deletion_intents,
  account_deletion_tombstones, ranking_history_minute_rollups from public;

grant usage on schema public to pjsktools_compliance_owner, pjsktools_compliance_user, pjsktools_compliance_maintenance;
grant select, insert on legal_acceptances to pjsktools_compliance_user;
grant select, insert, update on account_deletion_intents to pjsktools_compliance_user;
grant delete on account_deletion_intents to pjsktools_compliance_maintenance;
grant select (expires_at, consumed_at) on account_deletion_intents to pjsktools_compliance_maintenance;
grant select, insert, delete on account_deletion_tombstones to pjsktools_compliance_maintenance;
grant select, insert, update on ranking_history_minute_rollups to pjsktools_compliance_maintenance;
grant select, delete on users to pjsktools_account_deletion_executor;
grant update (id) on users to pjsktools_account_deletion_executor;
grant select (scope), delete on api_idempotency_records to pjsktools_account_deletion_executor;
grant insert on account_deletion_tombstones to pjsktools_account_deletion_executor;
grant select (user_hash) on account_deletion_tombstones to pjsktools_account_deletion_executor;

-- Retention rollups read and remove only old raw ranking samples. The table
-- already has RLS enabled by migration 007, so the maintenance role needs an
-- explicit policy instead of relying on table ownership.
grant select (region, event_id, sample_type, rank, score, sampled_at), delete
  on ranking_history_samples to pjsktools_compliance_maintenance;

alter table legal_acceptances force row level security;
alter table account_deletion_intents force row level security;
alter table account_deletion_tombstones force row level security;
alter table ranking_history_minute_rollups force row level security;

drop policy if exists legal_acceptances_owner_select on legal_acceptances;
create policy legal_acceptances_owner_select on legal_acceptances
  for select to pjsktools_compliance_user
  using (user_id::text = nullif(current_setting('pjsktools.user_id', true), ''));

drop policy if exists legal_acceptances_owner_insert on legal_acceptances;
create policy legal_acceptances_owner_insert on legal_acceptances
  for insert to pjsktools_compliance_user
  with check (user_id::text = nullif(current_setting('pjsktools.user_id', true), ''));

drop policy if exists account_deletion_intents_owner_select on account_deletion_intents;
create policy account_deletion_intents_owner_select on account_deletion_intents
  for select to pjsktools_compliance_user
  using (user_id::text = nullif(current_setting('pjsktools.user_id', true), ''));

drop policy if exists account_deletion_intents_owner_insert on account_deletion_intents;
create policy account_deletion_intents_owner_insert on account_deletion_intents
  for insert to pjsktools_compliance_user
  with check (user_id::text = nullif(current_setting('pjsktools.user_id', true), ''));

drop policy if exists account_deletion_intents_owner_update on account_deletion_intents;
create policy account_deletion_intents_owner_update on account_deletion_intents
  for update to pjsktools_compliance_user
  using (user_id::text = nullif(current_setting('pjsktools.user_id', true), ''))
  with check (user_id::text = nullif(current_setting('pjsktools.user_id', true), ''));

drop policy if exists account_deletion_intents_retention_delete on account_deletion_intents;
drop policy if exists account_deletion_intents_retention_select on account_deletion_intents;
create policy account_deletion_intents_retention_select on account_deletion_intents
  for select to pjsktools_compliance_maintenance
  using (expires_at <= now() or consumed_at < now() - interval '24 hours');

create policy account_deletion_intents_retention_delete on account_deletion_intents
  for delete to pjsktools_compliance_maintenance
  using (expires_at <= now() or consumed_at < now() - interval '24 hours');

drop policy if exists account_deletion_tombstones_maintenance_select on account_deletion_tombstones;
create policy account_deletion_tombstones_maintenance_select on account_deletion_tombstones
  for select to pjsktools_compliance_maintenance using (true);

drop policy if exists account_deletion_tombstones_maintenance_insert on account_deletion_tombstones;
create policy account_deletion_tombstones_maintenance_insert on account_deletion_tombstones
  for insert to pjsktools_compliance_maintenance with check (true);

drop policy if exists account_deletion_tombstones_account_delete_insert on account_deletion_tombstones;
create policy account_deletion_tombstones_account_delete_insert on account_deletion_tombstones
  for insert to pjsktools_account_deletion_executor with check (true);

drop policy if exists account_deletion_tombstones_account_delete_select on account_deletion_tombstones;
create policy account_deletion_tombstones_account_delete_select on account_deletion_tombstones
  for select to pjsktools_account_deletion_executor using (true);

drop policy if exists account_deletion_tombstones_retention_delete on account_deletion_tombstones;
create policy account_deletion_tombstones_retention_delete on account_deletion_tombstones
  for delete to pjsktools_compliance_maintenance
  using (deleted_at < now() - interval '200 days');

drop policy if exists ranking_history_minute_rollups_maintenance_select on ranking_history_minute_rollups;
create policy ranking_history_minute_rollups_maintenance_select on ranking_history_minute_rollups
  for select to pjsktools_compliance_maintenance using (true);

drop policy if exists ranking_history_minute_rollups_maintenance_insert on ranking_history_minute_rollups;
create policy ranking_history_minute_rollups_maintenance_insert on ranking_history_minute_rollups
  for insert to pjsktools_compliance_maintenance with check (true);

drop policy if exists ranking_history_minute_rollups_maintenance_update on ranking_history_minute_rollups;
create policy ranking_history_minute_rollups_maintenance_update on ranking_history_minute_rollups
  for update to pjsktools_compliance_maintenance using (true) with check (true);

drop policy if exists ranking_history_samples_retention_select on ranking_history_samples;
create policy ranking_history_samples_retention_select on ranking_history_samples
  for select to pjsktools_compliance_maintenance
  using (sampled_at < now() - interval '14 days');

drop policy if exists ranking_history_samples_retention_delete on ranking_history_samples;
create policy ranking_history_samples_retention_delete on ranking_history_samples
  for delete to pjsktools_compliance_maintenance
  using (sampled_at < now() - interval '14 days');

drop policy if exists users_account_delete_select on users;
create policy users_account_delete_select on users
  for select to pjsktools_account_deletion_executor using (true);

drop policy if exists users_account_delete_delete on users;
create policy users_account_delete_delete on users
  for delete to pjsktools_account_deletion_executor using (true);

drop policy if exists users_account_delete_lock on users;
create policy users_account_delete_lock on users
  for update to pjsktools_account_deletion_executor using (true) with check (true);

drop policy if exists api_idempotency_account_delete_select on api_idempotency_records;
create policy api_idempotency_account_delete_select on api_idempotency_records
  for select to pjsktools_account_deletion_executor using (true);

drop policy if exists api_idempotency_account_delete_delete on api_idempotency_records;
create policy api_idempotency_account_delete_delete on api_idempotency_records
  for delete to pjsktools_account_deletion_executor using (true);

create or replace function public.pjsktools_delete_account_with_tombstone(
  target_user_id uuid,
  target_user_hash text,
  target_email_hash text
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog
set row_security = on
as $function$
begin
  if target_user_id::text is distinct from nullif(current_setting('pjsktools.user_id', true), '') then
    raise exception 'account deletion identity mismatch' using errcode = '42501';
  end if;
  perform 1 from public.users where id = target_user_id for update;
  if not found then
    return false;
  end if;

  insert into public.account_deletion_tombstones (user_hash, email_hash, deleted_at)
  values (target_user_hash, target_email_hash, now())
  on conflict (user_hash) do nothing;

  delete from public.api_idempotency_records
  where scope like target_user_id::text || ':%';
  delete from public.users where id = target_user_id;
  return found;
end
$function$;

create or replace function public.pjsktools_lock_account_deletion_identity(target_user_id uuid)
returns table(user_id uuid, email text)
language plpgsql
security definer
set search_path = pg_catalog
set row_security = on
as $function$
begin
  if target_user_id::text is distinct from nullif(current_setting('pjsktools.user_id', true), '') then
    raise exception 'account deletion identity mismatch' using errcode = '42501';
  end if;
  return query
    select source.id, source.email
    from public.users as source
    where source.id = target_user_id
    for update;
end
$function$;

revoke all on function public.pjsktools_delete_account_with_tombstone(uuid, text, text) from public;
revoke all on function public.pjsktools_lock_account_deletion_identity(uuid) from public;
grant execute on function public.pjsktools_delete_account_with_tombstone(uuid, text, text)
  to pjsktools_compliance_user;
grant execute on function public.pjsktools_lock_account_deletion_identity(uuid)
  to pjsktools_compliance_user;

-- Transfer ownership only after every policy, privilege and function change is
-- complete. The migration LOGIN is NOINHERIT, so moving ownership earlier in
-- this transaction would correctly remove its direct DDL access mid-migration.
alter table legal_acceptances owner to pjsktools_compliance_owner;
alter table account_deletion_intents owner to pjsktools_compliance_owner;
alter table account_deletion_tombstones owner to pjsktools_compliance_owner;
alter table ranking_history_minute_rollups owner to pjsktools_compliance_owner;
alter function public.pjsktools_delete_account_with_tombstone(uuid, text, text)
  owner to pjsktools_account_deletion_executor;
alter function public.pjsktools_lock_account_deletion_identity(uuid)
  owner to pjsktools_account_deletion_executor;
revoke create on schema public from pjsktools_compliance_owner, pjsktools_account_deletion_executor;
