create extension if not exists pgcrypto;

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  password_hash text,
  nickname text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists oauth_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  provider text not null,
  provider_user_id text not null,
  nickname text,
  avatar_url text,
  access_token_encrypted text,
  refresh_token_encrypted text,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_user_id)
);

create table if not exists auth_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  refresh_token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists auth_states (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  state text not null,
  redirect_to text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (provider, state)
);

create table if not exists favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  type text not null,
  region text not null,
  target_id text not null,
  label text not null,
  created_at timestamptz not null default now()
);

create table if not exists scores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  region text not null,
  song_id text not null,
  difficulty text not null,
  clear_status text not null,
  score integer not null,
  target_score integer,
  note text,
  updated_at timestamptz not null default now()
);

create index if not exists idx_oauth_accounts_user_id on oauth_accounts(user_id);
create index if not exists idx_auth_sessions_user_id on auth_sessions(user_id);
create index if not exists idx_auth_states_expires_at on auth_states(expires_at);
create index if not exists idx_favorites_user_id on favorites(user_id);
create index if not exists idx_scores_user_id on scores(user_id);
