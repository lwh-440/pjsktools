alter table favorites add column if not exists updated_at timestamptz;
update favorites set updated_at = created_at where updated_at is null;
alter table favorites alter column updated_at set default now();
alter table favorites alter column updated_at set not null;

delete from favorites duplicate
using favorites canonical
where duplicate.user_id = canonical.user_id
  and duplicate.type = canonical.type
  and duplicate.region = canonical.region
  and duplicate.target_id = canonical.target_id
  and (
    duplicate.created_at > canonical.created_at
    or (duplicate.created_at = canonical.created_at and duplicate.id::text > canonical.id::text)
  );

create unique index if not exists uq_favorites_user_target
  on favorites(user_id, type, region, target_id);

alter table favorites drop constraint if exists chk_favorites_type;
alter table favorites add constraint chk_favorites_type check (
  type in ('player', 'event', 'song', 'card', 'gacha', 'honor', 'material', 'costume', 'stamp', 'comic')
);

create table if not exists favorite_folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_favorite_folder_name check (char_length(trim(name)) between 1 and 60),
  constraint chk_favorite_folder_description check (description is null or char_length(description) <= 200)
);

create unique index if not exists uq_favorite_folders_user_name
  on favorite_folders(user_id, lower(trim(name)));
create index if not exists idx_favorite_folders_user_id
  on favorite_folders(user_id, updated_at desc);

create table if not exists favorite_folder_items (
  folder_id uuid not null references favorite_folders(id) on delete cascade,
  favorite_id uuid not null references favorites(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (folder_id, favorite_id)
);

create index if not exists idx_favorite_folder_items_favorite_id
  on favorite_folder_items(favorite_id);

alter table favorite_folders enable row level security;
alter table favorite_folder_items enable row level security;
