create table if not exists user_player_data (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  binding_id uuid not null references user_player_bindings(id) on delete cascade,
  region text not null,
  kind text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, binding_id, kind)
);

create index if not exists idx_user_player_data_user_binding on user_player_data(user_id, binding_id);
create index if not exists idx_user_player_data_kind on user_player_data(kind);
