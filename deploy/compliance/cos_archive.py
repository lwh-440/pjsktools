#!/usr/bin/env python3
"""Upload and verify compliance archives without printing COS credentials."""

from __future__ import annotations

import argparse
import hashlib
import os
import random
import json
import re
import sys
import tempfile
from pathlib import Path

try:
    from qcloud_cos import CosConfig, CosS3Client
except ImportError as exc:  # pragma: no cover - deployment dependency check
    raise SystemExit(
        "qcloud_cos is missing; install deploy/compliance/requirements.txt"
    ) from exc


def required(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise SystemExit(f"required environment variable is missing: {name}")
    return value


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def client_and_bucket() -> tuple[CosS3Client, str]:
    config = CosConfig(
        Region=required("COS_REGION"),
        SecretId=required("COS_SECRET_ID"),
        SecretKey=required("COS_SECRET_KEY"),
        Token=os.environ.get("COS_SESSION_TOKEN") or None,
        Scheme="https",
    )
    return CosS3Client(config), required("COS_BUCKET")


def normalized_key(value: str) -> str:
    key = value.strip().lstrip("/")
    if not key or ".." in key.split("/"):
        raise SystemExit("COS object key is empty or unsafe")
    return key


def upload(path: Path, key: str) -> None:
    if not path.is_file() or path.is_symlink():
        raise SystemExit(f"archive is not a regular file: {path}")
    client, bucket = client_and_bucket()
    digest = sha256_file(path)
    size = path.stat().st_size
    with path.open("rb") as body:
        client.put_object(
            Bucket=bucket,
            Key=key,
            Body=body,
            ServerSideEncryption="AES256",
            Metadata={"sha256": digest},
        )
    response = {str(name).lower(): value for name, value in client.head_object(Bucket=bucket, Key=key).items()}
    remote_size = int(response.get("content-length", -1))
    remote_digest = response.get("x-cos-meta-sha256", "")
    encryption = response.get("x-cos-server-side-encryption", "")
    if remote_size != size or remote_digest != digest or encryption != "AES256":
        raise SystemExit("COS HEAD verification failed")
    print(f"verified upload: {key} sha256={digest} bytes={size}")


def download_and_verify(key: str, expected: str | None, output: Path | None) -> str:
    client, bucket = client_and_bucket()
    head = {str(name).lower(): value for name, value in client.head_object(Bucket=bucket, Key=key).items()}
    metadata_digest = head.get("x-cos-meta-sha256", "")
    expected_digest = expected or metadata_digest
    if not expected_digest:
        raise SystemExit("remote object has no SHA-256 metadata")
    temporary = None
    if output is None:
        temporary = tempfile.NamedTemporaryFile(prefix="cos-verify-", delete=False)
        temporary.close()
        output = Path(temporary.name)
    try:
        response = client.get_object(Bucket=bucket, Key=key)
        response["Body"].get_stream_to_file(str(output))
        actual = sha256_file(output)
        if actual != expected_digest:
            raise SystemExit("downloaded object SHA-256 mismatch")
        print(f"verified download: {key} sha256={actual}")
        return actual
    finally:
        if temporary is not None:
            output.unlink(missing_ok=True)


def random_verify(prefix: str) -> None:
    client, bucket = client_and_bucket()
    prefix = normalized_key(prefix).rstrip("/") + "/"
    keys: list[str] = []
    marker = ""
    while len(keys) < 1000:
        response = client.list_objects(
            Bucket=bucket,
            Prefix=prefix,
            Marker=marker,
            MaxKeys=200,
        )
        for item in response.get("Contents", []):
            key = item.get("Key", "")
            if key and not key.endswith(".sha256"):
                keys.append(key)
        if str(response.get("IsTruncated", "false")).lower() != "true":
            break
        marker = response.get("NextMarker", "")
        if not marker:
            break
    if not keys:
        raise SystemExit(f"no archive objects found under {prefix}")
    selected = random.SystemRandom().choice(keys)
    with tempfile.TemporaryDirectory(prefix="cos-pair-verify-") as directory:
        data_path = Path(directory) / "archive"
        manifest_path = Path(directory) / "archive.sha256"
        data_digest = download_and_verify(selected, None, data_path)
        download_and_verify(f"{selected}.sha256", None, manifest_path)
        manifest_fields = manifest_path.read_text(encoding="utf-8").strip().split()
        if not manifest_fields or manifest_fields[0] != data_digest:
            raise SystemExit("paired SHA-256 manifest does not match downloaded archive")
        print(f"verified paired manifest: {selected}.sha256")


def validate_tombstones(path: Path) -> None:
    if not path.is_file() or path.is_symlink():
        raise SystemExit("tombstone export is not a regular file")
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise SystemExit("tombstone export is not valid UTF-8 JSON") from exc
    if set(payload) != {"exportedAt", "tombstones"} or not isinstance(payload["exportedAt"], str):
        raise SystemExit("tombstone export has unexpected top-level fields")
    tombstones = payload["tombstones"]
    if not isinstance(tombstones, list):
        raise SystemExit("tombstones must be an array")
    hash_pattern = re.compile(r"^[0-9a-f]{64}$")
    for item in tombstones:
        if not isinstance(item, dict) or set(item) != {"user_hash", "email_hash", "deleted_at"}:
            raise SystemExit("tombstone contains unexpected fields")
        if not isinstance(item["user_hash"], str) or not hash_pattern.fullmatch(item["user_hash"]):
            raise SystemExit("invalid irreversible user hash")
        email_hash = item["email_hash"]
        if email_hash is not None and (not isinstance(email_hash, str) or not hash_pattern.fullmatch(email_hash)):
            raise SystemExit("invalid irreversible email hash")
        if not isinstance(item["deleted_at"], str) or not item["deleted_at"]:
            raise SystemExit("invalid tombstone deletion time")
    print(f"validated irreversible tombstone export: count={len(tombstones)}")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)
    upload_parser = sub.add_parser("upload")
    upload_parser.add_argument("--file", type=Path, required=True)
    upload_parser.add_argument("--key", required=True)
    verify_parser = sub.add_parser("verify")
    verify_parser.add_argument("--key", required=True)
    verify_parser.add_argument("--sha256")
    verify_parser.add_argument("--output", type=Path)
    random_parser = sub.add_parser("random-verify")
    random_parser.add_argument("--prefix", required=True)
    tombstone_parser = sub.add_parser("validate-tombstones")
    tombstone_parser.add_argument("--file", type=Path, required=True)
    return parser


def main() -> int:
    args = build_parser().parse_args()
    if args.command == "upload":
        upload(args.file.resolve(), normalized_key(args.key))
    elif args.command == "verify":
        download_and_verify(normalized_key(args.key), args.sha256, args.output)
    elif args.command == "random-verify":
        random_verify(args.prefix)
    else:
        validate_tombstones(args.file.resolve())
    return 0


if __name__ == "__main__":
    sys.exit(main())
