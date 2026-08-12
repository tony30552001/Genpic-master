"""Configuration for the ppt-master sidecar service."""

from __future__ import annotations

import os
from pathlib import Path

SKILL_DIR = Path(
    os.environ.get("PPT_MASTER_SKILL_DIR", "/opt/ppt-master/skills/ppt-master")
)
WORKDIR = Path(os.environ.get("PPT_MASTER_WORKDIR", "/var/tmp/ppt-master"))
COMMAND_TIMEOUT = int(os.environ.get("PPT_MASTER_COMMAND_TIMEOUT", "900"))
CANVAS_FORMAT = os.environ.get("PPT_MASTER_CANVAS_FORMAT", "ppt169")
PORT = int(os.environ.get("PORT", "8080"))

SERVICE_KEY_HEADER = "X-Pixora-Service-Key"


def get_service_key() -> str:
    """Return the shared secret, failing loudly when it is not configured."""
    key = os.environ.get("PPT_MASTER_SERVICE_KEY", "").strip()
    if not key:
        raise RuntimeError(
            "PPT_MASTER_SERVICE_KEY is required; refusing to start without it"
        )
    return key
