alter table user_card_inventory
  add column if not exists episodes jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'chk_user_card_inventory_episodes_array'
  ) then
    alter table user_card_inventory
      add constraint chk_user_card_inventory_episodes_array
      check (jsonb_typeof(episodes) = 'array');
  end if;
end $$;
