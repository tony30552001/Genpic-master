"""Thin, deterministic wrapper around the vendored ppt-master skill.

Everything here shells out to the official scripts. The skill directory is
treated as immutable: `attribution_guard.py` exits with code 78 when any of its
gate files, `LICENSE`, or `SKILL.md` metadata are modified.
"""

from __future__ import annotations

import json
import re
import shutil
import subprocess
import sys
import uuid
from dataclasses import dataclass
from pathlib import Path

from . import config

SAFE_NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$")
IMAGE_SUFFIXES = frozenset({".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"})
SOURCE_SUFFIXES = frozenset(
    {
        ".pdf", ".docx", ".doc", ".odt", ".rtf", ".pptx", ".txt", ".md",
        ".html", ".htm", ".epub", ".ipynb", ".xlsx", ".xlsm", ".csv",
    }
)
TEMPLATE_KINDS = {
    "brand": "brands",
    "style": "styles",
    "layout": "layouts",
    "deck": "decks",
}


class SkillError(RuntimeError):
    """A ppt-master script failed or was used incorrectly."""

    def __init__(self, message: str, *, stdout: str = "", stderr: str = "", code: int = 0):
        super().__init__(message)
        self.stdout = stdout
        self.stderr = stderr
        self.code = code


@dataclass(frozen=True)
class CommandResult:
    code: int
    stdout: str
    stderr: str


def _safe_name(name: str, allowed_suffixes: frozenset[str] | None = None) -> str:
    candidate = Path(name).name
    if not SAFE_NAME.match(candidate):
        raise SkillError(f"unsafe file name: {name!r}")
    if allowed_suffixes is not None and Path(candidate).suffix.lower() not in allowed_suffixes:
        raise SkillError(f"unsupported file extension: {name!r}")
    return candidate


def run_script(script: str, args: list[str], *, timeout: int | None = None) -> CommandResult:
    """Run one skill script from the skill directory."""
    script_path = config.SKILL_DIR / "scripts" / script
    if not script_path.is_file():
        raise SkillError(f"skill script not found: {script}")

    completed = subprocess.run(
        [sys.executable, str(script_path), *args],
        cwd=str(config.SKILL_DIR),
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=timeout or config.COMMAND_TIMEOUT,
    )
    return CommandResult(completed.returncode, completed.stdout, completed.stderr)


def check_integrity() -> CommandResult:
    """Run the upstream attribution guard. Exit code 78 means the skill was modified."""
    return run_script("attribution_guard.py", [], timeout=120)


def deck_root(deck_id: str) -> Path:
    return config.WORKDIR / _safe_name(deck_id)


def project_path(deck_id: str) -> Path:
    """Resolve the dated project directory created by project_manager.py init."""
    root = deck_root(deck_id)
    if not root.is_dir():
        raise SkillError(f"deck not found: {deck_id}")
    children = sorted(child for child in root.iterdir() if child.is_dir())
    if not children:
        raise SkillError(f"deck project directory missing: {deck_id}")
    return children[0]


def create_deck(*, name: str = "pixora_deck", canvas_format: str | None = None) -> dict:
    """Create a quick-generate project and return its identifiers."""
    deck_id = uuid.uuid4().hex
    root = deck_root(deck_id)
    root.mkdir(parents=True, exist_ok=False)

    project_name = re.sub(r"[^A-Za-z0-9_-]+", "_", name).strip("_") or "pixora_deck"
    result = run_script(
        "project_manager.py",
        [
            "init",
            project_name[:60],
            "--format",
            canvas_format or config.CANVAS_FORMAT,
            "--quick-generate",
            "--dir",
            str(root),
        ],
    )
    if result.code != 0:
        shutil.rmtree(root, ignore_errors=True)
        raise SkillError(
            "project_manager.py init failed",
            stdout=result.stdout,
            stderr=result.stderr,
            code=result.code,
        )

    project = project_path(deck_id)
    (project / "images").mkdir(exist_ok=True)
    return {"deckId": deck_id, "projectName": project.name}


def delete_deck(deck_id: str) -> None:
    shutil.rmtree(deck_root(deck_id), ignore_errors=True)


def write_slide(deck_id: str, name: str, content: str) -> Path:
    file_name = _safe_name(name, frozenset({".svg"}))
    target = project_path(deck_id) / "svg_output" / file_name
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")
    return target


def list_slides(deck_id: str) -> list[str]:
    slides = project_path(deck_id) / "svg_output"
    return sorted(item.name for item in slides.glob("*.svg"))


def delete_slide(deck_id: str, name: str) -> None:
    file_name = _safe_name(name, frozenset({".svg"}))
    (project_path(deck_id) / "svg_output" / file_name).unlink(missing_ok=True)


def write_image(deck_id: str, name: str, payload: bytes) -> Path:
    file_name = _safe_name(name, IMAGE_SUFFIXES)
    target = project_path(deck_id) / "images" / file_name
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(payload)
    return target


def check_deck(deck_id: str, *, canvas_format: str | None = None) -> dict:
    """Run the quality gate and return its structured report.

    Errors block the export; warnings are advisory and never block.
    """
    project = project_path(deck_id)
    result = run_script(
        "svg_quality_checker.py",
        [
            str(project),
            "--quick-generate",
            "--format",
            canvas_format or config.CANVAS_FORMAT,
            "--stage",
            "final",
            "--json",
        ],
    )

    report_path = project / "validation" / "svg_quality_report.json"
    if not report_path.is_file():
        raise SkillError(
            "svg_quality_checker.py produced no report",
            stdout=result.stdout,
            stderr=result.stderr,
            code=result.code,
        )

    report = json.loads(report_path.read_text(encoding="utf-8"))
    files = [
        {
            "file": entry.get("file"),
            "passed": bool(entry.get("passed")),
            "errors": list(entry.get("errors") or []),
            "warnings": list(entry.get("warnings") or []),
        }
        for entry in report.get("files") or []
    ]
    return {
        "passed": result.code == 0,
        "exitCode": result.code,
        "files": files,
        "projectIssues": list(report.get("project_issues") or []),
        "summary": report.get("summary") or {},
    }


def export_deck(deck_id: str, *, file_stem: str = "deck") -> bytes:
    """Compile svg_output/ into a native PPTX and return its bytes."""
    project = project_path(deck_id)
    output = deck_root(deck_id) / f"{_safe_name(f'{file_stem}.pptx', frozenset({'.pptx'}))}"
    result = run_script(
        "svg_to_pptx.py",
        [str(project), "--quick-generate", "-o", str(output)],
    )
    if result.code != 0 or not output.is_file():
        raise SkillError(
            "svg_to_pptx.py export failed",
            stdout=result.stdout,
            stderr=result.stderr,
            code=result.code,
        )
    return output.read_bytes()


def convert_source(name: str, payload: bytes) -> str:
    """Convert an uploaded document into Markdown via source_to_md.py."""
    file_name = _safe_name(name, SOURCE_SUFFIXES)
    staging = config.WORKDIR / "sources" / uuid.uuid4().hex
    staging.mkdir(parents=True, exist_ok=True)
    try:
        source = staging / file_name
        source.write_bytes(payload)
        output = staging / f"{source.stem}.md"
        result = run_script("source_to_md.py", [str(source), "-o", str(output)])
        if not output.is_file():
            raise SkillError(
                "source_to_md.py produced no Markdown",
                stdout=result.stdout,
                stderr=result.stderr,
                code=result.code,
            )
        return output.read_text(encoding="utf-8", errors="replace")
    finally:
        shutil.rmtree(staging, ignore_errors=True)


def read_catalog() -> dict:
    """Read the sanctioned template discovery indexes.

    Each index is a JSON object keyed by template id; it is the only supported
    discovery source, so the template directories are never scanned.
    """
    catalog: dict[str, list] = {}
    for kind, directory in TEMPLATE_KINDS.items():
        index_path = config.SKILL_DIR / "templates" / directory / f"{directory}_index.json"
        if not index_path.is_file():
            catalog[kind] = []
            continue
        data = json.loads(index_path.read_text(encoding="utf-8"))
        catalog[kind] = [
            {"id": template_id, "kind": kind, **(entry if isinstance(entry, dict) else {})}
            for template_id, entry in sorted(data.items())
        ]
    return catalog


def read_template_spec(kind: str, template_id: str) -> str:
    """Return a template's design_spec.md, which is prompt text for the model."""
    directory = TEMPLATE_KINDS.get(kind)
    if directory is None:
        raise SkillError(f"unknown template kind: {kind!r}")
    spec = (
        config.SKILL_DIR
        / "templates"
        / directory
        / _safe_name(template_id)
        / "templates"
        / "design_spec.md"
    )
    if not spec.is_file():
        raise SkillError(f"template spec not found: {kind}/{template_id}")
    return spec.read_text(encoding="utf-8")


def installed_fonts() -> list[str]:
    """List font families available to the exporter inside this container."""
    try:
        completed = subprocess.run(
            ["fc-list", "--format", "%{family[0]}\\n"],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=60,
        )
    except (OSError, subprocess.SubprocessError):
        return []
    if completed.returncode != 0:
        return []
    return sorted({line.strip() for line in completed.stdout.splitlines() if line.strip()})
