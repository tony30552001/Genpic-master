"""Zero-AI smoke test for the ppt-master pipeline.

Mirrors the upstream script-only check: author a minimal SVG roster, run the
quality gate, export a deck, and assert the package contains native slide XML.
Run inside the container image after a build.
"""

from __future__ import annotations

import sys
import zipfile
from io import BytesIO

from app import skill

COVER_SVG = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720" data-pptx-page-role="cover">
  <rect x="0" y="0" width="1280" height="720" fill="#FFFFFF"/>
  <g id="cover-title" data-pptx-bounds="96 260 1088 140">
    <text x="96" y="330" font-family="DejaVu Sans, sans-serif" font-size="56" font-weight="700" fill="#1E293B">Pixora Smoke Deck</text>
    <text x="96" y="390" font-family="DejaVu Sans, sans-serif" font-size="24" fill="#475569">Headless pipeline verification</text>
  </g>
</svg>
"""

CONTENT_SVG = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720" data-pptx-page-role="content">
  <rect x="0" y="0" width="1280" height="720" fill="#FFFFFF"/>
  <g id="content-heading" data-pptx-bounds="96 88 1088 72">
    <text x="96" y="140" font-family="DejaVu Sans, sans-serif" font-size="40" font-weight="700" fill="#1E293B">Deterministic export</text>
  </g>
  <g id="content-points" data-pptx-bounds="96 216 1088 240">
    <text x="96" y="260" font-family="DejaVu Sans, sans-serif" font-size="24" fill="#475569">Quality gate runs before every export.</text>
    <text x="96" y="316" font-family="DejaVu Sans, sans-serif" font-size="24" fill="#475569">Shapes stay natively editable in PowerPoint.</text>
    <text x="96" y="372" font-family="DejaVu Sans, sans-serif" font-size="24" fill="#475569">No agent participates in this run.</text>
  </g>
</svg>
"""


def main() -> int:
    integrity = skill.check_integrity()
    if integrity.code != 0:
        print(f"[FAIL] attribution guard exit={integrity.code}\n{integrity.stdout}{integrity.stderr}")
        return 1
    print("[OK] attribution guard passed")

    deck = skill.create_deck(name="pixora_smoke")
    deck_id = deck["deckId"]
    print(f"[OK] deck created: {deck_id} ({deck['projectName']})")

    try:
        skill.write_slide(deck_id, "01_cover.svg", COVER_SVG)
        skill.write_slide(deck_id, "02_content.svg", CONTENT_SVG)

        report = skill.check_deck(deck_id)
        if not report["passed"]:
            print(f"[FAIL] quality gate rejected the roster: {report}")
            return 1
        print(f"[OK] quality gate passed for {len(report['files'])} slide(s)")

        payload = skill.export_deck(deck_id, file_stem="pixora_smoke")
        with zipfile.ZipFile(BytesIO(payload)) as archive:
            names = set(archive.namelist())
            slide_xml = archive.read("ppt/slides/slide1.xml").decode("utf-8")
    finally:
        skill.delete_deck(deck_id)

    expected = {"ppt/slides/slide1.xml", "ppt/slides/slide2.xml", "ppt/presentation.xml"}
    missing = expected - names
    if missing:
        print(f"[FAIL] exported package is missing parts: {sorted(missing)}")
        return 1
    if "Pixora Smoke Deck" not in slide_xml:
        print("[FAIL] slide1.xml does not contain the authored text")
        return 1
    if "<p:sp>" not in slide_xml:
        print("[FAIL] slide1.xml contains no native shapes")
        return 1

    print(f"[OK] exported {len(payload)} bytes with native shapes")
    print("[PASS] ppt-master pipeline smoke test succeeded")
    return 0


if __name__ == "__main__":
    sys.exit(main())
