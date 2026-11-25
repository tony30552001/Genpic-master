"""Blob transfer over SAS URLs. The API signs every URL; this service never
holds storage credentials."""

from __future__ import annotations

from pathlib import Path
from urllib.parse import urlsplit

import httpx

from . import config


class BlobError(Exception):
    pass


def assert_blob_url(url: str) -> None:
    parts = urlsplit(url)
    host = parts.hostname or ""
    if parts.scheme != "https" or not host.endswith(config.BLOB_HOST_SUFFIX) or not parts.query:
        raise BlobError("URL must be an https Azure Blob SAS URL")


def download(url: str, target: Path) -> None:
    received = 0
    with httpx.stream("GET", url, timeout=config.COMMAND_TIMEOUT) as response:
        if response.status_code != 200:
            raise BlobError(f"source download failed ({response.status_code})")
        with target.open("wb") as handle:
            for chunk in response.iter_bytes():
                received += len(chunk)
                if received > config.MAX_VIDEO_BYTES:
                    raise BlobError("source video exceeds the size limit")
                handle.write(chunk)
    if received == 0:
        raise BlobError("source video is empty")


def upload(url: str, source: Path, content_type: str) -> int:
    payload = source.read_bytes()
    response = httpx.put(
        url,
        content=payload,
        headers={"x-ms-blob-type": "BlockBlob", "Content-Type": content_type},
        timeout=config.COMMAND_TIMEOUT,
    )
    if response.status_code != 201:
        raise BlobError(f"output upload failed ({response.status_code})")
    return len(payload)
