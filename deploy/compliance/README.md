# Compliance operations bundle

This directory is intentionally separate from the application deployment. It
does not assume that COS, domain mail, `age`, fail2ban or an alert transport has
already been configured, and it never edits Caddy automatically.

## Safety model

- `install-compliance-ops.sh` defaults to `--check` and refuses to overwrite an
  existing installation, systemd unit or fail2ban file.
- `harden-ssh.sh` defaults to `--check`. Applying requires two established SSH
  sessions and the explicit `--confirmed-second-session` acknowledgement.
- populated configuration belongs under `/etc/pjsktools`, owned by root with
  mode `0600`; only placeholder examples are tracked here.
- COS and `age` configuration is mandatory. Missing settings fail closed and
  never cause local archive deletion.
- local deletion is performed only after the exact SHA-256 has a successful COS
  upload/HEAD verification marker.
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
| `monitor-compliance.sh` | Disk, backup, COS, TLS and fail2ban checks |
| `harden-ssh.sh` | Preflighted and rollback-capable SSH hardening |
| `install-compliance-ops.sh` | Fail-closed first installation of timers and fail2ban rule |

Read [the operations runbook](../../docs/compliance-operations.md) before any
production action. COS and mail console setup is described in
[the external-service guide](../../docs/cos-and-domain-mail-setup.md).
# Deletion tombstones

`DELETION_TOMBSTONE_KEY` must be a dedicated high-entropy HMAC key. It must not
reuse `JWT_SECRET`. Keep an offline backup for at least the 92-day database
backup window plus the 200-day tombstone audit window. Before restoring an old
database backup, export the live irreversible tombstones with
`scripts/replay-deletion-tombstones.mjs export`; after the restore and migration,
run its `replay` mode before reopening user traffic. Tombstones contain no
plaintext account id or email and are removed after 200 days.
