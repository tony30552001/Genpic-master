"""Build-time smoke test. Runs inside the image without network or storage.

1. Encodes a clip that is red for one second, then blue, and asserts the
   extracted last frame is blue at the source resolution.
2. Drives the HTTP routes with blob transfer replaced by local file copies.
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


def check_routes(clip: Path, workdir: Path) -> None:
    uploaded: dict[str, bytes] = {}
    blob.download = lambda url, target: shutil.copyfile(clip, target)

    def fake_upload(url: str, source: Path, content_type: str) -> int:
        uploaded[url] = source.read_bytes()
        return len(uploaded[url])

    blob.upload = fake_upload
    client = TestClient(main.app)
    video_url = "https://demo.blob.core.windows.net/generated/a.mp4?sig=x"
    frame_url = "https://demo.blob.core.windows.net/generated/a.png?sig=y"

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
    assert body["sizeBytes"] == len(uploaded[frame_url])
    assert not any(Path(os.environ["VIDEO_RENDER_WORKDIR"]).iterdir()), "workdir not cleaned"


def main_smoke() -> int:
    workdir = Path(tempfile.mkdtemp())
    try:
        clip = check_last_frame(workdir)
        check_routes(clip, workdir)
    finally:
        shutil.rmtree(workdir, ignore_errors=True)
    print("video-render smoke test passed")
    return 0


if __name__ == "__main__":
    sys.exit(main_smoke())
