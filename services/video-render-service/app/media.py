"""ffmpeg operations. Every command is a fixed argument list; no shell."""

from __future__ import annotations

import json
import subprocess
from dataclasses import dataclass, field
from pathlib import Path

from . import config


class MediaError(Exception):
    def __init__(self, message: str, stderr: str = "") -> None:
        detail = (stderr or "").strip()
        full = f"{message}: {detail[-600:]}" if detail else message
        super().__init__(full)
        self.stderr = stderr


@dataclass
class TimedCue:
    start: float
    end: float
    text: str


@dataclass
class PreparedNarration:
    path: Path
    offset: float = 0.0
    cues: list[TimedCue] = field(default_factory=list)


@dataclass
class PreparedOverlay:
    start: float
    end: float
    lines: list[str]


@dataclass
class PreparedClip:
    kind: str  # "video" | "image"
    path: Path
    duration: float | None = None
    source_audio: str = "keep"  # "keep" | "duck" | "mute"
    narrations: list[PreparedNarration] = field(default_factory=list)
    overlays: list[PreparedOverlay] = field(default_factory=list)


def _run(
    args: list[str],
    timeout: int = config.COMMAND_TIMEOUT,
    cwd: Path | None = None,
) -> str:
    try:
        completed = subprocess.run(
            args,
            capture_output=True,
            text=True,
            timeout=timeout,
            cwd=str(cwd) if cwd else None,
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


def _can_stream_copy(
    clips: list[PreparedClip],
    probed: list[dict],
    transition: str,
    burn_subtitles: bool,
) -> bool:
    if len(clips) < 2 or transition != "cut" or burn_subtitles:
        return False
    if any(
        c.kind != "video" or c.source_audio != "keep" or c.narrations or c.overlays
        for c in clips
    ):
        return False
    first = probed[0]
    if first["video"][0] != "h264":
        return False
    if first["audio"] is not None and first["audio"][0] != "aac":
        return False
    return all(p["video"] == first["video"] and p["audio"] == first["audio"] for p in probed)


def _concat_copy(sources: list[Path], probed: list[dict], output: Path) -> None:
    listing = output.with_suffix(".txt")
    listing.write_text(
        "".join("file '{}'\n".format(str(p).replace("'", "'\\''")) for p in sources),
        encoding="utf-8",
    )
    audio = ["-map", "0:a:0"] if probed[0]["audio"] else []
    _run([
        "ffmpeg", "-v", "error", "-y",
        "-f", "concat", "-safe", "0", "-i", str(listing),
        "-map", "0:v:0", *audio, "-c", "copy", "-movflags", "+faststart",
        str(output),
    ], timeout=config.RENDER_TIMEOUT)


def _format_ass_time(seconds: float) -> str:
    total_cs = max(0, round(seconds * 100))
    cs = total_cs % 100
    total_s = total_cs // 100
    s = total_s % 60
    total_m = total_s // 60
    m = total_m % 60
    h = total_m // 60
    return f"{h}:{m:02d}:{s:02d}.{cs:02d}"


def _format_srt_time(seconds: float) -> str:
    total_ms = max(0, round(seconds * 1000))
    ms = total_ms % 1000
    total_s = total_ms // 1000
    s = total_s % 60
    total_m = total_s // 60
    m = total_m % 60
    h = total_m // 60
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def _escape_ass(text: str) -> str:
    return (
        text.replace("\\", "\\\\")
        .replace("{", "\\{")
        .replace("}", "\\}")
        .replace("\r\n", "\n")
        .replace("\n", "\\N")
    )


def _write_srt(path: Path, cues: list[TimedCue]) -> None:
    blocks = []
    for index, cue in enumerate(cues, start=1):
        blocks.append(
            f"{index}\n{_format_srt_time(cue.start)} --> {_format_srt_time(cue.end)}\n{cue.text}"
        )
    path.write_text("\n\n".join(blocks) + "\n", encoding="utf-8")


def _write_ass(
    path: Path,
    width: int,
    height: int,
    subtitle_cues: list[TimedCue],
    overlays: list[PreparedOverlay],
) -> None:
    sub_font_size = max(22, min(int(height * 0.044), int(width * 0.055)))
    overlay_font_size = max(24, min(int(height * 0.046), int(width * 0.058)))
    margin_h = max(24, int(width * 0.05))
    margin_v = max(24, int(height * 0.055))
    lines = [
        "[Script Info]",
        "ScriptType: v4.00+",
        f"PlayResX: {width}",
        f"PlayResY: {height}",
        "WrapStyle: 1",
        "ScaledBorderAndShadow: yes",
        "",
        "[V4+ Styles]",
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
        f"Style: Subtitle,Noto Sans CJK TC,{sub_font_size},&H00FFFFFF,&H000000FF,&H00121212,&H90000000,0,0,0,0,100,100,0,0,1,2.6,1.2,2,{margin_h},{margin_h},{margin_v},1",
        f"Style: OnScreen,Noto Sans CJK TC,{overlay_font_size},&H00FFFFFF,&H000000FF,&H88000000,&H88000000,-1,0,0,0,100,100,0,0,3,12,0,8,{margin_h},{margin_h},{margin_v},1",
        "",
        "[Events]",
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ]
    for cue in subtitle_cues:
        lines.append(
            f"Dialogue: 0,{_format_ass_time(cue.start)},{_format_ass_time(cue.end)},Subtitle,,0,0,0,,{_escape_ass(cue.text)}"
        )
    for overlay in overlays:
        joined = "\\N".join(_escape_ass(line) for line in overlay.lines)
        lines.append(
            f"Dialogue: 1,{_format_ass_time(overlay.start)},{_format_ass_time(overlay.end)},OnScreen,,0,0,0,,{joined}"
        )
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def render_timeline(
    *,
    clips: list[PreparedClip],
    output: Path,
    width: int = 1920,
    height: int = 1080,
    fps: int = 24,
    transition: str = "cut",
    transition_duration: float = 0.5,
    burn_subtitles: bool = False,
    subtitle_output: Path | None = None,
) -> dict:
    """Compose clips (videos and/or static images), optional transitions, source
    audio ducking/muting, narration tracks, on-screen text and ASS subtitles in
    a single ffmpeg pass."""
    if not clips:
        raise MediaError("at least one clip is required")

    probed: list[dict] = []
    durations: list[float] = []
    for clip in clips:
        if clip.kind == "video":
            info = probe(clip.path)
            if info["duration"] <= 0:
                raise MediaError(f"{clip.path.name} has zero duration")
            probed.append(info)
            durations.append(info["duration"])
        else:
            w, h = image_size(clip.path)
            dur = float(clip.duration or 0)
            if dur <= 0:
                raise MediaError(f"image clip {clip.path.name} requires positive duration")
            probed.append({"video": ("image", w, h, "", ""), "audio": None, "width": w, "height": h, "duration": dur})
            durations.append(dur)

    if _can_stream_copy(clips, probed, transition, burn_subtitles):
        _concat_copy([c.path for c in clips], probed, output)
        if not output.exists() or output.stat().st_size == 0:
            raise MediaError("ffmpeg produced no video")
        result = probe(output)
        return {
            "width": result["width"],
            "height": result["height"],
            "durationSeconds": round(result["duration"], 3),
            "copied": True,
        }

    # Compute exact timeline start offset for every clip after accounting for
    # valid crossfade overlaps so narration, ASS and SRT stay frame-accurate.
    clip_starts: list[float] = []
    fade_durations: list[float] = []  # fade_durations[i] applies between clip i-1 and clip i
    running_end = 0.0
    for idx, dur in enumerate(durations):
        if idx == 0:
            clip_starts.append(0.0)
            fade_durations.append(0.0)
            running_end = dur
        else:
            if transition == "fade":
                fade = min(transition_duration, durations[idx - 1] * 0.4, dur * 0.4)
                fade = round(fade, 3) if fade >= 0.05 else 0.0
            else:
                fade = 0.0
            start = max(0.0, running_end - fade)
            clip_starts.append(start)
            fade_durations.append(fade)
            running_end = start + dur
    total_duration = running_end

    # Collect timeline-aligned cues and overlays.
    all_cues: list[TimedCue] = []
    all_overlays: list[PreparedOverlay] = []
    scheduled_narrations: list[tuple[Path, float]] = []
    for idx, clip in enumerate(clips):
        c_start = clip_starts[idx]
        c_end = c_start + durations[idx]
        for narration in clip.narrations:
            n_start = c_start + narration.offset
            scheduled_narrations.append((narration.path, n_start))
            for cue in narration.cues:
                start_t = min(total_duration, max(0.0, n_start + cue.start))
                end_t = min(total_duration, max(start_t + 0.1, n_start + cue.end))
                all_cues.append(TimedCue(start=start_t, end=end_t, text=cue.text))
        for overlay in clip.overlays:
            start_t = min(c_end, max(c_start, c_start + overlay.start))
            end_t = min(c_end, max(start_t + 0.1, c_start + overlay.end))
            all_overlays.append(PreparedOverlay(start=start_t, end=end_t, lines=overlay.lines))

    all_cues.sort(key=lambda item: (item.start, item.end))
    if subtitle_output and all_cues:
        _write_srt(subtitle_output, all_cues)

    ass_cues = all_cues if burn_subtitles else []
    ass_path: Path | None = None
    if ass_cues or all_overlays:
        ass_path = output.parent / "overlays.ass"
        _write_ass(ass_path, width, height, ass_cues, all_overlays)

    has_source_audio = any(
        clips[i].kind == "video" and probed[i]["audio"] is not None and clips[i].source_audio != "mute"
        for i in range(len(clips))
    )
    has_any_audio = has_source_audio or bool(scheduled_narrations)

    inputs: list[str] = []
    filters: list[str] = []
    clip_input_indices: list[int] = []
    next_input = 0

    for idx, clip in enumerate(clips):
        dur = durations[idx]
        if clip.kind == "image":
            inputs += ["-loop", "1", "-framerate", str(fps), "-t", f"{dur:.3f}", "-i", str(clip.path)]
        else:
            inputs += ["-i", str(clip.path)]
        clip_input_indices.append(next_input)
        next_input += 1

    # Normalize each clip's video and (when needed) audio streams.
    for idx, clip in enumerate(clips):
        in_idx = clip_input_indices[idx]
        dur = durations[idx]
        v_chain = (
            f"[{in_idx}:v:0]scale={width}:{height}:force_original_aspect_ratio=decrease,"
            f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:black,setsar=1,fps={fps},settb=1/{fps},format=yuv420p"
        )
        if clip.kind == "image":
            v_chain += f",trim=duration={dur:.3f}"
        v_chain += f",setpts=PTS-STARTPTS[v{idx}]"
        filters.append(v_chain)

        if has_any_audio:
            if clip.kind == "video" and probed[idx]["audio"] is not None and clip.source_audio != "mute":
                vol = ",volume=0.15" if clip.source_audio == "duck" else ""
                filters.append(
                    f"[{in_idx}:a:0]aresample=48000,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo{vol},asetpts=PTS-STARTPTS[a{idx}]"
                )
            else:
                filters.append(
                    f"anullsrc=channel_layout=stereo:sample_rate=48000,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,atrim=duration={dur:.3f},asetpts=PTS-STARTPTS[a{idx}]"
                )

    # Concatenate or crossfade clips.
    if len(clips) == 1:
        v_current = "v0"
        a_current = "a0" if has_any_audio else None
    elif transition == "cut" or all(f == 0.0 for f in fade_durations[1:]):
        if has_any_audio:
            pads = "".join(f"[v{i}][a{i}]" for i in range(len(clips)))
            filters.append(f"{pads}concat=n={len(clips)}:v=1:a=1[vbase][abase]")
            v_current, a_current = "vbase", "abase"
        else:
            pads = "".join(f"[v{i}]" for i in range(len(clips)))
            filters.append(f"{pads}concat=n={len(clips)}:v=1:a=0[vbase]")
            v_current, a_current = "vbase", None
    else:
        v_current = "v0"
        a_current = "a0" if has_any_audio else None
        for idx in range(1, len(clips)):
            fade = fade_durations[idx]
            v_next = f"vx{idx}"
            if fade > 0:
                filters.append(
                    f"[{v_current}][v{idx}]xfade=transition=fade:duration={fade:.3f}:offset={clip_starts[idx]:.3f}[{v_next}]"
                )
            else:
                filters.append(f"[{v_current}][v{idx}]concat=n=2:v=1:a=0[{v_next}]")
            v_current = v_next

            if has_any_audio and a_current is not None:
                a_next = f"ax{idx}"
                if fade > 0:
                    filters.append(
                        f"[{a_current}][a{idx}]acrossfade=d={fade:.3f}:c1=tri:c2=tri[{a_next}]"
                    )
                else:
                    filters.append(f"[{a_current}][a{idx}]concat=n=2:v=0:a=1[{a_next}]")
                a_current = a_next

    # Burn ASS subtitles and/or onScreenText overlays in the same pass.
    if ass_path is not None:
        filters.append(f"[{v_current}]ass={ass_path.name}[vfinal]")
        v_current = "vfinal"

    # Mix narration tracks at exact millisecond delays on top of base audio.
    if scheduled_narrations:
        mix_inputs: list[str] = []
        if has_source_audio and a_current is not None:
            filters.append(f"[{a_current}]apad=whole_dur={total_duration:.3f}[abased]")
            mix_inputs.append("[abased]")
        elif a_current is not None:
            # Base audio is pure silence; discard it cleanly via anullsink and mix narrations directly.
            filters.append(f"[{a_current}]anullsink")
        for n_idx, (n_path, n_start) in enumerate(scheduled_narrations):
            inputs += ["-i", str(n_path)]
            in_idx = next_input
            next_input += 1
            delay_ms = max(0, round(n_start * 1000))
            delay_part = f",adelay={delay_ms}|{delay_ms}" if delay_ms > 0 else ""
            filters.append(
                f"[{in_idx}:a:0]aresample=48000,aformat=channel_layouts=stereo{delay_part},"
                f"apad=whole_dur={total_duration:.3f}[narr{n_idx}]"
            )
            mix_inputs.append(f"[narr{n_idx}]")
        if len(mix_inputs) == 1:
            filters.append(f"{mix_inputs[0]}atrim=duration={total_duration:.3f}[afinal]")
        else:
            filters.append(
                f"{''.join(mix_inputs)}amix=inputs={len(mix_inputs)}:duration=longest:normalize=0,"
                f"atrim=duration={total_duration:.3f},alimiter=limit=0.95[afinal]"
            )
        a_current = "afinal"

    audio_args = ["-map", f"[{a_current}]", "-c:a", "aac", "-b:a", "192k"] if a_current else []
    _run(
        [
            "ffmpeg", "-v", "error", "-y", *inputs,
            "-filter_complex", ";".join(filters),
            "-map", f"[{v_current}]", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
            "-pix_fmt", "yuv420p",
            *audio_args, "-movflags", "+faststart",
            str(output),
        ],
        timeout=config.RENDER_TIMEOUT,
        cwd=output.parent,
    )
    if not output.exists() or output.stat().st_size == 0:
        raise MediaError("ffmpeg produced no video")
    result = probe(output)
    return {
        "width": result["width"],
        "height": result["height"],
        "durationSeconds": round(result["duration"], 3),
        "copied": False,
    }