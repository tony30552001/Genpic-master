"""HTTP surface for the video render service.

The Pixora API owns jobs, storage credentials and state. This service only runs
ffmpeg against inputs and outputs that the API signs as Blob SAS URLs.
"""

from __future__ import annotations

import hmac
import logging
import shutil
import tempfile
from collections.abc import Iterator
from contextlib import contextmanager
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


class RenderRequest(BaseModel):
    segmentUrls: list[Annotated[str, Field(min_length=1, max_length=4096)]] = Field(
        min_length=2, max_length=config.MAX_RENDER_SEGMENTS
    )
    outputUrl: str = Field(min_length=1, max_length=4096)


@app.get("/health")
def health() -> dict:
    try:
        version = media.ffmpeg_version()
    except (media.MediaError, FileNotFoundError) as error:
        raise HTTPException(status_code=503, detail=f"ffmpeg unavailable: {error}") from error
    return {"status": "ok", "ffmpeg": version}


def assert_blob_urls(*urls: str) -> None:
    try:
        for url in urls:
            blob.assert_blob_url(url)
    except blob.BlobError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@contextmanager
def workspace(operation: str) -> Iterator[Path]:
    """A scratch directory whose blob and ffmpeg failures map to HTTP errors."""
    config.WORKDIR.mkdir(parents=True, exist_ok=True)
    workdir = Path(tempfile.mkdtemp(dir=config.WORKDIR))
    try:
        yield workdir
    except blob.BlobError as error:
        logger.error("%s blob transfer failed: %s", operation, error)
        raise HTTPException(status_code=502, detail=str(error)) from error
    except media.MediaError as error:
        stderr = error.stderr.strip()[-2000:]
        logger.error("%s ffmpeg failed: %s stderr=%s", operation, error, stderr)
        raise HTTPException(status_code=422, detail={"message": str(error), "stderr": stderr}) from error
    finally:
        shutil.rmtree(workdir, ignore_errors=True)


@app.post("/last-frame")
def last_frame(payload: LastFrameRequest, _: Authenticated) -> dict:
    assert_blob_urls(payload.videoUrl, payload.frameUrl)
    with workspace("last-frame") as workdir:
        video = workdir / "source.mp4"
        frame = workdir / "last-frame.png"
        blob.download(payload.videoUrl, video)
        width, height = media.last_frame(video, frame)
        size = blob.upload(payload.frameUrl, frame, "image/png")
    return {"contentType": "image/png", "width": width, "height": height, "sizeBytes": size}


@app.post("/render")
def render(payload: RenderRequest, _: Authenticated) -> dict:
    assert_blob_urls(*payload.segmentUrls, payload.outputUrl)
    with workspace("render") as workdir:
        sources = []
        for index, url in enumerate(payload.segmentUrls):
            source = workdir / f"segment-{index:02d}.mp4"
            blob.download(url, source)
            sources.append(source)
        output = workdir / "render.mp4"
        result = media.concat(sources, output)
        size = blob.upload(payload.outputUrl, output, "video/mp4")
    return {"contentType": "video/mp4", "sizeBytes": size, **result}