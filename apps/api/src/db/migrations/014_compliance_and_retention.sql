alter table auth_states
  add column if not exists privacy_version text,
  add column if not exists terms_version text,
  add column if not exists age_confirmed boolean not null default false;

-- QQ tokens are only needed transiently to fetch OpenID/profile during the callback.
-- Retain the stable OpenID and public profile, but purge legacy unnecessary tokens.
update oauth_accounts
set access_token_encrypted = null,
    refresh_token_encrypted = null,
    expires_at = null
where provider = 'qq';

alter table email_verification_codes drop constraint if exists chk_email_verification_codes_purpose;
alter table email_verification_codes
  add constraint chk_email_verification_codes_purpose check (purpose in ('register', 'delete-account'));

create table if not exists legal_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  privacy_version text not null,
  terms_version text not null,
  age_confirmed boolean not null,
  source text not null,
  accepted_at timestamptz not null default now(),
  constraint chk_legal_acceptance_age check (age_confirmed),
  constraint chk_legal_acceptance_source check (source in ('web', 'android', 'qq')),
  constraint uq_legal_acceptance_version unique (user_id, privacy_version, terms_version)
);
create index if not exists idx_legal_acceptances_user_time on legal_acceptances(user_id, accepted_at desc);

create table if not exists account_deletion_intents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_account_deletion_intents_cleanup on account_deletion_intents(expires_at, consumed_at);

create table if not exists account_deletion_tombstones (
  id uuid primary key default gen_random_uuid(),
  user_hash text not null unique,
  email_hash text,
  deleted_at timestamptz not null default now()
);
create index if not exists idx_account_deletion_tombstones_deleted_at on account_deletion_tombstones(deleted_at);

create table if not exists ranking_history_minute_rollups (
  region text not null,
  event_id text not null,
  sample_type text not null,
  rank integer not null,
  minute_at timestamptz not null,
  score_min bigint not null,
  score_max bigint not null,
  score_avg bigint not null,
  sample_count integer not null,
  created_at timestamptz not null default now(),
  primary key (region, event_id, sample_type, rank, minute_at),
  constraint chk_ranking_minute_region check (region in ('jp', 'en', 'tw', 'kr', 'cn')),
  constraint chk_ranking_minute_type check (sample_type in ('border', 'top100'))
);

alter table legal_acceptances enable row level security;
alter table account_deletion_intents enable row level security;
alter table account_deletion_tombstones enable row level security;
alter table ranking_history_minute_rollups enable row level security;

create index if not exists idx_ranking_history_minute_lookup
  on ranking_history_minute_rollups(region, event_id, sample_type, rank, minute_at desc);
