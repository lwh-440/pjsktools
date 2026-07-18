create table if not exists oauth_handoffs (
  id uuid primary key default gen_random_uuid(),
  handoff_hash text not null unique,
  provider text not null,
  kind text not null check (kind in ('login', 'link')),
  user_id uuid not null references users(id) on delete cascade,
  oauth_payload jsonb not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_oauth_handoffs_expires_at on oauth_handoffs(expires_at);

alter table oauth_handoffs enable row level security;
