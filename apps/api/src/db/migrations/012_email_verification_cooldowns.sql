create table if not exists email_verification_cooldowns (
  email text not null,
  purpose text not null,
  reservation_id uuid not null,
  expires_at timestamptz not null,
  primary key (email, purpose)
);

create index if not exists idx_email_verification_cooldowns_expires_at
  on email_verification_cooldowns(expires_at);

alter table email_verification_cooldowns enable row level security;
