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
            self.assertIn('"$manifest_key" == "${data_key}.sha256"', text)
            self.assertIn('"$manifest_digest" == "$actual_manifest_digest"', text)


if __name__ == "__main__":
    unittest.main()
