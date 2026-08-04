-- Authentication roles are created at the pre-migration boundary. This file
-- only validates and consumes them.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'pjsktools_auth_api') then
    raise exception 'required database role is missing: pjsktools_auth_api'
      using errcode='42501';
  end if;
  if exists (
    select 1 from pg_roles where rolname='pjsktools_auth_api' and (
      rolcanlogin or rolsuper or rolcreatedb or rolcreaterole or rolinherit
      or rolreplication or rolbypassrls
    )
  ) then
    raise exception 'refusing unsafe database role attributes: pjsktools_auth_api'
      using errcode='42501';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'pjsktools_auth_executor') then
    raise exception 'required database role is missing: pjsktools_auth_executor'
      using errcode='42501';
  end if;
  if exists (
    select 1 from pg_roles where rolname='pjsktools_auth_executor' and (
      rolcanlogin or rolsuper or rolcreatedb or rolcreaterole or rolinherit
      or rolreplication or rolbypassrls
    )
  ) then
    raise exception 'refusing unsafe database role attributes: pjsktools_auth_executor'
      using errcode='42501';
  end if;
end $$;

do $$
begin
  if not pg_has_role(current_user, 'pjsktools_auth_executor', 'MEMBER') then
    raise exception 'migration role lacks pjsktools_auth_executor membership'
      using errcode='42501';
  end if;
end $$;

grant usage on schema public to pjsktools_auth_api,pjsktools_auth_executor;
grant create on schema public to pjsktools_auth_executor;
grant execute on function public.gen_random_uuid() to pjsktools_auth_executor;
do $$ begin
  if exists(select 1 from pg_roles where rolname='pjsktools_app_anonymous') then
    revoke all on public.users, public.oauth_accounts, public.auth_sessions,
      public.auth_states, public.email_verification_codes,
      public.email_verification_cooldowns, public.oauth_handoffs
      from pjsktools_app_anonymous;
  end if;
end $$;

drop policy if exists users_anonymous on public.users;
drop policy if exists oauth_accounts_anonymous on public.oauth_accounts;
drop policy if exists auth_sessions_anonymous on public.auth_sessions;
drop policy if exists auth_states_anonymous on public.auth_states;
drop policy if exists email_codes_anonymous on public.email_verification_codes;
drop policy if exists email_cooldowns_anonymous on public.email_verification_cooldowns;
drop policy if exists oauth_handoffs_anonymous on public.oauth_handoffs;

grant select, insert, update on public.users, public.oauth_accounts,
  public.auth_sessions, public.auth_states, public.email_verification_codes,
  public.email_verification_cooldowns, public.oauth_handoffs
  to pjsktools_auth_executor;
grant delete on public.auth_sessions, public.auth_states,
  public.email_verification_codes,public.email_verification_cooldowns, public.oauth_handoffs
  to pjsktools_auth_executor;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'users','oauth_accounts','auth_sessions','auth_states',
    'email_verification_codes','email_verification_cooldowns','oauth_handoffs'
  ] loop
    execute format('drop policy if exists %I on public.%I', table_name || '_auth_executor', table_name);
    execute format(
      'create policy %I on public.%I for all to pjsktools_auth_executor using (true) with check (true)',
      table_name || '_auth_executor', table_name
    );
  end loop;
end $$;

create or replace function public.pjsktools_auth_create_user(
  input_email text, input_password_hash text, input_nickname text, input_avatar_url text
) returns table(id uuid, email text, has_password boolean, nickname text, avatar_url text, created_at timestamptz, updated_at timestamptz)
language plpgsql security definer
set search_path = pg_catalog
set row_security = on
as $fn$
begin
  if input_email is null or position('@' in input_email)=0 or input_password_hash is null then raise exception 'invalid user input'; end if;
  return query insert into public.users(email,password_hash,nickname,avatar_url)
    values(lower(trim(input_email)),input_password_hash,input_nickname,input_avatar_url)
    returning users.id,users.email,true,users.nickname,users.avatar_url,users.created_at,users.updated_at;
end
$fn$;

create or replace function public.pjsktools_auth_create_oauth_user(
  input_user_id uuid, input_provider text, input_provider_user_id text,
  input_nickname text, input_avatar_url text, input_access_token_encrypted text,
  input_refresh_token_encrypted text, input_expires_at timestamptz
) returns table(id uuid, email text, has_password boolean, nickname text, avatar_url text, created_at timestamptz, updated_at timestamptz)
language plpgsql security definer
set search_path = pg_catalog
set row_security = on
as $fn$
begin
  if input_provider <> 'qq' then raise exception 'unsupported oauth provider'; end if;
  begin
    insert into public.users(id,nickname,avatar_url)
    values(input_user_id,input_nickname,input_avatar_url);
    insert into public.oauth_accounts(
      user_id,provider,provider_user_id,nickname,avatar_url,
      access_token_encrypted,refresh_token_encrypted,expires_at
    ) values(
      input_user_id,input_provider,input_provider_user_id,input_nickname,input_avatar_url,
      input_access_token_encrypted,input_refresh_token_encrypted,input_expires_at
    );
  exception when unique_violation then
    return query select u.id,u.email,u.password_hash is not null,u.nickname,u.avatar_url,u.created_at,u.updated_at
      from public.oauth_accounts o join public.users u on u.id=o.user_id
      where o.provider=input_provider and o.provider_user_id=input_provider_user_id;
    if found then return; end if;
    raise;
  end;
  return query select u.id,u.email,u.password_hash is not null,u.nickname,u.avatar_url,u.created_at,u.updated_at
    from public.users u where u.id=input_user_id;
end
$fn$;

create or replace function public.pjsktools_auth_create_email_code(
  input_email text, input_purpose text, input_code_hash text, input_expires_at timestamptz
) returns table(id uuid, email text, purpose text, expires_at timestamptz, consumed_at timestamptz, attempts integer, created_at timestamptz)
language plpgsql security definer
set search_path = pg_catalog
set row_security = on
as $fn$
begin
  if input_purpose not in ('register','delete-account') or input_expires_at<=pg_catalog.clock_timestamp() then raise exception 'invalid email code input'; end if;
  return query insert into public.email_verification_codes(email,purpose,code_hash,expires_at)
    values(lower(trim(input_email)),input_purpose,input_code_hash,input_expires_at)
    returning email_verification_codes.id,email_verification_codes.email,email_verification_codes.purpose,
      email_verification_codes.expires_at,email_verification_codes.consumed_at,
      email_verification_codes.attempts,email_verification_codes.created_at;
end
$fn$;

create or replace function public.pjsktools_auth_latest_email_code(input_email text, input_purpose text)
returns table(id uuid, email text, purpose text, expires_at timestamptz, consumed_at timestamptz, attempts integer, created_at timestamptz)
language sql security definer
set search_path = pg_catalog
set row_security = on
as $fn$
  select c.id,c.email,c.purpose,c.expires_at,c.consumed_at,c.attempts,c.created_at
  from public.email_verification_codes c
  where c.email=lower(trim(input_email)) and c.purpose=input_purpose
  order by c.created_at desc limit 1
$fn$;

create or replace function public.pjsktools_auth_reserve_email_cooldown(
  input_email text, input_purpose text, input_reservation_id uuid, input_cooldown_seconds integer
) returns integer
language plpgsql security definer
set search_path = pg_catalog
set row_security = on
as $fn$
declare normalized_email text:=lower(trim(input_email)); blocked_until timestamptz;
begin
  if input_purpose not in ('register','delete-account') or input_cooldown_seconds<1 or input_cooldown_seconds>3600 then raise exception 'invalid cooldown input'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(normalized_email||':'||input_purpose,0));
  select greatest(
    coalesce(max(c.created_at)+(input_cooldown_seconds*interval '1 second'),'-infinity'::timestamptz),
    coalesce((select d.expires_at from public.email_verification_cooldowns d where d.email=normalized_email and d.purpose=input_purpose),'-infinity'::timestamptz)
  ) into blocked_until from public.email_verification_codes c
  where c.email=normalized_email and c.purpose=input_purpose;
  if blocked_until>pg_catalog.clock_timestamp() then
    return greatest(1,ceil(extract(epoch from (blocked_until-pg_catalog.clock_timestamp())))::integer);
  end if;
  insert into public.email_verification_cooldowns(email,purpose,reservation_id,expires_at)
  values(normalized_email,input_purpose,input_reservation_id,pg_catalog.clock_timestamp()+(input_cooldown_seconds*interval '1 second'))
  on conflict(email,purpose) do update set reservation_id=excluded.reservation_id,expires_at=excluded.expires_at;
  return 0;
end
$fn$;

create or replace function public.pjsktools_auth_release_email_cooldown(
  input_email text, input_purpose text, input_reservation_id uuid
) returns void
language sql security definer
set search_path = pg_catalog
set row_security = on
as $fn$
  delete from public.email_verification_cooldowns
  where email=lower(trim(input_email)) and purpose=input_purpose and reservation_id=input_reservation_id
$fn$;

create or replace function public.pjsktools_auth_lock_email_code(
  input_email text, input_purpose text
) returns table(id uuid,code_hash text)
language sql security definer
set search_path = pg_catalog
set row_security = on
as $fn$
  select c.id,c.code_hash from public.email_verification_codes c
  where c.email=lower(trim(input_email)) and c.purpose=input_purpose
    and c.consumed_at is null and c.expires_at>pg_catalog.clock_timestamp() and c.attempts<5
  order by c.created_at desc limit 1 for update
$fn$;

create or replace function public.pjsktools_auth_finish_email_code(
  input_id uuid,input_email text,input_purpose text,input_success boolean
)
returns boolean
language sql security definer
set search_path = pg_catalog
set row_security = on
as $fn$
  with changed as (
    update public.email_verification_codes
    set attempts=attempts+1,consumed_at=case when input_success then pg_catalog.clock_timestamp() else consumed_at end
    where id=input_id and email=lower(trim(input_email)) and purpose=input_purpose
      and consumed_at is null and expires_at>pg_catalog.clock_timestamp()
      and attempts<5 returning input_success as consumed
  ) select coalesce((select consumed from changed),false)
$fn$;

create or replace function public.pjsktools_auth_get_password(input_email text)
returns table(id uuid, email text, password_hash text, nickname text, avatar_url text, created_at timestamptz, updated_at timestamptz)
language sql security definer
set search_path = pg_catalog
set row_security = on
as $fn$
  select u.id,u.email,u.password_hash,u.nickname,u.avatar_url,u.created_at,u.updated_at from public.users u
  where u.email=lower(trim(input_email)) and u.password_hash is not null
$fn$;

create or replace function public.pjsktools_auth_get_user(input_user_id uuid)
returns table(id uuid,email text,has_password boolean,nickname text,avatar_url text,created_at timestamptz,updated_at timestamptz)
language sql security definer
set search_path = pg_catalog
set row_security = on
as $fn$
  select u.id,u.email,u.password_hash is not null,u.nickname,u.avatar_url,u.created_at,u.updated_at
  from public.users u where u.id=input_user_id
$fn$;

create or replace function public.pjsktools_auth_find_oauth(input_provider text, input_provider_user_id text)
returns table(id uuid,user_id uuid,provider text,provider_user_id text,nickname text,avatar_url text,expires_at timestamptz,created_at timestamptz,updated_at timestamptz)
language sql security definer
set search_path = pg_catalog
set row_security = on
as $fn$
  select o.id,o.user_id,o.provider,o.provider_user_id,o.nickname,o.avatar_url,o.expires_at,o.created_at,o.updated_at
  from public.oauth_accounts o where o.provider=input_provider and o.provider_user_id=input_provider_user_id
$fn$;

create or replace function public.pjsktools_auth_link_oauth(
  input_user_id uuid,input_provider text,input_provider_user_id text,input_nickname text,
  input_avatar_url text,input_access_token_encrypted text,input_refresh_token_encrypted text,input_expires_at timestamptz
) returns table(id uuid,user_id uuid,provider text,provider_user_id text,nickname text,avatar_url text,expires_at timestamptz,created_at timestamptz,updated_at timestamptz)
language plpgsql security definer
set search_path = pg_catalog
set row_security = on
as $fn$
begin
  if input_provider<>'qq' then raise exception 'unsupported oauth provider'; end if;
  return query
    with linked as (
      insert into public.oauth_accounts(user_id,provider,provider_user_id,nickname,avatar_url,access_token_encrypted,refresh_token_encrypted,expires_at)
      values(input_user_id,input_provider,input_provider_user_id,input_nickname,input_avatar_url,input_access_token_encrypted,input_refresh_token_encrypted,input_expires_at)
      on conflict(provider,provider_user_id) do update set nickname=excluded.nickname,avatar_url=excluded.avatar_url,
        access_token_encrypted=excluded.access_token_encrypted,refresh_token_encrypted=excluded.refresh_token_encrypted,
        expires_at=excluded.expires_at,updated_at=pg_catalog.clock_timestamp()
      where oauth_accounts.user_id=excluded.user_id
      returning oauth_accounts.id,oauth_accounts.user_id,oauth_accounts.provider,oauth_accounts.provider_user_id,
        oauth_accounts.nickname,oauth_accounts.avatar_url,oauth_accounts.expires_at,oauth_accounts.created_at,oauth_accounts.updated_at
    ), profile as (
      update public.users set nickname=coalesce(users.nickname,input_nickname),avatar_url=coalesce(users.avatar_url,input_avatar_url),updated_at=pg_catalog.clock_timestamp()
      where users.id=input_user_id and exists(select 1 from linked) returning users.id
    ) select linked.* from linked;
end
$fn$;

create or replace function public.pjsktools_auth_list_oauth(input_user_id uuid)
returns table(id uuid,user_id uuid,provider text,provider_user_id text,nickname text,avatar_url text,expires_at timestamptz,created_at timestamptz,updated_at timestamptz)
language sql security definer
set search_path = pg_catalog
set row_security = on
as $fn$
  select o.id,o.user_id,o.provider,o.provider_user_id,o.nickname,o.avatar_url,o.expires_at,o.created_at,o.updated_at
  from public.oauth_accounts o where o.user_id=input_user_id order by o.created_at
$fn$;

create or replace function public.pjsktools_auth_unlink_oauth(input_user_id uuid,input_provider text)
returns boolean
language plpgsql security definer
set search_path = pg_catalog
set row_security = on
as $fn$
declare password_present boolean; account_count integer; deleted boolean;
begin
  select u.password_hash is not null into password_present from public.users u where u.id=input_user_id for update;
  if not found then return false; end if;
  select count(*) into account_count from public.oauth_accounts o where o.user_id=input_user_id;
  if not password_present and account_count<=1 then raise exception 'LAST_LOGIN_METHOD'; end if;
  delete from public.oauth_accounts o where o.user_id=input_user_id and o.provider=input_provider;
  get diagnostics account_count=row_count;
  return account_count>0;
end
$fn$;

create or replace function public.pjsktools_auth_get_session(input_refresh_token_hash text)
returns table(id uuid,user_id uuid,expires_at timestamptz,revoked_at timestamptz,created_at timestamptz)
language sql security definer
set search_path = pg_catalog
set row_security = on
as $fn$
  select s.id,s.user_id,s.expires_at,s.revoked_at,s.created_at
  from public.auth_sessions s where s.refresh_token_hash=input_refresh_token_hash
    and s.revoked_at is null and s.expires_at>pg_catalog.clock_timestamp()
$fn$;

create or replace function public.pjsktools_auth_create_session(
  input_user_id uuid,input_refresh_token_hash text,input_expires_at timestamptz
) returns table(id uuid,user_id uuid,expires_at timestamptz,revoked_at timestamptz,created_at timestamptz)
language sql security definer
set search_path = pg_catalog
set row_security = on
as $fn$
  insert into public.auth_sessions(user_id,refresh_token_hash,expires_at)
  values(input_user_id,input_refresh_token_hash,input_expires_at)
  returning auth_sessions.id,auth_sessions.user_id,auth_sessions.expires_at,
    auth_sessions.revoked_at,auth_sessions.created_at
$fn$;

create or replace function public.pjsktools_auth_revoke_session(input_session_id uuid)
returns boolean
language sql security definer
set search_path = pg_catalog
set row_security = on
as $fn$
  with changed as (
    update public.auth_sessions set revoked_at=pg_catalog.clock_timestamp()
    where id=input_session_id and revoked_at is null returning 1
  ) select exists(select 1 from changed)
$fn$;

create or replace function public.pjsktools_auth_cleanup_expired()
returns void
language plpgsql security definer
set search_path = pg_catalog
set row_security = on
as $fn$
begin
  delete from public.email_verification_codes where expires_at<pg_catalog.clock_timestamp()-interval '24 hours';
  delete from public.email_verification_cooldowns where expires_at<=pg_catalog.clock_timestamp();
  delete from public.auth_states where expires_at<=pg_catalog.clock_timestamp();
  delete from public.oauth_handoffs where expires_at<=pg_catalog.clock_timestamp();
  delete from public.auth_sessions where expires_at<=pg_catalog.clock_timestamp()
    or revoked_at<pg_catalog.clock_timestamp()-interval '24 hours';
end
$fn$;

create or replace function public.pjsktools_auth_create_state(
  input_provider text,input_state text,input_redirect_to text,input_expires_at timestamptz,
  input_privacy_version text,input_terms_version text,input_age_confirmed boolean
) returns table(id uuid,provider text,state text,redirect_to text,privacy_version text,terms_version text,age_confirmed boolean,expires_at timestamptz,created_at timestamptz)
language sql security definer
set search_path = pg_catalog
set row_security = on
as $fn$
  insert into public.auth_states(provider,state,redirect_to,expires_at,privacy_version,terms_version,age_confirmed)
  select input_provider,input_state,input_redirect_to,input_expires_at,input_privacy_version,input_terms_version,input_age_confirmed
  where input_provider='qq' and input_expires_at>pg_catalog.clock_timestamp()
  returning auth_states.id,auth_states.provider,auth_states.state,auth_states.redirect_to,
    auth_states.privacy_version,auth_states.terms_version,auth_states.age_confirmed,
    auth_states.expires_at,auth_states.created_at
$fn$;

create or replace function public.pjsktools_auth_consume_state(input_provider text,input_state text)
returns table(id uuid,provider text,state text,redirect_to text,privacy_version text,terms_version text,age_confirmed boolean,expires_at timestamptz,created_at timestamptz)
language sql security definer
set search_path = pg_catalog
set row_security = on
as $fn$
  delete from public.auth_states where id in (
    select s.id from public.auth_states s where s.provider=input_provider and s.state=input_state
      and s.expires_at>pg_catalog.clock_timestamp() limit 1 for update
  ) returning auth_states.id,auth_states.provider,auth_states.state,auth_states.redirect_to,
    auth_states.privacy_version,auth_states.terms_version,auth_states.age_confirmed,
    auth_states.expires_at,auth_states.created_at
$fn$;

create or replace function public.pjsktools_auth_create_handoff(
  input_handoff_hash text,input_provider text,input_kind text,input_user_id uuid,
  input_oauth_payload jsonb,input_expires_at timestamptz
) returns void
language sql security definer
set search_path = pg_catalog
set row_security = on
as $fn$
  insert into public.oauth_handoffs(handoff_hash,provider,kind,user_id,oauth_payload,expires_at)
  select input_handoff_hash,input_provider,input_kind,input_user_id,input_oauth_payload,input_expires_at
  where input_provider='qq' and input_kind in ('login','link','delete')
    and input_expires_at>pg_catalog.clock_timestamp()
$fn$;

create or replace function public.pjsktools_auth_consume_handoff(
  input_handoff_hash text,input_kind text,input_user_id uuid
) returns table(kind text,user_id uuid,oauth_payload jsonb)
language sql security definer
set search_path = pg_catalog
set row_security = on
as $fn$
  delete from public.oauth_handoffs where id in (
    select h.id from public.oauth_handoffs h where h.handoff_hash=input_handoff_hash
      and h.kind=input_kind and (input_user_id is null or h.user_id=input_user_id)
      and h.expires_at>pg_catalog.clock_timestamp() limit 1 for update
  ) returning oauth_handoffs.kind,oauth_handoffs.user_id,oauth_handoffs.oauth_payload
$fn$;

do $$
declare function_signature text;
begin
  foreach function_signature in array array[
    'public.pjsktools_auth_create_user(text,text,text,text)',
    'public.pjsktools_auth_create_oauth_user(uuid,text,text,text,text,text,text,timestamptz)',
    'public.pjsktools_auth_create_email_code(text,text,text,timestamptz)',
    'public.pjsktools_auth_latest_email_code(text,text)',
    'public.pjsktools_auth_reserve_email_cooldown(text,text,uuid,integer)',
    'public.pjsktools_auth_release_email_cooldown(text,text,uuid)',
    'public.pjsktools_auth_lock_email_code(text,text)',
    'public.pjsktools_auth_finish_email_code(uuid,text,text,boolean)',
    'public.pjsktools_auth_get_password(text)',
    'public.pjsktools_auth_get_user(uuid)',
    'public.pjsktools_auth_find_oauth(text,text)',
    'public.pjsktools_auth_link_oauth(uuid,text,text,text,text,text,text,timestamptz)',
    'public.pjsktools_auth_list_oauth(uuid)',
    'public.pjsktools_auth_unlink_oauth(uuid,text)',
    'public.pjsktools_auth_get_session(text)',
    'public.pjsktools_auth_create_session(uuid,text,timestamptz)',
    'public.pjsktools_auth_revoke_session(uuid)',
    'public.pjsktools_auth_cleanup_expired()',
    'public.pjsktools_auth_create_state(text,text,text,timestamptz,text,text,boolean)',
    'public.pjsktools_auth_consume_state(text,text)',
    'public.pjsktools_auth_create_handoff(text,text,text,uuid,jsonb,timestamptz)',
    'public.pjsktools_auth_consume_handoff(text,text,uuid)'
  ] loop
    execute format('alter function %s owner to pjsktools_auth_executor',function_signature);
    execute format('revoke all on function %s from public',function_signature);
    execute format('grant execute on function %s to pjsktools_auth_api',function_signature);
  end loop;
end $$;
revoke create on schema public from pjsktools_auth_executor;
