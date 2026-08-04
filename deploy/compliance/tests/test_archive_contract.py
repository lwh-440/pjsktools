#!/usr/bin/env python3
"""Regression checks for paired archive/manifest upload and safe cleanup."""

from __future__ import annotations

import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class ArchiveContractTest(unittest.TestCase):
    def assert_paired_upload_before_marker(self, script_name: str) -> None:
        text = (ROOT / script_name).read_text(encoding="utf-8")
        data_upload = re.search(r'cos_archive\.py" upload --file "\$(?:archive|file)"', text)
        manifest_upload = re.search(
            r'cos_archive\.py" upload --file "\$\{(?:archive|file)\}\.sha256"', text
        )
        marker_write = re.search(r"printf '%s\\t%s\\t%s\\t%s\\t%s\\n'", text)
        self.assertIsNotNone(data_upload)
        self.assertIsNotNone(manifest_upload)
        self.assertIsNotNone(marker_write)
        assert data_upload and manifest_upload and marker_write
        self.assertLess(data_upload.start(), manifest_upload.start())
        self.assertLess(manifest_upload.start(), marker_write.start())

    def test_log_archive_uploads_data_and_manifest_before_marker(self) -> None:
        self.assert_paired_upload_before_marker("archive-logs.sh")

    def test_log_archive_includes_api_security_rolls(self) -> None:
        text = (ROOT / "archive-logs.sh").read_text(encoding="utf-8")
        self.assertGreaterEqual(text.count("security*.json.gz"), 2)

    def test_security_log_rotation_is_daily_compressed_and_200_days(self) -> None:
        text = (ROOT / "logrotate-pjsktools-security").read_text(encoding="utf-8")
        for directive in ("daily", "rotate 200", "maxage 200", "compress", "copytruncate", "chmod 0600"):
            self.assertIn(directive, text)

    def test_compose_bounds_container_json_logs(self) -> None:
        text = (ROOT / "compose.logging.yml").read_text(encoding="utf-8")
        self.assertIn('max-size: "10m"', text)
        self.assertIn('max-file: "5"', text)
        self.assertIn("SECURITY_EVENT_LOG_PATH: /var/log/pjsktools/security.json", text)

    def test_installer_keeps_timers_behind_explicit_gate(self) -> None:
        text = (ROOT / "install-compliance-ops.sh").read_text(encoding="utf-8")
        self.assertIn('mode" == "--enable-timers"', text)
        enable_position = text.index("systemctl enable --now")
        enable_gate = text.index('if [[ "$mode" == "--enable-timers" ]]')
        apply_install = text.index('install -d -m 0700 "$TARGET_DIR/bin"')
        self.assertGreater(enable_position, enable_gate)
        self.assertLess(enable_position, apply_install)
        self.assertIn("Timers remain disabled", text)

    def test_installer_requires_precise_api_log_acl_and_real_cos_config(self) -> None:
        text = (ROOT / "install-compliance-ops.sh").read_text(encoding="utf-8")
        self.assertIn('API_LOG_UID:-', text)
        self.assertIn('setfacl -m "u:${API_LOG_UID}:rwx,m::rwx"', text)
        self.assertIn('COS_BUCKET" != *APPID*', text)
        self.assertIn('AGE_RECIPIENT" != *replace*', text)
        self.assertNotIn("chmod 777", text)

    def test_database_backup_uploads_data_and_manifest_before_marker(self) -> None:
        self.assert_paired_upload_before_marker("backup-postgres-encrypted.sh")

    def test_tombstone_export_uploads_data_and_manifest_before_marker(self) -> None:
        text = (ROOT / "export-tombstones-encrypted.sh").read_text(encoding="utf-8")
        data_upload = text.index('upload --file "$encrypted" --key "$key"')
        manifest_upload = text.index('upload --file "${encrypted}.sha256" --key "${key}.sha256"')
        marker_write = text.index("printf '%s\\t%s\\t%s\\t%s\\t%s\\n'", manifest_upload)
        self.assertLess(data_upload, manifest_upload)
        self.assertLess(manifest_upload, marker_write)

    def test_tombstone_export_selects_only_irreversible_fields(self) -> None:
        text = (ROOT / "export-tombstones-encrypted.sh").read_text(encoding="utf-8")
        self.assertIn("'user_hash', user_hash", text)
        self.assertIn("'email_hash', email_hash", text)
        self.assertIn("'deleted_at', deleted_at", text)
        self.assertNotIn("select * from account_deletion_tombstones", text.lower())

    def test_random_restore_verifies_paired_manifest(self) -> None:
        text = (ROOT / "cos_archive.py").read_text(encoding="utf-8")
        self.assertIn('download_and_verify(f"{selected}.sha256"', text)
        self.assertIn("manifest_fields[0] != data_digest", text)

    def test_cleanup_requires_both_manifest_key_and_digest(self) -> None:
        for script_name in ("archive-logs.sh", "backup-postgres-encrypted.sh"):
            text = (ROOT / script_name).read_text(encoding="utf-8")
            self.assertIn('marker_for()', text)
            self.assertIn('printf \'%s\\n%s\\n\' "$key" "$digest" | sha256sum', text)
            self.assertIn('"$data_key" == "$expected_key"', text)
            self.assertIn('"$manifest_key" == "${expected_key}.sha256"', text)
            self.assertIn('"$manifest_digest" == "$actual_manifest_digest"', text)

    def test_restore_check_covers_logs_daily_and_weekly(self) -> None:
        text = (ROOT / "verify-cos-restore.sh").read_text(encoding="utf-8")
        self.assertIn('random-verify --prefix "$COMPLIANCE_COS_LOG_PREFIX"', text)
        self.assertIn('random-verify --prefix "$COMPLIANCE_COS_DAILY_PREFIX" --suffix .dump.age', text)
        self.assertIn('random-verify --prefix "$COMPLIANCE_COS_WEEKLY_PREFIX" --suffix .dump.age', text)

    def test_isolated_database_restore_has_double_gate_and_disposable_database(self) -> None:
        text = (ROOT / "verify-encrypted-backup-restore.sh").read_text(encoding="utf-8")
        self.assertIn('COMPLIANCE_ALLOW_ISOLATED_RESTORE:-', text)
        self.assertIn('COMPLIANCE_CONFIRM_DISPOSABLE_POSTGRES:-', text)
        self.assertIn('docker run -d --name "$container" --network none', text)
        self.assertIn('docker rm -f "$container"', text)
        self.assertNotIn("DATABASE_URL", text)

    def test_production_files_integrate_compliance_and_disable_haruki(self) -> None:
        repository = ROOT.parents[1]
        compose = (repository / "compose.prod.yml").read_text(encoding="utf-8")
        caddy = (repository / "deploy" / "Caddyfile").read_text(encoding="utf-8")
        dockerfile = (repository / "deploy" / "Dockerfile.web").read_text(encoding="utf-8")
        self.assertIn("SECURITY_EVENT_LOG_PATH: /var/log/pjsktools/security.json", compose)
        self.assertGreaterEqual(compose.count("/var/log/pjsktools:/var/log/pjsktools"), 2)
        for setting in (
            'HARUKI_FEATURE_ENABLED: "false"',
            'HARUKI_WEBHOOK_ENABLED: "false"',
            'HARUKI_WEBHOOK_SYNC_ENABLED: "false"',
            'VITE_HARUKI_FEATURE_ENABLED: "false"',
        ):
            self.assertIn(setting, compose)
        self.assertIn("import compliance_access_log", caddy)
        self.assertRegex(dockerfile, r"FROM caddy:2\.(?:1[1-9]|[2-9][0-9])\.")

    def test_production_database_chain_is_fail_closed(self) -> None:
        repository = ROOT.parents[1]
        compose = (repository / "compose.prod.yml").read_text(encoding="utf-8")
        bootstrap = (ROOT / "bootstrap-database-roles.sh").read_text(encoding="utf-8")
        pre_bootstrap = (ROOT / "bootstrap-pre-migration-roles.sh").read_text(encoding="utf-8")
        self.assertIn("bootstrap-pre-migration-roles:", compose)
        pre_position = compose.index("bootstrap-pre-migration-roles:")
        migrate_position = compose.index("  migrate:")
        self.assertIn("bootstrap-runtime-roles:", compose)
        migrate_dependency = compose.index("bootstrap-runtime-roles:")
        api_position = compose.index("  api:")
        self.assertLess(pre_position, migrate_position)
        self.assertLess(migrate_position, migrate_dependency)
        migrate_block = compose[migrate_position:migrate_dependency]
        self.assertIn("bootstrap-pre-migration-roles:", migrate_block)
        self.assertIn("condition: service_completed_successfully", migrate_block)
        self.assertLess(migrate_dependency, api_position)
        self.assertIn("condition: service_completed_successfully", compose[migrate_dependency:api_position])
        api_block = compose[api_position:compose.index("  caddy:")]
        self.assertIn("bootstrap-runtime-roles:", api_block)
        self.assertIn("condition: service_completed_successfully", api_block)
        self.assertNotIn("DATABASE_MIGRATION_URL", api_block)
        for name in (
            "APP_RUNTIME_PASSWORD", "AUTH_RUNTIME_PASSWORD", "COMPLIANCE_RUNTIME_PASSWORD",
            "DATABASE_URL", "AUTH_DATABASE_URL", "COMPLIANCE_DATABASE_URL",
        ):
            self.assertIn(name, compose[migrate_dependency:api_position])
        self.assertIn('DATABASE_ROLE_CONFIG_SOURCE:-file', bootstrap)
        self.assertIn('migrations-complete-runtime-logins-only', bootstrap)
        self.assertIn('verify_runtime_login()', bootstrap)
        self.assertIn('runtime URL does not target the migrated database', bootstrap)
        self.assertIn('HARUKI_RUNTIME_PASSWORD: ""', compose)
        self.assertIn('pre-migration-fixed-roles-only', pre_bootstrap)
        self.assertIn('DATABASE_MIGRATION_ROLE', pre_bootstrap)
        self.assertIn('DATABASE_MIGRATION_PASSWORD', pre_bootstrap)
        self.assertIn('DATABASE_MIGRATION_URL', pre_bootstrap)
        self.assertNotIn('APP_RUNTIME_PASSWORD', pre_bootstrap)
        pre_block = compose[pre_position:migrate_position]
        self.assertIn('POSTGRES_ADMIN_URL: ${POSTGRES_ADMIN_URL}', pre_block)
        self.assertIn('DATABASE_MIGRATION_URL: ${DATABASE_MIGRATION_URL}', pre_block)
        self.assertNotIn('POSTGRES_ADMIN_URL: ${DATABASE_MIGRATION_URL}', pre_block)
        self.assertIn('DATABASE_MIGRATION_ROLE:-pjsktools_migrate', pre_block)
        self.assertIn('must use different roles', pre_bootstrap)
        self.assertIn('unexpected parent role', pre_bootstrap)
        self.assertIn('membership set is not exact', pre_bootstrap)
        self.assertIn('unexpected member', pre_bootstrap)
        self.assertNotIn('POSTGRES_ADMIN_URL', migrate_block)
        self.assertNotIn('POSTGRES_ADMIN_URL', api_block)


if __name__ == "__main__":
    unittest.main()
