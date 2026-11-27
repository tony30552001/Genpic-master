"""Configuration for the video render service."""

from __future__ import annotations

import os
from pathlib import Path

WORKDIR = Path(os.environ.get("VIDEO_RENDER_WORKDIR", "/var/tmp/video-render"))
COMMAND_TIMEOUT = int(os.environ.get("VIDEO_RENDER_COMMAND_TIMEOUT", "120"))
# Container Apps ingress closes a request after 240 seconds, so the whole
# render, including transfers, has to finish inside that window.
RENDER_TIMEOUT = int(os.environ.get("VIDEO_RENDER_RENDER_TIMEOUT", "180"))
MAX_VIDEO_BYTES = 200 * 1024 * 1024
MAX_RENDER_CLIPS = 40
MAX_RENDER_NARRATIONS = 60
BLOB_HOST_SUFFIX = ".blob.core.windows.net"


def get_service_key() -> str:
    """Return the shared secret, failing loudly when it is not configured."""
    key = os.environ.get("VIDEO_RENDER_SERVICE_KEY", "").strip()
    if not key:
        raise RuntimeError(
            "VIDEO_RENDER_SERVICE_KEY is required; refusing to start without it"
        )
    return key
