create table if not exists ranking_history_samples (
  id uuid primary key default gen_random_uuid(),
  region text not null,
  event_id text not null,
  sample_type text not null,
  rank integer not null,
  score bigint not null default 0,
  sampled_at timestamptz not null,
  bucket_at timestamptz not null,
  player_name text,
  user_id text,
  leader_card_id text,
  leader_card_image_url text,
  raw_payload jsonb not null default '{}'::jsonb,
  source_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table ranking_history_samples enable row level security;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'chk_ranking_history_samples_region') then
    alter table ranking_history_samples add constraint chk_ranking_history_samples_region check (region in ('jp', 'en', 'tw', 'kr', 'cn'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'chk_ranking_history_samples_type') then
    alter table ranking_history_samples add constraint chk_ranking_history_samples_type check (sample_type in ('border', 'top100'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'chk_ranking_history_samples_rank_score') then
    alter table ranking_history_samples add constraint chk_ranking_history_samples_rank_score check (rank > 0 and score >= 0);
  end if;
end $$;

create unique index if not exists idx_ranking_history_samples_unique_bucket
  on ranking_history_samples(region, event_id, sample_type, rank, bucket_at);

create index if not exists idx_ranking_history_samples_lookup
  on ranking_history_samples(region, event_id, sample_type, rank, sampled_at desc);

create index if not exists idx_ranking_history_samples_event_time
  on ranking_history_samples(region, event_id, sampled_at desc);

create index if not exists idx_ranking_history_samples_created_at
  on ranking_history_samples(created_at);
