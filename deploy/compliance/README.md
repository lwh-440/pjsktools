# Compliance operations bundle

The production Compose/Caddy files integrate the reviewed logging and database
bootstrap chain from this directory. The host operations installer remains a
separate, fail-closed step and does not assume that COS, mail, `age`, fail2ban
or an alert transport has already been configured.

## Safety model

- `install-compliance-ops.sh` defaults to `--check` and refuses to overwrite an
  existing installation, systemd unit or fail2ban file. `--apply` installs but
  deliberately leaves all timers disabled; `--enable-timers` is a separate
  post-validation operation.
- `harden-ssh.sh` defaults to `--check`. Applying requires two established SSH
  sessions and the explicit `--confirmed-second-session` acknowledgement.
- populated configuration belongs under `/etc/pjsktools`, owned by root with
  mode `0600`; only placeholder examples are tracked here.
- COS and `age` configuration is mandatory. Missing settings fail closed and
  never cause local archive deletion.
- local deletion is performed only after the exact object key plus SHA-256 pair
  has a successful COS upload/HEAD verification marker.
- the server stores only the public `age` recipient. The decryption identity is
  generated and kept offline.

## Components

| File | Purpose |
| --- | --- |
| `Caddy.access-log.caddy` | Importable, query-free structured access logging |
| `Caddy.web-security-headers.caddy` | Report-Only and enforced Web CSP/security-header snippets |
| `archive-logs.sh` | SHA-256 manifest, COS upload/HEAD verification, 200-day local retention |
| `logrotate-pjsktools-security` | Daily 0600-compatible API security-log rotation/compression |
| `compose.logging.yml` | Reviewed-only bind mount and bounded Docker json-file example |
| `cos_archive.py` | SSE-COS upload, metadata HEAD check and random retrieval verification |
| `backup-postgres-encrypted.sh` | Stream PostgreSQL dump directly into `age`, then COS |
| `export-tombstones-encrypted.sh` | Export irreversible deletion tombstones separately, then age/COS |
| `verify-cos-restore.sh` | Monthly random COS download and SHA-256 verification |
| `verify-encrypted-backup-restore.sh` | Explicit offline-only age decrypt and disposable PostgreSQL restore gate |
| `monitor-compliance.sh` | Disk, backup, COS, TLS and fail2ban checks |
| `harden-ssh.sh` | Preflighted and rollback-capable SSH hardening |
| `install-compliance-ops.sh` | Fail-closed install; precise API log ACL; separately gated timer enablement |
| `bootstrap-pre-migration-roles.sh` | Create and validate fixed NOLOGIN roles before migrations |
| `bootstrap-database-roles.sh` | Non-interactive migrate-to-runtime role bootstrap and URL/role consistency gate |

Read [the operations runbook](../../docs/compliance-operations.md) before any
production action. COS and mail console setup is described in
[the external-service guide](../../docs/cos-and-domain-mail-setup.md).

The authoritative production database order is documented in
[`docs/compliance-operations.md`](../../docs/compliance-operations.md#生产数据库启动链门禁).
# Deletion tombstones

`DELETION_TOMBSTONE_KEY` must be a dedicated high-entropy HMAC key. It must not
reuse `JWT_SECRET`. Keep an offline backup for at least the 92-day database
backup window plus the 200-day tombstone audit window. Before restoring an old
database backup, export the live irreversible tombstones with
`scripts/replay-deletion-tombstones.mjs export`; after the restore and migration,
run its `replay` mode before reopening user traffic. Tombstones contain no
plaintext account id or email and are removed after 200 days.
