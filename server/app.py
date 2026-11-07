# /// script
# requires-python = "==3.13.*"
# dependencies = [
#   "fastapi", "uvicorn", "httpx", "anthropic",
#   "torch", "open_clip_torch", "pillow", "numpy", "rapidfuzz",
#   "pyobjc-framework-Vision", "pyobjc-framework-Quartz",
# ]
# ///
"""Holio photo identification: POST /v1/identify, per contract/identify.md."""
import base64
import binascii
import io
import json
import logging
import os
import sys
import threading
import time
from contextlib import asynccontextmanager
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Literal

sys.path.insert(0, str(Path(__file__).resolve().parent))

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from PIL import Image
from pydantic import BaseModel, Field

import engine as eng
from decide import Locale, decide

ROOT = Path(__file__).resolve().parents[1]
DEMO = ROOT / "demo"
DIST = ROOT / "app" / "dist"
RUNS = Path(__file__).resolve().parent / "runs"
MAX_PHOTO_BYTES = 6 * 1024 * 1024
IMAGE_SCHEMES = ("http://", "https://", "/", "data:")

log = logging.getLogger("hpi")


# ---------- boundary ----------

class CandidateIn(BaseModel):
    sku: str = Field(min_length=1)
    name: str = Field(min_length=1)
    brand: str | None = None
    size: str | None = None
    image: str = Field(min_length=1)


class IdentifyRequest(BaseModel):
    photos: list[str] = Field(min_length=1, max_length=2)
    candidates: list[CandidateIn] = Field(min_length=1, max_length=500)
    scannedCode: str | None = None
    context: Literal["receiving", "returns", "counting", "lookup"]
    locale: Locale


class CandidateOut(BaseModel):
    sku: str
    likelihood: Literal["most_likely", "possible"]


class IdentifyResponse(BaseModel):
    status: Literal["match", "choose", "none"]
    candidates: list[CandidateOut]
    evidence: str
    readText: list[str]
    ms: int


class InvalidRequest(Exception):
    pass


@dataclass(frozen=True)
class IdentifyInput:
    photos: tuple[bytes, ...]
    candidates: tuple[eng.Candidate, ...]
    scanned_code: str | None
    context: str
    locale: Locale


def decode_photo(i: int, raw: str) -> bytes:
    field = f"photos[{i}]"
    b64 = raw.partition(",")[2] if raw.startswith("data:") else raw
    try:
        data = base64.b64decode(b64, validate=True)
    except (binascii.Error, ValueError):
        raise InvalidRequest(f"{field}: not valid base64") from None
    if len(data) > MAX_PHOTO_BYTES:
        raise InvalidRequest(f"{field}: {len(data)} bytes decoded, the limit is {MAX_PHOTO_BYTES}")
    try:
        with Image.open(io.BytesIO(data)) as im:
            fmt = im.format
            im.verify()
    except Exception:
        raise InvalidRequest(f"{field}: not a readable image") from None
    if fmt not in ("JPEG", "PNG"):
        raise InvalidRequest(f"{field}: {fmt} image, only JPEG and PNG are accepted")
    return data


def parse(req: IdentifyRequest) -> IdentifyInput:
    seen: set[str] = set()
    cands = []
    for i, c in enumerate(req.candidates):
        if c.sku in seen:
            raise InvalidRequest(f"candidates[{i}].sku: duplicate sku {c.sku}")
        seen.add(c.sku)
        if not c.image.startswith(IMAGE_SCHEMES):
            raise InvalidRequest(f"candidates[{i}].image: must be an http(s) URL, a path such as /demo/..., or a data: URI")
        cands.append(eng.Candidate(c.sku, c.name, c.brand or "", c.size or "", c.image))
    photos = tuple(decode_photo(i, p) for i, p in enumerate(req.photos))
    return IdentifyInput(photos, tuple(cands), req.scannedCode, req.context, req.locale)


def field_path(loc: tuple) -> str:
    out = ""
    for part in loc[1:] if loc and loc[0] == "body" else loc:
        out += f"[{part}]" if isinstance(part, int) else (f".{part}" if out else str(part))
    return out or "body"


# ---------- app ----------

ENGINE = eng.Engine(static_root=DEMO, static_prefix="/demo/")


def warm_up() -> None:
    t0 = time.monotonic()
    try:
        ENGINE.clip()
        items = json.loads((DEMO / "register" / "register.json").read_text())["items"]
        ENGINE.index([eng.Candidate(it["sku"], it["name"], it.get("brand") or "", it.get("size") or "",
                                    f"/demo/register/{it['image']}") for it in items])
        log.info("warm: clip loaded, %d register images indexed in %d ms", ENGINE.indexed,
                 (time.monotonic() - t0) * 1000)
    except Exception:
        log.exception("warm-up failed")


@asynccontextmanager
async def lifespan(_: FastAPI):
    threading.Thread(target=warm_up, name="warm-up", daemon=True).start()
    yield


app = FastAPI(title="Holio photo identification", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@app.exception_handler(RequestValidationError)
async def on_validation_error(_: Request, exc: RequestValidationError):
    first = exc.errors()[0]
    where = "body" if first["type"] == "json_invalid" else field_path(tuple(first["loc"]))
    return JSONResponse({"error": "invalid_request", "detail": f"{where}: {first['msg']}"}, status_code=400)


@app.exception_handler(InvalidRequest)
async def on_invalid(_: Request, exc: InvalidRequest):
    return JSONResponse({"error": "invalid_request", "detail": str(exc)}, status_code=400)


@app.exception_handler(eng.ImageFetchFailed)
async def on_fetch_failed(_: Request, exc: eng.ImageFetchFailed):
    return JSONResponse({"error": "image_fetch_failed", "sku": exc.sku}, status_code=502)


@app.exception_handler(eng.ModelUnavailable)
async def on_unavailable(_: Request, __: eng.ModelUnavailable):
    return JSONResponse({"error": "model_unavailable"}, status_code=503)


@app.exception_handler(eng.ModelTimeout)
async def on_timeout(_: Request, __: eng.ModelTimeout):
    return JSONResponse({"error": "model_timeout"}, status_code=504)


@app.post("/v1/identify", response_model=IdentifyResponse)
def identify(req: IdentifyRequest) -> IdentifyResponse:
    t0 = time.monotonic()
    inp = parse(req)
    outcome = "error"
    try:
        result = ENGINE.identify(inp.photos, inp.candidates, inp.locale)
        d = decide(result.judgement, result.stage1, inp.locale)
        resp = IdentifyResponse(status=d.status,
                                candidates=[CandidateOut(sku=s, likelihood=lk) for s, lk in d.candidates],
                                evidence=d.evidence, readText=list(result.read_text),
                                ms=round((time.monotonic() - t0) * 1000))
        outcome = d.status
        save_run(inp, resp)
        return resp
    finally:
        log.info("identify status=%s candidates=%d context=%s code=%s ms=%d", outcome, len(inp.candidates),
                 inp.context, inp.scanned_code or "-", (time.monotonic() - t0) * 1000)


def save_run(inp: IdentifyInput, resp: IdentifyResponse) -> None:
    if os.environ.get("HPI_SAVE_RUNS") != "1":
        return
    d = RUNS / datetime.now().strftime("%Y%m%d-%H%M%S-%f")
    d.mkdir(parents=True)
    for i, data in enumerate(inp.photos, 1):
        (d / f"photo{i}{eng.image_ext(data)}").write_bytes(data)
    (d / "request.json").write_text(json.dumps({
        "context": inp.context, "locale": inp.locale, "scannedCode": inp.scanned_code,
        "candidates": [{**c.__dict__, "image": c.image[:64]} for c in inp.candidates]}, ensure_ascii=False, indent=1))
    (d / "response.json").write_text(resp.model_dump_json(indent=1))


@app.get("/healthz")
def healthz():
    return {"ok": True, "clipWarm": ENGINE.clip_warm, "indexedImages": ENGINE.indexed, "judge": eng.judge_backend()}


app.mount("/demo", StaticFiles(directory=DEMO), name="demo")


@app.get("/{path:path}", include_in_schema=False)
def spa(path: str):
    if not (DIST / "index.html").exists():
        return JSONResponse({"error": "not_found", "detail": "app/dist is not built"}, status_code=404)
    target = (DIST / path).resolve()
    if path and target.is_file() and target.is_relative_to(DIST.resolve()):
        return FileResponse(target)
    return FileResponse(DIST / "index.html")


if __name__ == "__main__":
    import uvicorn
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(message)s")
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("HPI_PORT", "8770")))
