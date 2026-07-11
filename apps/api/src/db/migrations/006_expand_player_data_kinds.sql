do $$
begin
  if exists (select 1 from pg_constraint where conname = 'chk_user_player_data_kind') then
    alter table user_player_data drop constraint chk_user_player_data_kind;
  end if;

  alter table user_player_data add constraint chk_user_player_data_kind check (
    kind in (
      'area-items',
      'character-ranks',
      'music-results',
      'materials',
      'challenge-live',
      'world-bloom-support',
      'honors',
      'profile-honors',
      'decks',
      'mysekai-canvas',
      'mysekai-gates',
      'mysekai-fixtures'
    )
  );
end $$;
