"""ffmpeg operations. Every command is a fixed argument list; no shell."""

from __future__ import annotations

import json
import subprocess
from pathlib import Path

from . import config


class MediaError(Exception):
    def __init__(self, message: str, stderr: str = "") -> None:
        super().__init__(message)
        self.stderr = stderr


def _run(args: list[str]) -> str:
    try:
        completed = subprocess.run(
            args,
            capture_output=True,
            text=True,
            timeout=config.COMMAND_TIMEOUT,
            check=False,
        )
    except subprocess.TimeoutExpired as error:
        raise MediaError(f"{args[0]} timed out after {config.COMMAND_TIMEOUT}s") from error
    if completed.returncode != 0:
        raise MediaError(f"{args[0]} exited with {completed.returncode}", completed.stderr)
    return completed.stdout


def ffmpeg_version() -> str:
    return _run(["ffmpeg", "-hide_banner", "-version"]).splitlines()[0]


def image_size(path: Path) -> tuple[int, int]:
    output = _run([
        "ffprobe", "-v", "error", "-select_streams", "v:0",
        "-show_entries", "stream=width,height", "-of", "json", str(path),
    ])
    streams = json.loads(output).get("streams") or []
    if not streams:
        raise MediaError("no video stream in frame output")
    return int(streams[0]["width"]), int(streams[0]["height"])


def last_frame(video: Path, frame: Path) -> tuple[int, int]:
    """Write the final decoded frame of `video` to `frame` as PNG.

    Seeking three seconds before the end and letting `-update 1` overwrite the
    output with every decoded frame leaves exactly the last frame on disk,
    including for variable frame rate clips where the frame count is unknown.
    """
    _run([
        "ffmpeg", "-v", "error", "-y",
        "-sseof", "-3", "-i", str(video),
        "-map", "0:v:0", "-an",
        "-update", "1", "-c:v", "png",
        str(frame),
    ])
    if not frame.exists() or frame.stat().st_size == 0:
        raise MediaError("ffmpeg produced no frame")
    return image_size(frame)
