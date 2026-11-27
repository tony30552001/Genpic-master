"""Build-time smoke test. Runs inside the image without network or storage.

1. Encodes a clip that is red for one second, then blue, and asserts the
   extracted last frame is blue at the source resolution.
2. Concatenates matching clips by stream copy, and renders a full Phase 4
   timeline (video + static PNG image + crossfade + ducked source audio +
   narration WAV + onScreenText + ASS subtitles + .srt export).
3. Drives the HTTP routes with blob transfer replaced by local file copies.
"""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

os.environ.setdefault("VIDEO_RENDER_SERVICE_KEY", "smoke-secret")
os.environ.setdefault("VIDEO_RENDER_WORKDIR", tempfile.mkdtemp())

from fastapi.testclient import TestClient  # noqa: E402

from app import blob, main, media  # noqa: E402


def make_clip(path: Path) -> None:
    subprocess.run(
        [
            "ffmpeg", "-v", "error", "-y",
            "-f", "lavfi", "-i", "color=c=red:s=320x180:r=24:d=1",
            "-f", "lavfi", "-i", "color=c=blue:s=320x180:r=24:d=1",
            "-filter_complex", "[0:v][1:v]concat=n=2:v=1:a=0",
            "-c:v", "libx264", "-pix_fmt", "yuv420p", str(path),
        ],
        check=True,
    )


def make_image(path: Path, color: str = "green", size: str = "320x180") -> Path:
    subprocess.run(
        [
            "ffmpeg", "-v", "error", "-y",
            "-f", "lavfi", "-i", f"color=c={color}:s={size}:d=0.1",
            "-frames:v", "1", str(path),
        ],
        check=True,
    )
    return path


def make_wav(path: Path, duration: float = 1.0, freq: int = 520) -> Path:
    subprocess.run(
        [
            "ffmpeg", "-v", "error", "-y",
            "-f", "lavfi", "-i", f"sine=frequency={freq}:sample_rate=24000:duration={duration}",
            "-c:a", "pcm_s16le", str(path),
        ],
        check=True,
    )
    return path


def center_rgb(path: Path) -> tuple[int, int, int]:
    raw = subprocess.run(
        [
            "ffmpeg", "-v", "error", "-i", str(path),
            "-vf", "crop=2:2,scale=1:1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-",
        ],
        check=True,
        capture_output=True,
    ).stdout
    return raw[0], raw[1], raw[2]


def check_last_frame(workdir: Path) -> Path:
    clip = workdir / "clip.mp4"
    frame = workdir / "frame.png"
    make_clip(clip)
    size = media.last_frame(clip, frame)
    assert size == (320, 180), f"unexpected frame size {size}"
    red, green, blue = center_rgb(frame)
    assert blue > 200 and red < 60 and green < 60, f"last frame is not blue: {(red, green, blue)}"
    return clip


def make_colored(path: Path, color: str, size: str, rate: int, sound: bool, duration: float = 1.0) -> Path:
    audio = ["-f", "lavfi", "-i", f"sine=frequency=440:sample_rate=48000:duration={duration}"] if sound else []
    codecs = ["-c:a", "aac", "-shortest"] if sound else []
    subprocess.run(
        [
            "ffmpeg", "-v", "error", "-y",
            "-f", "lavfi", "-i", f"color=c={color}:s={size}:r={rate}:d={duration}", *audio,
            "-c:v", "libx264", "-pix_fmt", "yuv420p", *codecs, str(path),
        ],
        check=True,
    )
    return path


def frame_rgb(path: Path, at: float) -> tuple[int, int, int]:
    frame = path.with_name(f"{path.stem}-{at}.png")
    subprocess.run(
        ["ffmpeg", "-v", "error", "-y", "-ss", str(at), "-i", str(path), "-frames:v", "1", str(frame)],
        check=True,
    )
    return center_rgb(frame)


def check_timeline(workdir: Path) -> tuple[Path, Path]:
    red = make_colored(workdir / "red.mp4", "red", "320x180", 24, True, duration=2.0)
    blue = make_colored(workdir / "blue.mp4", "blue", "320x180", 24, True, duration=2.0)
    copied = workdir / "copied.mp4"
    result = media.render_timeline(
        clips=[
            media.PreparedClip(kind="video", path=red),
            media.PreparedClip(kind="video", path=blue),
        ],
        output=copied,
        width=320,
        height=180,
        fps=24,
    )
    assert result["copied"], result
    assert (result["width"], result["height"]) == (320, 180), result
    assert 3.8 <= result["durationSeconds"] <= 4.2, result
    assert frame_rgb(copied, 0.5)[0] > 200, "first clip is not red"
    assert frame_rgb(copied, 3.0)[2] > 200, "second clip is not blue"

    slide = make_image(workdir / "slide.png", "green", "320x180")
    narr = make_wav(workdir / "narr.wav", duration=1.2)
    composed = workdir / "composed.mp4"
    srt = workdir / "composed.srt"
    result = media.render_timeline(
        clips=[
            media.PreparedClip(
                kind="video",
                path=red,
                source_audio="duck",
                narrations=[
                    media.PreparedNarration(
                        path=narr,
                        offset=0.0,
                        cues=[media.TimedCue(start=0.0, end=1.2, text="第一幕繁體中文字幕")],
                    )
                ],
                overlays=[media.PreparedOverlay(start=0.0, end=1.8, lines=["步驟 1", "開機檢查"])],
            ),
            media.PreparedClip(
                kind="image",
                path=slide,
                duration=2.0,
                narrations=[
                    media.PreparedNarration(
                        path=narr,
                        offset=0.1,
                        cues=[media.TimedCue(start=0.0, end=1.2, text="第二幕靜態圖解說明")],
                    )
                ],
            ),
        ],
        output=composed,
        width=640,
        height=360,
        fps=24,
        transition="fade",
        transition_duration=0.5,
        burn_subtitles=True,
        subtitle_output=srt,
    )
    assert not result["copied"], result
    assert (result["width"], result["height"]) == (640, 360), result
    # 2.0s + 2.0s - 0.5s fade = 3.5s
    assert 3.3 <= result["durationSeconds"] <= 3.7, result
    probed = media.probe(composed)
    assert probed["audio"] and probed["audio"][0] == "aac", probed
    srt_text = srt.read_text(encoding="utf-8")
    assert "第一幕繁體中文字幕" in srt_text and "第二幕靜態圖解說明" in srt_text, srt_text
    assert "00:00:01,600 --> 00:00:02,800" in srt_text, srt_text
    return slide, narr


def check_routes(clip: Path, slide: Path, narr: Path) -> None:
    uploaded: dict[str, bytes] = {}
    video_url = "https://demo.blob.core.windows.net/generated/a.mp4?sig=x"
    slide_url = "https://demo.blob.core.windows.net/generated/slide.png?sig=s"
    narr_url = "https://demo.blob.core.windows.net/generated/narr.wav?sig=n"
    frame_url = "https://demo.blob.core.windows.net/generated/a.png?sig=y"
    output_url = "https://demo.blob.core.windows.net/generated/render.mp4?sig=z"
    subtitle_url = "https://demo.blob.core.windows.net/generated/subtitles.srt?sig=sub"

    files = {video_url: clip, slide_url: slide, narr_url: narr}
    blob.download = lambda url, target: shutil.copyfile(files[url], target)

    def fake_upload(url: str, source: Path, content_type: str) -> int:
        uploaded[url] = source.read_bytes()
        return len(uploaded[url])

    blob.upload = fake_upload
    client = TestClient(main.app)

    assert client.get("/health").status_code == 200

    denied = client.post("/last-frame", json={"videoUrl": video_url, "frameUrl": frame_url})
    assert denied.status_code == 401, denied.text

    headers = {"X-Pixora-Service-Key": "smoke-secret"}
    rejected = client.post(
        "/last-frame",
        headers=headers,
        json={"videoUrl": "http://169.254.169.254/latest?x=1", "frameUrl": frame_url},
    )
    assert rejected.status_code == 400, rejected.text

    response = client.post(
        "/last-frame", headers=headers, json={"videoUrl": video_url, "frameUrl": frame_url}
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["width"] == 320 and body["height"] == 180, body
    assert uploaded[frame_url][:8] == b"\x89PNG\r\n\x1a\n"

    rendered = client.post(
        "/render",
        headers=headers,
        json={
            "width": 640,
            "height": 360,
            "fps": 24,
            "transition": "fade",
            "transitionDuration": 0.5,
            "burnSubtitles": True,
            "clips": [
                {
                    "kind": "video",
                    "url": video_url,
                    "sourceAudio": "mute",
                    "narrations": [
                        {
                            "url": narr_url,
                            "offset": 0,
                            "cues": [{"start": 0.0, "end": 1.1, "text": "動態畫面說明"}],
                        }
                    ],
                },
                {
                    "kind": "image",
                    "url": slide_url,
                    "duration": 2.0,
                    "overlays": [{"start": 0.0, "end": 2.0, "lines": ["重點整理"]}],
                },
            ],
            "outputUrl": output_url,
            "subtitleUrl": subtitle_url,
        },
    )
    assert rendered.status_code == 200, rendered.text
    body = rendered.json()
    assert not body["copied"] and body["contentType"] == "video/mp4", body
    assert 3.3 <= body["durationSeconds"] <= 3.7, body
    assert body["sizeBytes"] == len(uploaded[output_url])
    assert body["subtitleSizeBytes"] == len(uploaded[subtitle_url])
    assert "動態畫面說明" in uploaded[subtitle_url].decode("utf-8")
    assert not any(Path(os.environ["VIDEO_RENDER_WORKDIR"]).iterdir()), "workdir not cleaned"


def main_smoke() -> int:
    workdir = Path(tempfile.mkdtemp())
    try:
        clip = check_last_frame(workdir)
        slide, narr = check_timeline(workdir)
        check_routes(clip, slide, narr)
    finally:
        shutil.rmtree(workdir, ignore_errors=True)
    print("video-render smoke test passed")
    return 0


if __name__ == "__main__":
    sys.exit(main_smoke())
