#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import json
import sys
import tempfile
import types
import unittest
from pathlib import Path


fake_sdk = types.ModuleType("qcloud_cos")
fake_sdk.CosConfig = object
fake_sdk.CosS3Client = object
sys.modules.setdefault("qcloud_cos", fake_sdk)
module_path = Path(__file__).resolve().parents[1] / "cos_archive.py"
spec = importlib.util.spec_from_file_location("compliance_cos_archive", module_path)
assert spec and spec.loader
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class TombstoneValidationTest(unittest.TestCase):
    def write_payload(self, payload: object) -> Path:
        handle = tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", delete=False)
        with handle:
            json.dump(payload, handle)
        self.addCleanup(Path(handle.name).unlink, missing_ok=True)
        return Path(handle.name)

    def test_accepts_only_irreversible_hashes(self) -> None:
        path = self.write_payload({
            "exportedAt": "2026-08-04T00:00:00Z",
            "tombstones": [{
                "user_hash": "a" * 64,
                "email_hash": "b" * 64,
                "deleted_at": "2026-08-04T00:00:00Z",
            }],
        })
        module.validate_tombstones(path)

    def test_rejects_raw_identifier_field(self) -> None:
        path = self.write_payload({
            "exportedAt": "2026-08-04T00:00:00Z",
            "tombstones": [{
                "user_hash": "a" * 64,
                "email_hash": None,
                "deleted_at": "2026-08-04T00:00:00Z",
                "email": "must-not-export@example.invalid",
            }],
        })
        with self.assertRaises(SystemExit):
            module.validate_tombstones(path)

    def test_rejects_non_hmac_identifier(self) -> None:
        path = self.write_payload({
            "exportedAt": "2026-08-04T00:00:00Z",
            "tombstones": [{
                "user_hash": "raw-user-id",
                "email_hash": None,
                "deleted_at": "2026-08-04T00:00:00Z",
            }],
        })
        with self.assertRaises(SystemExit):
            module.validate_tombstones(path)


if __name__ == "__main__":
    unittest.main()
