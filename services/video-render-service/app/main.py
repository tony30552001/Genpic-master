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
from typing import Annotated, Literal

from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, Field, model_validator

from . import blob, config, media

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("video-render-service")

app = FastAPI(title="Pixora video render service", version="2.0.0")


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


class SubtitleCue(BaseModel):
    start: float = Field(ge=0)
    end: float = Field(gt=0)
    text: str = Field(min_length=1, max_length=200)

    @model_validator(mode="after")
    def validate_range(self) -> SubtitleCue:
        if self.end <= self.start:
            raise ValueError("cue end must be greater than start")
        return self


class NarrationTrack(BaseModel):
    url: str = Field(min_length=1, max_length=4096)
    offset: float = Field(default=0.0, ge=0)
    cues: list[SubtitleCue] = Field(default_factory=list, max_length=200)


class TextOverlay(BaseModel):
    start: float = Field(ge=0)
    end: float = Field(gt=0)
    lines: list[Annotated[str, Field(min_length=1, max_length=120)]] = Field(
        min_length=1, max_length=4
    )

    @model_validator(mode="after")
    def validate_range(self) -> TextOverlay:
        if self.end <= self.start:
            raise ValueError("overlay end must be greater than start")
        return self


class TimelineClip(BaseModel):
    kind: Literal["video", "image"]
    url: str = Field(min_length=1, max_length=4096)
    duration: float | None = Field(default=None, gt=0, le=60)
    sourceAudio: Literal["keep", "duck", "mute"] = "keep"
    narrations: list[NarrationTrack] = Field(default_factory=list, max_length=12)
    overlays: list[TextOverlay] = Field(default_factory=list, max_length=12)

    @model_validator(mode="after")
    def validate_kind(self) -> TimelineClip:
        if self.kind == "image" and self.duration is None:
            raise ValueError("image clip requires duration")
        return self


class RenderRequest(BaseModel):
    width: int = Field(default=1920, ge=160, le=3840)
    height: int = Field(default=1080, ge=160, le=3840)
    fps: int = Field(default=24, ge=12, le=60)
    transition: Literal["cut", "fade"] = "cut"
    transitionDuration: float = Field(default=0.5, gt=0, le=2.0)
    burnSubtitles: bool = False
    clips: list[TimelineClip] = Field(min_length=1, max_length=config.MAX_RENDER_CLIPS)
    outputUrl: str = Field(min_length=1, max_length=4096)
    subtitleUrl: str | None = Field(default=None, min_length=1, max_length=4096)

    @model_validator(mode="after")
    def validate_totals(self) -> RenderRequest:
        narration_count = sum(len(clip.narrations) for clip in self.clips)
        if narration_count > config.MAX_RENDER_NARRATIONS:
            raise ValueError("too many narration tracks")
        return self


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
    urls = [payload.outputUrl]
    if payload.subtitleUrl:
        urls.append(payload.subtitleUrl)
    for clip in payload.clips:
        urls.append(clip.url)
        for narration in clip.narrations:
            urls.append(narration.url)
    assert_blob_urls(*urls)

    with workspace("render") as workdir:
        prepared_clips: list[media.PreparedClip] = []
        for clip_index, clip in enumerate(payload.clips):
            ext = ".mp4" if clip.kind == "video" else ".img"
            source_path = workdir / f"clip-{clip_index:02d}{ext}"
            blob.download(clip.url, source_path)

            narrations: list[media.PreparedNarration] = []
            for narr_index, narration in enumerate(clip.narrations):
                audio_path = workdir / f"narr-{clip_index:02d}-{narr_index:02d}.wav"
                blob.download(narration.url, audio_path)
                narrations.append(
                    media.PreparedNarration(
                        path=audio_path,
                        offset=narration.offset,
                        cues=[
                            media.TimedCue(start=c.start, end=c.end, text=c.text)
                            for c in narration.cues
                        ],
                    )
                )

            overlays = [
                media.PreparedOverlay(start=o.start, end=o.end, lines=list(o.lines))
                for o in clip.overlays
            ]
            prepared_clips.append(
                media.PreparedClip(
                    kind=clip.kind,
                    path=source_path,
                    duration=clip.duration,
                    source_audio=clip.sourceAudio,
                    narrations=narrations,
                    overlays=overlays,
                )
            )

        output = workdir / "render.mp4"
        subtitle_output = workdir / "subtitles.srt" if payload.subtitleUrl else None
        result = media.render_timeline(
            clips=prepared_clips,
            output=output,
            width=payload.width,
            height=payload.height,
            fps=payload.fps,
            transition=payload.transition,
            transition_duration=payload.transitionDuration,
            burn_subtitles=payload.burnSubtitles,
            subtitle_output=subtitle_output,
        )
        size = blob.upload(payload.outputUrl, output, "video/mp4")
        subtitle_size: int | None = None
        if payload.subtitleUrl and subtitle_output and subtitle_output.exists():
            subtitle_size = blob.upload(
                payload.subtitleUrl, subtitle_output, "application/x-subrip; charset=utf-8"
            )
    return {
        "contentType": "video/mp4",
        "sizeBytes": size,
        "subtitleSizeBytes": subtitle_size,
        **result,
    }