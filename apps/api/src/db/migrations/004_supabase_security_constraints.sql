alter table users enable row level security;
alter table oauth_accounts enable row level security;
alter table auth_sessions enable row level security;
alter table auth_states enable row level security;
alter table favorites enable row level security;
alter table scores enable row level security;
alter table email_verification_codes enable row level security;
alter table user_player_bindings enable row level security;
alter table user_card_inventory enable row level security;
alter table user_deck_configs enable row level security;
alter table user_player_data enable row level security;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'chk_users_email_normalized') then
    alter table users add constraint chk_users_email_normalized check (email is null or email = lower(trim(email)));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'chk_oauth_accounts_provider') then
    alter table oauth_accounts add constraint chk_oauth_accounts_provider check (provider in ('qq'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'chk_auth_states_provider') then
    alter table auth_states add constraint chk_auth_states_provider check (provider in ('qq'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'chk_email_verification_codes_purpose') then
    alter table email_verification_codes add constraint chk_email_verification_codes_purpose check (purpose in ('register'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'chk_email_verification_codes_attempts') then
    alter table email_verification_codes add constraint chk_email_verification_codes_attempts check (attempts >= 0 and attempts <= 5);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'chk_favorites_type') then
    alter table favorites add constraint chk_favorites_type check (type in ('player', 'event', 'song', 'card'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'chk_favorites_region') then
    alter table favorites add constraint chk_favorites_region check (region in ('jp', 'en', 'tw', 'kr', 'cn'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'chk_scores_region') then
    alter table scores add constraint chk_scores_region check (region in ('jp', 'en', 'tw', 'kr', 'cn'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'chk_scores_clear_status') then
    alter table scores add constraint chk_scores_clear_status check (clear_status in ('not_clear', 'clear', 'fc', 'ap'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'chk_scores_values') then
    alter table scores add constraint chk_scores_values check (score >= 0 and (target_score is null or target_score >= 0));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'chk_user_player_bindings_region') then
    alter table user_player_bindings add constraint chk_user_player_bindings_region check (region in ('jp', 'en', 'tw', 'kr', 'cn'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'chk_user_card_inventory_region') then
    alter table user_card_inventory add constraint chk_user_card_inventory_region check (region in ('jp', 'en', 'tw', 'kr', 'cn'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'chk_user_card_inventory_values') then
    alter table user_card_inventory add constraint chk_user_card_inventory_values check (
      (level is null or level between 1 and 100)
      and (master_rank is null or master_rank between 0 and 5)
      and (skill_level is null or skill_level between 1 and 4)
      and (special_training_status is null or special_training_status in ('not_doing', 'done', 'unknown'))
      and (default_image is null or default_image in ('original', 'after_training'))
    );
  end if;

  if not exists (select 1 from pg_constraint where conname = 'chk_user_deck_configs_region') then
    alter table user_deck_configs add constraint chk_user_deck_configs_region check (region in ('jp', 'en', 'tw', 'kr', 'cn'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'chk_user_deck_configs_card_ids') then
    alter table user_deck_configs add constraint chk_user_deck_configs_card_ids check (array_length(card_ids, 1) between 1 and 5);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'chk_user_player_data_region') then
    alter table user_player_data add constraint chk_user_player_data_region check (region in ('jp', 'en', 'tw', 'kr', 'cn'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'chk_user_player_data_kind') then
    alter table user_player_data add constraint chk_user_player_data_kind check (
      kind in ('area-items', 'character-ranks', 'music-results', 'materials', 'challenge-live', 'world-bloom-support')
    );
  end if;
end $$;

create index if not exists idx_auth_sessions_expires_at on auth_sessions(expires_at);
create index if not exists idx_auth_sessions_revoked_at on auth_sessions(revoked_at);
create index if not exists idx_email_verification_codes_cleanup on email_verification_codes(expires_at, consumed_at);
create index if not exists idx_user_player_bindings_lookup on user_player_bindings(user_id, region, player_uid);
create index if not exists idx_user_deck_configs_binding on user_deck_configs(user_id, binding_id);
