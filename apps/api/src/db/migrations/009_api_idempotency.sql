create table if not exists api_idempotency_records (
  scope text not null,
  idempotency_key text not null,
  request_hash text not null,
  status_code integer not null,
  response_body jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  primary key (scope, idempotency_key)
);

create index if not exists idx_api_idempotency_expires_at on api_idempotency_records(expires_at);

alter table api_idempotency_records enable row level security;
