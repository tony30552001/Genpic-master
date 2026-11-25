"""HTTP surface for the video render service.

The Pixora API owns jobs, storage credentials and state. This service only runs
ffmpeg against inputs and outputs that the API signs as Blob SAS URLs.
"""

from __future__ import annotations

import hmac
import logging
import shutil
import tempfile
from pathlib import Path
from typing import Annotated

from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

from . import blob, config, media

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("video-render-service")

app = FastAPI(title="Pixora video render service", version="1.0.0")


def require_service_key(
    x_pixora_service_key: Annotated[str | None, Header()] = None,
) -> None:
    expected = config.get_service_key()
    if not x_pixora_service_key or not hmac.compare_digest(x_pixora_service_key, expected):
        raise HTTPException(status_code=401, detail="invalid service key")


Authenticated = Annotated[None, Depends(require_service_key)]


class LastFrameRequest(BaseModel):
    videoUrl: str = Field(min_length=1, max_length=4096)
    frameUrl: str = Field(min_length=1, max_length=4096)


@app.get("/health")
def health() -> dict:
    try:
        version = media.ffmpeg_version()
    except (media.MediaError, FileNotFoundError) as error:
        raise HTTPException(status_code=503, detail=f"ffmpeg unavailable: {error}") from error
    return {"status": "ok", "ffmpeg": version}


@app.post("/last-frame")
def last_frame(payload: LastFrameRequest, _: Authenticated) -> dict:
    try:
        blob.assert_blob_url(payload.videoUrl)
        blob.assert_blob_url(payload.frameUrl)
    except blob.BlobError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

    config.WORKDIR.mkdir(parents=True, exist_ok=True)
    workdir = Path(tempfile.mkdtemp(dir=config.WORKDIR))
    try:
        video = workdir / "source.mp4"
        frame = workdir / "last-frame.png"
        blob.download(payload.videoUrl, video)
        width, height = media.last_frame(video, frame)
        size = blob.upload(payload.frameUrl, frame, "image/png")
    except blob.BlobError as error:
        logger.error("last-frame blob transfer failed: %s", error)
        raise HTTPException(status_code=502, detail=str(error)) from error
    except media.MediaError as error:
        logger.error("last-frame ffmpeg failed: %s stderr=%s", error, error.stderr.strip()[-2000:])
        raise HTTPException(
            status_code=422,
            detail={"message": str(error), "stderr": error.stderr.strip()[-2000:]},
        ) from error
    finally:
        shutil.rmtree(workdir, ignore_errors=True)

    return {"contentType": "image/png", "width": width, "height": height, "sizeBytes": size}
