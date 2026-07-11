create table if not exists email_verification_codes (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  purpose text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  attempts integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists user_player_bindings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  region text not null,
  player_uid text not null,
  display_name text,
  is_default boolean not null default false,
  note text,
  public_profile_snapshot jsonb,
  refreshed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, region, player_uid)
);

create table if not exists user_card_inventory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  binding_id uuid references user_player_bindings(id) on delete cascade,
  region text not null,
  card_id text not null,
  level integer,
  master_rank integer,
  skill_level integer,
  special_training_status text,
  default_image text,
  episodes_read boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists user_deck_configs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  binding_id uuid references user_player_bindings(id) on delete set null,
  region text not null,
  name text not null,
  event_id text,
  leader_card_id text,
  card_ids text[] not null default '{}',
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_email_verification_codes_email on email_verification_codes(email, purpose, created_at desc);
create index if not exists idx_email_verification_codes_expires_at on email_verification_codes(expires_at);
create index if not exists idx_user_player_bindings_user_id on user_player_bindings(user_id);
create unique index if not exists idx_user_card_inventory_unique on user_card_inventory(user_id, region, card_id, coalesce(binding_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index if not exists idx_user_card_inventory_user_id on user_card_inventory(user_id, binding_id);
create index if not exists idx_user_deck_configs_user_id on user_deck_configs(user_id);
