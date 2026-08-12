"""HTTP surface for the ppt-master sidecar.

The Pixora Node backend owns the LLM authoring loop; this service only exposes
the deterministic Python half of the ppt-master pipeline.
"""

from __future__ import annotations

import logging
from typing import Annotated

from fastapi import Depends, FastAPI, File, Header, HTTPException, Response, UploadFile
from pydantic import BaseModel, Field

from . import config, skill

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ppt-master-service")

PPTX_CONTENT_TYPE = (
    "application/vnd.openxmlformats-officedocument.presentationml.presentation"
)
MAX_UPLOAD_BYTES = 50 * 1024 * 1024

app = FastAPI(title="Pixora ppt-master service", version="1.0.0")


def require_service_key(
    x_pixora_service_key: Annotated[str | None, Header()] = None,
) -> None:
    if x_pixora_service_key != config.get_service_key():
        raise HTTPException(status_code=401, detail="invalid service key")


Authenticated = Annotated[None, Depends(require_service_key)]


def skill_failure(error: skill.SkillError) -> HTTPException:
    logger.error(
        "skill command failed: %s (code=%s) stderr=%s",
        error,
        error.code,
        error.stderr.strip()[-2000:],
    )
    return HTTPException(
        status_code=502,
        detail={
            "message": str(error),
            "code": error.code,
            "stderr": error.stderr.strip()[-2000:],
            "stdout": error.stdout.strip()[-2000:],
        },
    )


async def read_upload(upload: UploadFile) -> bytes:
    payload = await upload.read()
    if not payload:
        raise HTTPException(status_code=400, detail="empty upload")
    if len(payload) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="upload exceeds 50MB limit")
    return payload


class CreateDeckRequest(BaseModel):
    name: str = Field(default="pixora_deck", max_length=80)
    canvasFormat: str | None = Field(default=None, max_length=32)


class WriteSlideRequest(BaseModel):
    content: str = Field(min_length=1, max_length=2_000_000)


class ExportDeckRequest(BaseModel):
    fileStem: str = Field(default="deck", max_length=60)


@app.get("/health")
def health() -> dict:
    integrity = skill.check_integrity()
    return {
        "status": "ok" if integrity.code == 0 else "degraded",
        "skillDir": str(config.SKILL_DIR),
        "integrity": {
            "ok": integrity.code == 0,
            "exitCode": integrity.code,
            "message": (integrity.stdout or integrity.stderr).strip()[-500:],
        },
    }


@app.get("/fonts")
def fonts(_: Authenticated) -> dict:
    return {"families": skill.installed_fonts()}


@app.get("/catalog")
def catalog(_: Authenticated) -> dict:
    try:
        return skill.read_catalog()
    except skill.SkillError as error:
        raise skill_failure(error) from error


@app.get("/catalog/{kind}/{template_id}/spec")
def template_spec(kind: str, template_id: str, _: Authenticated) -> dict:
    try:
        return {
            "kind": kind,
            "id": template_id,
            "spec": skill.read_template_spec(kind, template_id),
        }
    except skill.SkillError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@app.post("/sources/convert")
async def convert_source(_: Authenticated, file: UploadFile = File(...)) -> dict:
    payload = await read_upload(file)
    try:
        markdown = skill.convert_source(file.filename or "source.pdf", payload)
    except skill.SkillError as error:
        raise skill_failure(error) from error
    return {"markdown": markdown}


@app.post("/decks", status_code=201)
def create_deck(body: CreateDeckRequest, _: Authenticated) -> dict:
    try:
        return skill.create_deck(name=body.name, canvas_format=body.canvasFormat)
    except skill.SkillError as error:
        raise skill_failure(error) from error


@app.delete("/decks/{deck_id}", status_code=204)
def delete_deck(deck_id: str, _: Authenticated) -> Response:
    skill.delete_deck(deck_id)
    return Response(status_code=204)


@app.get("/decks/{deck_id}/svg")
def list_slides(deck_id: str, _: Authenticated) -> dict:
    try:
        return {"slides": skill.list_slides(deck_id)}
    except skill.SkillError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@app.put("/decks/{deck_id}/svg/{name}")
def write_slide(deck_id: str, name: str, body: WriteSlideRequest, _: Authenticated) -> dict:
    try:
        target = skill.write_slide(deck_id, name, body.content)
    except skill.SkillError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    return {"file": target.name, "bytes": len(body.content.encode("utf-8"))}


@app.delete("/decks/{deck_id}/svg/{name}", status_code=204)
def delete_slide(deck_id: str, name: str, _: Authenticated) -> Response:
    try:
        skill.delete_slide(deck_id, name)
    except skill.SkillError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    return Response(status_code=204)


@app.put("/decks/{deck_id}/images/{name}")
async def write_image(
    deck_id: str, name: str, _: Authenticated, file: UploadFile = File(...)
) -> dict:
    payload = await read_upload(file)
    try:
        target = skill.write_image(deck_id, name, payload)
    except skill.SkillError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    return {"file": target.name, "bytes": len(payload)}


@app.post("/decks/{deck_id}/check")
def check_deck(deck_id: str, _: Authenticated) -> dict:
    try:
        return skill.check_deck(deck_id)
    except skill.SkillError as error:
        raise skill_failure(error) from error


@app.post("/decks/{deck_id}/export")
def export_deck(deck_id: str, body: ExportDeckRequest, _: Authenticated) -> Response:
    try:
        payload = skill.export_deck(deck_id, file_stem=body.fileStem)
    except skill.SkillError as error:
        raise skill_failure(error) from error
    return Response(
        content=payload,
        media_type=PPTX_CONTENT_TYPE,
        headers={"Content-Disposition": f'attachment; filename="{body.fileStem}.pptx"'},
    )
