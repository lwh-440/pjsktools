-- Runtime authorization roles are created before migrations. Never create or
-- repair cluster roles from application migrations.
do $$
declare role_name text;
begin
  foreach role_name in array array[
    'pjsktools_app_user',
    'pjsktools_ranking_service', 'pjsktools_idempotency_service'
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

-- Remove obsolete broad roles if no login is still a member. Bootstrap revokes
-- them from the application login before production starts.
do $$
declare old_role text;
begin
  foreach old_role in array array['pjsktools_app_auth','pjsktools_app_runtime'] loop
    if exists(select 1 from pg_roles where rolname=old_role) then
      execute format('revoke all on all tables in schema public from %I',old_role);
      execute format('revoke all on all sequences in schema public from %I',old_role);
    end if;
  end loop;
end $$;

revoke create on schema public from public;
grant usage on schema public to pjsktools_app_user,
  pjsktools_ranking_service, pjsktools_idempotency_service;

do $$
begin
  if not pg_has_role(current_user, 'pjsktools_compliance_owner', 'MEMBER') then
    raise exception 'migration role lacks pjsktools_compliance_owner membership'
      using errcode = '42501';
  end if;
end $$;

-- A NOLOGIN owner prevents either runtime LOGIN from bypassing RLS.
grant create on schema public to pjsktools_compliance_owner;
do $$
declare table_name text;
begin
  foreach table_name in array array[
    'users','oauth_accounts','auth_sessions','auth_states','email_verification_codes',
    'email_verification_cooldowns','oauth_handoffs','favorites','favorite_folders',
    'favorite_folder_items','scores','user_player_bindings','user_card_inventory',
    'user_deck_configs','user_player_data','ranking_history_samples','api_idempotency_records'
  ] loop
    execute format('alter table %I force row level security', table_name);
  end loop;
end $$;

revoke all on all tables in schema public from public;
revoke all on all sequences in schema public from public;
revoke execute on all functions in schema public from public;
alter default privileges in schema public revoke all on tables from public;
alter default privileges in schema public revoke all on sequences from public;
alter default privileges in schema public revoke execute on functions from public;

-- Authenticated non-authentication data. The application sets
-- pjsktools.user_id. users/oauth_accounts/auth_sessions are deliberately
-- excluded and are reachable only through migration 018's auth capabilities.
revoke all on users, oauth_accounts, auth_sessions from pjsktools_app_user;
grant select, insert, update, delete on favorites, favorite_folders, favorite_folder_items, scores, user_player_bindings,
  user_card_inventory, user_deck_configs, user_player_data to pjsktools_app_user;
do $$
declare table_name text;
begin
  foreach table_name in array array[
    'favorites','favorite_folders','scores',
    'user_player_bindings','user_card_inventory','user_deck_configs','user_player_data'
  ] loop
    execute format('drop policy if exists %I on %I', table_name || '_owner', table_name);
    execute format(
      'create policy %I on %I for all to pjsktools_app_user using (%I::text = nullif(current_setting(''pjsktools.user_id'', true), '''')) with check (%I::text = nullif(current_setting(''pjsktools.user_id'', true), ''''))',
      table_name || '_owner', table_name,
      case when table_name = 'users' then 'id' else 'user_id' end,
      case when table_name = 'users' then 'id' else 'user_id' end
    );
  end loop;
end $$;

drop policy if exists users_owner on users;
drop policy if exists oauth_accounts_owner on oauth_accounts;
drop policy if exists auth_sessions_owner on auth_sessions;

drop policy if exists favorite_folder_items_owner on favorite_folder_items;
create policy favorite_folder_items_owner on favorite_folder_items for all to pjsktools_app_user
 using (
   exists (select 1 from favorite_folders f where f.id=folder_id and f.user_id::text=nullif(current_setting('pjsktools.user_id',true),''))
   and exists (select 1 from favorites f where f.id=favorite_id and f.user_id::text=nullif(current_setting('pjsktools.user_id',true),''))
 )
 with check (
   exists (select 1 from favorite_folders f where f.id=folder_id and f.user_id::text=nullif(current_setting('pjsktools.user_id',true),''))
   and exists (select 1 from favorites f where f.id=favorite_id and f.user_id::text=nullif(current_setting('pjsktools.user_id',true),''))
 );

grant select on scores to pjsktools_ranking_service;
grant select, insert, update on ranking_history_samples to pjsktools_ranking_service;
drop policy if exists score_share_read on scores;
create policy score_share_read on scores for select to pjsktools_ranking_service using (true);
drop policy if exists ranking_service_read on ranking_history_samples;
create policy ranking_service_read on ranking_history_samples for select to pjsktools_ranking_service using (true);
drop policy if exists ranking_service_insert on ranking_history_samples;
create policy ranking_service_insert on ranking_history_samples for insert to pjsktools_ranking_service with check (true);
drop policy if exists ranking_service_update on ranking_history_samples;
create policy ranking_service_update on ranking_history_samples for update to pjsktools_ranking_service using (true) with check (true);

-- Retention rollup runs under the compliance maintenance login, so that role
-- also receives the minimum raw-sample DELETE privilege already constrained by
-- migration 016's fourteen-day policies.

grant select, insert, update, delete on api_idempotency_records to pjsktools_idempotency_service;
drop policy if exists idempotency_scope_service on api_idempotency_records;
create policy idempotency_scope_service on api_idempotency_records for all to pjsktools_idempotency_service
 using (scope = nullif(current_setting('pjsktools.idempotency_scope',true),''))
 with check (scope = nullif(current_setting('pjsktools.idempotency_scope',true),''));

-- Haruki remains disabled at deployment time, but its NOLOGIN capability
-- roles are pre-created so migrations remain deterministic and fail closed.
do $$
declare role_name text;
begin
 foreach role_name in array array['pjsktools_haruki_user','pjsktools_haruki_worker'] loop
  if not exists(select 1 from pg_roles where rolname=role_name) then
   raise exception 'required database role is missing: %',role_name
    using errcode='42501';
  end if;
  if exists (
   select 1 from pg_roles where rolname=role_name and (
    rolcanlogin or rolsuper or rolcreatedb or rolcreaterole or rolinherit
    or rolreplication or rolbypassrls
   )
  ) then
   raise exception 'refusing unsafe database role attributes: %',role_name
    using errcode='42501';
  end if;
 end loop;
end $$;
grant usage on schema public to pjsktools_haruki_user,pjsktools_haruki_worker;
grant select,insert,update,delete on haruki_connections,haruki_oauth_states,
 haruki_oauth_handoffs,player_sync_reviews to pjsktools_haruki_user;
grant select,insert,update,delete on haruki_connections,haruki_oauth_states,
 haruki_oauth_handoffs,player_sync_reviews,haruki_webhook_events,haruki_rate_limits,
 haruki_revoke_audits,user_player_bindings,user_card_inventory,user_player_data
 to pjsktools_haruki_worker;

-- Migration 013 used a caller-controlled GUC as a worker capability. Remove
-- every legacy policy before installing role-based policies below.
drop policy if exists haruki_connections_owner on haruki_connections;
drop policy if exists haruki_webhook_events_worker on haruki_webhook_events;
drop policy if exists haruki_revoke_audits_owner_worker on haruki_revoke_audits;
drop policy if exists haruki_oauth_states_owner on haruki_oauth_states;
drop policy if exists haruki_oauth_handoffs_owner on haruki_oauth_handoffs;
drop policy if exists player_sync_reviews_owner on player_sync_reviews;
drop policy if exists user_player_bindings_owner on user_player_bindings;
drop policy if exists user_card_inventory_owner on user_card_inventory;
drop policy if exists user_player_data_owner on user_player_data;

do $$ declare table_name text;
begin
 foreach table_name in array array['haruki_connections','haruki_oauth_states','haruki_oauth_handoffs','player_sync_reviews'] loop
  execute format('drop policy if exists %I on %I',table_name||'_dedicated_user',table_name);
  execute format('create policy %I on %I for all to pjsktools_haruki_user using (user_id::text=nullif(current_setting(''pjsktools.user_id'',true),'''')) with check (user_id::text=nullif(current_setting(''pjsktools.user_id'',true),''''))',table_name||'_dedicated_user',table_name);
 end loop;
 foreach table_name in array array['haruki_connections','haruki_oauth_states','haruki_oauth_handoffs','player_sync_reviews','haruki_webhook_events','haruki_rate_limits','haruki_revoke_audits'] loop
  execute format('drop policy if exists %I on %I',table_name||'_dedicated_worker',table_name);
  execute format('create policy %I on %I for all to pjsktools_haruki_worker using (true) with check (true)',table_name||'_dedicated_worker',table_name);
 end loop;
end $$;

drop policy if exists user_player_bindings_haruki_user on user_player_bindings;
create policy user_player_bindings_haruki_user on user_player_bindings for all to pjsktools_haruki_user
 using (user_id::text=nullif(current_setting('pjsktools.user_id',true),''))
 with check (user_id::text=nullif(current_setting('pjsktools.user_id',true),''));
drop policy if exists user_card_inventory_haruki_user on user_card_inventory;
create policy user_card_inventory_haruki_user on user_card_inventory for all to pjsktools_haruki_user
 using (user_id::text=nullif(current_setting('pjsktools.user_id',true),''))
 with check (user_id::text=nullif(current_setting('pjsktools.user_id',true),''));
drop policy if exists user_player_data_haruki_user on user_player_data;
create policy user_player_data_haruki_user on user_player_data for all to pjsktools_haruki_user
 using (user_id::text=nullif(current_setting('pjsktools.user_id',true),''))
 with check (user_id::text=nullif(current_setting('pjsktools.user_id',true),''));

drop policy if exists user_player_bindings_haruki_worker on user_player_bindings;
create policy user_player_bindings_haruki_worker on user_player_bindings for all to pjsktools_haruki_worker
 using (true) with check (true);
drop policy if exists user_card_inventory_haruki_worker on user_card_inventory;
create policy user_card_inventory_haruki_worker on user_card_inventory for all to pjsktools_haruki_worker
 using (true) with check (true);
drop policy if exists user_player_data_haruki_worker on user_player_data;
create policy user_player_data_haruki_worker on user_player_data for all to pjsktools_haruki_worker
 using (true) with check (true);

-- Hand DDL custody to the fixed NOLOGIN owner only after all grants and RLS
-- policies are complete; the deployment LOGIN inherits only fixed DDL roles.
do $$
declare table_name text;
begin
  foreach table_name in array array[
    'users','oauth_accounts','auth_sessions','auth_states','email_verification_codes',
    'email_verification_cooldowns','oauth_handoffs','favorites','favorite_folders',
    'favorite_folder_items','scores','user_player_bindings','user_card_inventory',
    'user_deck_configs','user_player_data','ranking_history_samples','api_idempotency_records'
  ] loop
    execute format('alter table %I owner to pjsktools_compliance_owner', table_name);
  end loop;
end $$;

-- ALTER OWNER can replace owner-derived ACL state. Reassert only the narrow
-- privileges used by the account-deletion SECURITY DEFINER functions.
grant select, delete on users to pjsktools_account_deletion_executor;
grant update (id) on users to pjsktools_account_deletion_executor;
grant select (scope), delete on api_idempotency_records to pjsktools_account_deletion_executor;
grant insert on account_deletion_tombstones to pjsktools_account_deletion_executor;
grant select (user_hash) on account_deletion_tombstones to pjsktools_account_deletion_executor;
revoke create on schema public from pjsktools_compliance_owner;
