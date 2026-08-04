do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'oauth_handoffs'::regclass
      and conname = 'oauth_handoffs_kind_check'
      and pg_get_constraintdef(oid) like '%''delete''%'
  ) then
    alter table oauth_handoffs drop constraint if exists oauth_handoffs_kind_check;
    alter table oauth_handoffs
      add constraint oauth_handoffs_kind_check
      check (kind in ('login', 'link', 'delete'));
  end if;
end
$$;
