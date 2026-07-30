create table if not exists haruki_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references users(id) on delete cascade,
  subject text not null unique,
  scope text[] not null default '{}',
  access_token_encrypted text not null,
  refresh_token_encrypted text,
  token_expires_at timestamptz,
  encryption_key_version text not null,
  status text not null default 'active' check (status in ('active', 'reauthorize')),
  refresh_lease_id text,
  refresh_lease_expires_at timestamptz,
  available_bindings jsonb not null default '[]'::jsonb,
  last_webhook_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists haruki_oauth_states (
  state_hash text primary key,
  user_id uuid not null references users(id) on delete cascade,
  client text not null check (client in ('web', 'android')),
  redirect_uri text,
  code_verifier_encrypted text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists haruki_oauth_handoffs (
  handoff_hash text primary key,
  user_id uuid not null references users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists player_sync_reviews (
  token_hash text primary key,
  user_id uuid not null references users(id) on delete cascade,
  binding_id uuid not null references user_player_bindings(id) on delete cascade,
  candidate_hash text not null,
  upstream_version text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists haruki_rate_limits (
  bucket_hash text primary key,
  count integer not null check (count > 0),
  expires_at timestamptz not null
);

create table if not exists haruki_webhook_events (
  event_id_hash text primary key,
  subject text,
  binding_key text,
  data_type text not null default 'suite' check (data_type in ('suite','mysekai')),
  region text not null,
  player_uid text not null,
  upload_time timestamptz,
  payload_hash text not null,
  status text not null default 'pending' check (status in ('pending','processing','processed','ignored','failed')),
  received_at timestamptz not null default now(),
  processed_at timestamptz
);
create table if not exists haruki_revoke_audits (
  id uuid primary key default gen_random_uuid(), user_id uuid references users(id) on delete set null,
  connection_id uuid, subject_hash text not null, failed_hints text[] not null,
  status text not null check (status in ('pending','resolved')), created_at timestamptz not null default now()
);
comment on table haruki_rate_limits is
  'Internal shared rate-limit buckets. Keys are SHA-256 hashes; access is restricted to the application database role.';

alter table user_player_bindings
  add column if not exists haruki_connection_id uuid references haruki_connections(id) on delete cascade,
  add column if not exists haruki_binding_id text,
  add column if not exists haruki_binding_key text,
  add column if not exists verified boolean not null default false,
  add column if not exists source text,
  add column if not exists upstream_uploaded_at timestamptz,
  add column if not exists upstream_etag text,
  add column if not exists last_webhook_at timestamptz,
  add column if not exists upstream_update_available boolean not null default false,
  add column if not exists last_sync_attempt_at timestamptz,
  add column if not exists last_sync_succeeded_at timestamptz,
  add column if not exists last_sync_status text not null default 'never',
  add column if not exists pending_empty_groups text[] not null default '{}',
  add column if not exists auto_sync_daily boolean not null default false;

alter table user_player_bindings drop constraint if exists user_player_bindings_haruki_source_check;
alter table user_player_bindings add constraint user_player_bindings_haruki_source_check
  check (source is null or source = 'haruki-oauth');
alter table user_player_bindings drop constraint if exists user_player_bindings_sync_status_check;
alter table user_player_bindings add constraint user_player_bindings_sync_status_check
  check (last_sync_status in ('never', 'ready', 'syncing', 'success', 'no-change', 'needs-review', 'reauthorize', 'upstream-error', 'parse-error'));
alter table user_player_bindings drop constraint if exists user_player_bindings_pending_empty_groups_check;
alter table user_player_bindings add constraint user_player_bindings_pending_empty_groups_check
  check (array_position(pending_empty_groups, null) is null);

alter table user_card_inventory
  add column if not exists source text,
  add column if not exists upstream_version text,
  add column if not exists synced_at timestamptz;

alter table user_player_data
  add column if not exists source text,
  add column if not exists upstream_version text,
  add column if not exists synced_at timestamptz;

alter table haruki_connections drop constraint if exists haruki_connections_available_bindings_check;
alter table haruki_connections add constraint haruki_connections_available_bindings_check
  check (jsonb_typeof(available_bindings) = 'array');
alter table haruki_connections
  add column if not exists refresh_lease_id text,
  add column if not exists refresh_lease_expires_at timestamptz;

create table if not exists haruki_player_reset_audits (
  id uuid primary key default gen_random_uuid(),
  legacy_binding_count integer not null,
  legacy_inventory_count integer not null,
  legacy_player_data_count integer not null,
  legacy_object_key_names text[] not null default '{}',
  created_at timestamptz not null default now()
);

-- Audit legacy user-declared bindings, but never delete them implicitly. An
-- operator must explicitly clean them after reviewing the audit row.
insert into haruki_player_reset_audits
  (legacy_binding_count, legacy_inventory_count, legacy_player_data_count, legacy_object_key_names)
select
  (select count(*)::integer from user_player_bindings where haruki_connection_id is null),
  (select count(*)::integer from user_card_inventory inventory
    join user_player_bindings binding on binding.id = inventory.binding_id
    where binding.haruki_connection_id is null),
  (select count(*)::integer from user_player_data data
    join user_player_bindings binding on binding.id = data.binding_id
    where binding.haruki_connection_id is null),
  coalesce((
    select array_agg(distinct key_name order by key_name)
    from user_player_data data
    join user_player_bindings binding on binding.id = data.binding_id
    cross join lateral jsonb_object_keys(
      case when jsonb_typeof(data.data) = 'object' then data.data else '{}'::jsonb end
    ) as key_name
    where binding.haruki_connection_id is null
  ), '{}')
where exists (select 1 from user_player_bindings where haruki_connection_id is null);

do $$
begin
  if exists (select 1 from user_player_bindings where haruki_connection_id is null) then
    raise notice 'HARUKI_LEGACY_BINDINGS_REQUIRE_EXPLICIT_CLEANUP';
  end if;
end $$;

-- OAuth rows are never part of the reset. Abort instead of deleting or guessing
-- when their connection identity cannot be proven.
do $$
begin
  if exists (
    select 1 from user_player_bindings b
    left join haruki_connections c on c.id=b.haruki_connection_id
    where b.haruki_connection_id is not null and (c.id is null or c.subject='' or b.region is null or b.player_uid is null)
  ) then
    raise exception 'HARUKI_OAUTH_BINDING_IDENTITY_NOT_DERIVABLE';
  end if;
end $$;

-- Keep migrated bindings on the same subject-scoped identity used by OAuth imports.
update user_player_bindings b
set haruki_binding_key = encode(digest(c.subject || E'\\000' || b.region || E'\\000' || b.player_uid, 'sha256'), 'hex')
from haruki_connections c
where b.haruki_connection_id = c.id and b.haruki_binding_key is null;
create unique index if not exists uq_haruki_binding_owner
  on user_player_bindings(haruki_connection_id, haruki_binding_key)
  where haruki_connection_id is not null and haruki_binding_key is not null;
create unique index if not exists uq_verified_region_uid
  on user_player_bindings(region, player_uid)
  where verified;
create index if not exists idx_haruki_oauth_states_expires_at on haruki_oauth_states(expires_at);
create index if not exists idx_haruki_handoffs_expires_at on haruki_oauth_handoffs(expires_at);
create index if not exists idx_player_sync_reviews_expires_at on player_sync_reviews(expires_at);
create index if not exists idx_haruki_rate_limits_expires_at on haruki_rate_limits(expires_at);
create index if not exists idx_haruki_webhook_pending on haruki_webhook_events(status, received_at);
create index if not exists idx_player_sync_due
  on user_player_bindings(auto_sync_daily, last_sync_attempt_at)
  where auto_sync_daily and verified;

alter table haruki_connections enable row level security;
alter table haruki_webhook_events enable row level security;
alter table haruki_revoke_audits enable row level security;
alter table haruki_oauth_states enable row level security;
alter table haruki_oauth_handoffs enable row level security;
alter table player_sync_reviews enable row level security;
alter table haruki_connections force row level security;
alter table haruki_webhook_events force row level security;
alter table haruki_revoke_audits force row level security;
alter table haruki_oauth_states force row level security;
alter table haruki_oauth_handoffs force row level security;
alter table player_sync_reviews force row level security;
alter table user_player_bindings force row level security;
alter table user_card_inventory force row level security;
alter table user_player_data force row level security;

revoke all on haruki_connections, haruki_oauth_states, haruki_oauth_handoffs, player_sync_reviews,
  haruki_rate_limits, haruki_webhook_events, haruki_revoke_audits, user_player_bindings, user_card_inventory, user_player_data, haruki_player_reset_audits from public;
grant select, insert, update, delete on haruki_connections, haruki_oauth_states, haruki_oauth_handoffs,
  player_sync_reviews, haruki_rate_limits, haruki_webhook_events, user_player_bindings, user_card_inventory, user_player_data to current_user;
grant select, insert, update on haruki_revoke_audits to current_user;
grant select, insert on haruki_player_reset_audits to current_user;

drop policy if exists haruki_connections_owner on haruki_connections;
create policy haruki_connections_owner on haruki_connections
  using (
    user_id = nullif(current_setting('pjsktools.user_id', true), '')::uuid
    or current_setting('pjsktools.haruki_worker', true) = 'true'
  )
  with check (
    user_id = nullif(current_setting('pjsktools.user_id', true), '')::uuid
    or current_setting('pjsktools.haruki_worker', true) = 'true'
  );
drop policy if exists haruki_webhook_events_worker on haruki_webhook_events;
create policy haruki_webhook_events_worker on haruki_webhook_events
  using (current_setting('pjsktools.haruki_worker', true) = 'true')
  with check (current_setting('pjsktools.haruki_worker', true) = 'true');
drop policy if exists haruki_revoke_audits_owner_worker on haruki_revoke_audits;
create policy haruki_revoke_audits_owner_worker on haruki_revoke_audits
  using (user_id = nullif(current_setting('pjsktools.user_id', true), '')::uuid or current_setting('pjsktools.haruki_worker', true)='true')
  with check (user_id = nullif(current_setting('pjsktools.user_id', true), '')::uuid or current_setting('pjsktools.haruki_worker', true)='true');
drop policy if exists haruki_oauth_states_owner on haruki_oauth_states;
create policy haruki_oauth_states_owner on haruki_oauth_states
  using (
    user_id = nullif(current_setting('pjsktools.user_id', true), '')::uuid
    or current_setting('pjsktools.haruki_worker', true) = 'true'
  )
  with check (
    user_id = nullif(current_setting('pjsktools.user_id', true), '')::uuid
    or current_setting('pjsktools.haruki_worker', true) = 'true'
  );
drop policy if exists haruki_oauth_handoffs_owner on haruki_oauth_handoffs;
create policy haruki_oauth_handoffs_owner on haruki_oauth_handoffs
  using (
    user_id = nullif(current_setting('pjsktools.user_id', true), '')::uuid
    or current_setting('pjsktools.haruki_worker', true) = 'true'
  )
  with check (user_id = nullif(current_setting('pjsktools.user_id', true), '')::uuid);
drop policy if exists player_sync_reviews_owner on player_sync_reviews;
create policy player_sync_reviews_owner on player_sync_reviews
  using (
    user_id = nullif(current_setting('pjsktools.user_id', true), '')::uuid
    or current_setting('pjsktools.haruki_worker', true) = 'true'
  )
  with check (user_id = nullif(current_setting('pjsktools.user_id', true), '')::uuid);

drop policy if exists user_player_bindings_owner on user_player_bindings;
create policy user_player_bindings_owner on user_player_bindings
  using (
    user_id = nullif(current_setting('pjsktools.user_id', true), '')::uuid
    or current_setting('pjsktools.haruki_worker', true) = 'true'
  )
  with check (
    user_id = nullif(current_setting('pjsktools.user_id', true), '')::uuid
    or current_setting('pjsktools.haruki_worker', true) = 'true'
  );
drop policy if exists user_card_inventory_owner on user_card_inventory;
create policy user_card_inventory_owner on user_card_inventory
  using (user_id = nullif(current_setting('pjsktools.user_id', true), '')::uuid)
  with check (user_id = nullif(current_setting('pjsktools.user_id', true), '')::uuid);
drop policy if exists user_player_data_owner on user_player_data;
create policy user_player_data_owner on user_player_data
  using (user_id = nullif(current_setting('pjsktools.user_id', true), '')::uuid)
  with check (user_id = nullif(current_setting('pjsktools.user_id', true), '')::uuid);
