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


def _run(args: list[str], timeout: int = config.COMMAND_TIMEOUT) -> str:
    try:
        completed = subprocess.run(
            args,
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
        )
    except subprocess.TimeoutExpired as error:
        raise MediaError(f"{args[0]} timed out after {timeout}s") from error
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


def probe(path: Path) -> dict:
    """Return the stream layout that decides whether clips can be stream-copied."""
    output = _run([
        "ffprobe", "-v", "error",
        "-show_entries",
        "stream=codec_type,codec_name,width,height,pix_fmt,r_frame_rate,sample_rate,channels"
        ":format=duration",
        "-of", "json", str(path),
    ])
    data = json.loads(output)
    streams = data.get("streams") or []
    video = next((s for s in streams if s.get("codec_type") == "video"), None)
    if video is None:
        raise MediaError(f"{path.name} has no video stream")
    audio = next((s for s in streams if s.get("codec_type") == "audio"), None)
    return {
        "video": (
            video.get("codec_name"), int(video["width"]), int(video["height"]),
            video.get("pix_fmt"), video.get("r_frame_rate"),
        ),
        "audio": (
            (audio.get("codec_name"), audio.get("sample_rate"), audio.get("channels"))
            if audio else None
        ),
        "width": int(video["width"]),
        "height": int(video["height"]),
        "fps": video.get("r_frame_rate") or "24/1",
        "duration": float((data.get("format") or {}).get("duration") or 0),
    }


def _can_copy(clips: list[dict]) -> bool:
    first = clips[0]
    if first["video"][0] != "h264":
        return False
    if first["audio"] is not None and first["audio"][0] != "aac":
        return False
    return all(c["video"] == first["video"] and c["audio"] == first["audio"] for c in clips)


def _concat_copy(sources: list[Path], clips: list[dict], output: Path) -> None:
    listing = output.with_suffix(".txt")
    listing.write_text(
        "".join("file '{}'\n".format(str(p).replace("'", "'\\''")) for p in sources),
        encoding="utf-8",
    )
    audio = ["-map", "0:a:0"] if clips[0]["audio"] else []
    _run([
        "ffmpeg", "-v", "error", "-y",
        "-f", "concat", "-safe", "0", "-i", str(listing),
        "-map", "0:v:0", *audio, "-c", "copy", "-movflags", "+faststart",
        str(output),
    ], timeout=config.RENDER_TIMEOUT)


def _concat_encode(sources: list[Path], clips: list[dict], output: Path) -> None:
    """Re-encode every clip to the first clip's size and frame rate.

    Clips are letterboxed rather than cropped. When any clip has sound, the
    silent ones get a generated silent track so the audio stays in sync.
    """
    width, height, fps = clips[0]["width"], clips[0]["height"], clips[0]["fps"]
    with_audio = any(c["audio"] for c in clips)
    inputs: list[str] = []
    for source in sources:
        inputs += ["-i", str(source)]
    filters: list[str] = []
    pads: list[str] = []
    silent_index = len(sources)
    for index, clip in enumerate(clips):
        filters.append(
            f"[{index}:v:0]scale={width}:{height}:force_original_aspect_ratio=decrease,"
            f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps={fps},format=yuv420p[v{index}]"
        )
        pads.append(f"[v{index}]")
        if with_audio:
            if clip["audio"]:
                source = f"[{index}:a:0]"
            else:
                inputs += [
                    "-f", "lavfi", "-t", f"{clip['duration']:.3f}",
                    "-i", "anullsrc=channel_layout=stereo:sample_rate=48000",
                ]
                source = f"[{silent_index}:a:0]"
                silent_index += 1
            filters.append(f"{source}aresample=48000,aformat=channel_layouts=stereo[a{index}]")
            pads.append(f"[a{index}]")
    streams = "[v][a]" if with_audio else "[v]"
    filters.append(f"{''.join(pads)}concat=n={len(clips)}:v=1:a={1 if with_audio else 0}{streams}")
    audio = ["-map", "[a]", "-c:a", "aac", "-b:a", "192k"] if with_audio else []
    _run([
        "ffmpeg", "-v", "error", "-y", *inputs,
        "-filter_complex", ";".join(filters),
        "-map", "[v]", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
        *audio, "-movflags", "+faststart",
        str(output),
    ], timeout=config.RENDER_TIMEOUT)


def concat(sources: list[Path], output: Path) -> dict:
    """Join clips in order into one MP4.

    Clips from one project normally share codec, size and frame rate, so they
    are stream-copied; any mismatch falls back to one re-encode at the first
    clip's size and frame rate.
    """
    clips = [probe(source) for source in sources]
    copied = _can_copy(clips)
    if copied:
        _concat_copy(sources, clips, output)
    else:
        _concat_encode(sources, clips, output)
    if not output.exists() or output.stat().st_size == 0:
        raise MediaError("ffmpeg produced no video")
    result = probe(output)
    return {
        "width": result["width"],
        "height": result["height"],
        "durationSeconds": round(result["duration"], 3),
        "copied": copied,
    }