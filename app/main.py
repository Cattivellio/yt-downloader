from __future__ import annotations

import asyncio
import json
import re
import shutil
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import FileResponse, HTMLResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from starlette.background import BackgroundTask

from .config import BASE_DIR, TEMP_DIR
from .downloader import get_info, manager
from .models import InfoRequest, InfoResponse, PlaylistDownloadRequest


templates = Jinja2Templates(directory=str(BASE_DIR / "templates"))


@asynccontextmanager
async def lifespan(app: FastAPI):
    TEMP_DIR.mkdir(parents=True, exist_ok=True)
    yield


app = FastAPI(title="VidDown", lifespan=lifespan)
app.mount("/static", StaticFiles(directory=str(BASE_DIR / "static")), name="static")


_SUPPORTED_URL_RE = re.compile(
    r"(https?://)?([\w-]+\.)?(youtube\.com|youtu\.be|instagram\.com|instagr\.am|[\w-]+\.tiktok\.com|tiktok\.com)/.+$",
    re.IGNORECASE,
)


def _format_label(kind: str, quality: Optional[int]) -> str:
    if kind == "audio":
        return f"MP3 · {quality or 192} kbps"
    return f"MP4 · {quality or 1080}p"


@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})


@app.get("/share", response_class=HTMLResponse)
async def share(
    request: Request,
    url: str = Query(..., min_length=1),
    kind: str = Query("video", pattern="^(video|audio)$"),
    quality: Optional[int] = Query(None, ge=1, le=4320),
):
    if not _SUPPORTED_URL_RE.match(url):
        raise HTTPException(status_code=400, detail="Not a valid URL (YouTube / Instagram / TikTok)")
    label = _format_label(kind, quality)
    return templates.TemplateResponse(
        "share.html",
        {
            "request": request,
            "url": url,
            "kind": kind,
            "quality": quality,
            "label": label,
        },
    )


@app.post("/api/download-playlist")
async def api_download_playlist(payload: PlaylistDownloadRequest):
    url = str(payload.url).strip()
    if not _SUPPORTED_URL_RE.match(url):
        raise HTTPException(status_code=400, detail="Not a valid URL (YouTube / Instagram / TikTok)")
    try:
        zip_path, zip_name = await manager.download_playlist(
            request_id=payload.request_id,
            playlist_url=url,
            kind=payload.kind,
            quality=payload.quality,
        )
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"Playlist download failed: {exc}") from exc

    def _cleanup() -> None:
        try:
            shutil.rmtree(zip_path.parent, ignore_errors=True)
        except Exception:  # noqa: BLE001
            pass

    return FileResponse(
        path=str(zip_path),
        media_type="application/zip",
        filename=zip_name,
        background=BackgroundTask(_cleanup),
    )


@app.post("/api/info", response_model=InfoResponse)
async def api_info(payload: InfoRequest):
    url = str(payload.url).strip()
    if not _SUPPORTED_URL_RE.match(url):
        raise HTTPException(status_code=400, detail="Not a valid URL (YouTube / Instagram / TikTok)")
    try:
        info = await asyncio.get_running_loop().run_in_executor(None, get_info, url)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"Failed to fetch info: {exc}") from exc
    return info


@app.get("/api/download")
async def api_download(
    url: str = Query(..., min_length=1),
    kind: str = Query("video", pattern="^(video|audio)$"),
    quality: Optional[int] = Query(None, ge=1, le=4320),
    request_id: str = Query(..., min_length=4, max_length=64),
):
    if not _SUPPORTED_URL_RE.match(url):
        raise HTTPException(status_code=400, detail="Not a valid URL (YouTube / Instagram / TikTok)")

    try:
        file_path, filename = await manager.download(
            request_id=request_id, url=url, kind=kind, quality=quality
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"Download failed: {exc}") from exc

    def _cleanup() -> None:
        try:
            shutil.rmtree(file_path.parent, ignore_errors=True)
        except Exception:  # noqa: BLE001
            pass

    return FileResponse(
        path=str(file_path),
        media_type="application/octet-stream",
        filename=filename,
        background=BackgroundTask(_cleanup),
    )


@app.get("/api/progress")
async def api_progress(request: Request, request_id: str = Query(..., min_length=4, max_length=64)):
    queue = await manager.subscribe(request_id)

    async def event_stream():
        try:
            while True:
                if await request.is_disconnected():
                    break
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=15.0)
                except asyncio.TimeoutError:
                    yield ": keep-alive\n\n"
                    continue
                yield f"data: {json.dumps(event)}\n\n"
        finally:
            await manager.unsubscribe(request_id, queue)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


@app.get("/api/health")
async def health():
    return {"ok": True}
