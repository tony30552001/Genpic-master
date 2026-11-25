"""Configuration for the video render service."""

from __future__ import annotations

import os
from pathlib import Path

WORKDIR = Path(os.environ.get("VIDEO_RENDER_WORKDIR", "/var/tmp/video-render"))
COMMAND_TIMEOUT = int(os.environ.get("VIDEO_RENDER_COMMAND_TIMEOUT", "120"))
MAX_VIDEO_BYTES = 200 * 1024 * 1024
BLOB_HOST_SUFFIX = ".blob.core.windows.net"


def get_service_key() -> str:
    """Return the shared secret, failing loudly when it is not configured."""
    key = os.environ.get("VIDEO_RENDER_SERVICE_KEY", "").strip()
    if not key:
        raise RuntimeError(
            "VIDEO_RENDER_SERVICE_KEY is required; refusing to start without it"
        )
    return key
