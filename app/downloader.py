from __future__ import annotations

import asyncio
import re
import shutil
import zipfile
from pathlib import Path
from typing import Any, Optional

from yt_dlp import YoutubeDL

from .config import COOKIE_FILE, FFMPEG_LOCATION, TEMP_DIR
from .models import FormatInfo, PlaylistEntry, PlaylistInfo, VideoInfo


QUALITY_TIERS = [1080, 720, 480, 360]
AUDIO_BITRATES = [320, 192, 128, 96]


def _format_bytes(num: Optional[float]) -> Optional[str]:
    if not num or num <= 0:
        return None
    units = ["B", "KB", "MB", "GB", "TB"]
    size = float(num)
    idx = 0
    while size >= 1024 and idx < len(units) - 1:
        size /= 1024
        idx += 1
    return f"{size:.1f} {units[idx]}" if idx else f"{int(size)} {units[idx]}"


def _parse_percent(s: str) -> float:
    if not s:
        return 0.0
    m = re.search(r"([\d.]+)\s*%", s.replace("\x1b[", ""))
    return float(m.group(1)) if m else 0.0


def _strip_ansi(s: str) -> str:
    return re.sub(r"\x1b\[[0-9;]*m", "", s or "")


def _duration_to_str(seconds: Optional[int]) -> str:
    if not seconds:
        return "—"
    h, rem = divmod(int(seconds), 3600)
    m, s = divmod(rem, 60)
    if h:
        return f"{h}:{m:02d}:{s:02d}"
    return f"{m}:{s:02d}"


def _common_ydl_opts(out_dir: Path, playlist_flat: bool = True) -> dict:
    opts: dict[str, Any] = {
        "quiet": True,
        "no_warnings": True,
        "noplaylist": not playlist_flat,
        "noprogress": True,
        "outtmpl": str(out_dir / "%(title).150B [%(id)s].%(ext)s"),
    }
    if FFMPEG_LOCATION:
        opts["ffmpeg_location"] = FFMPEG_LOCATION
    if COOKIE_FILE:
        opts["cookiefile"] = COOKIE_FILE
    return opts


def _pick_video_format(formats: list[dict], max_height: int) -> Optional[dict]:
    candidates = [
        f
        for f in formats
        if f.get("vcodec") not in (None, "none")
        and isinstance(f.get("height"), int)
        and 0 < f["height"] <= max_height
    ]
    if not candidates:
        return None
    return max(candidates, key=lambda f: (f.get("height") or 0, f.get("vbr") or f.get("tbr") or 0))


def _pick_audio_format(formats: list[dict]) -> Optional[dict]:
    candidates = [
        f
        for f in formats
        if f.get("acodec") not in (None, "none") and f.get("vcodec") in (None, "none")
    ]
    if not candidates:
        return None
    return max(candidates, key=lambda f: f.get("abr") or f.get("tbr") or 0)


def _estimate_size_bytes(formats: list[dict], max_height: int, duration: Optional[int]) -> Optional[float]:
    if not duration:
        return None
    video = _pick_video_format(formats, max_height)
    if not video:
        return None
    audio = _pick_audio_format(formats)
    vbr = (video.get("vbr") or video.get("tbr") or 0) * 1000
    abr = (audio.get("abr") or audio.get("tbr") or 0) * 1000 if audio else 0
    if not vbr and not abr:
        return None
    return ((vbr + abr) / 8.0) * duration


def _format_selector(max_height: int) -> str:
    return (
        f"bestvideo[height<={max_height}][ext=mp4]+bestaudio[ext=m4a]/"
        f"bestvideo[height<={max_height}]+bestaudio/"
        f"best[height<={max_height}][ext=mp4]/"
        f"best[height<={max_height}]/best"
    )


def _build_video_formats(formats: list[dict], duration: Optional[int]) -> list[FormatInfo]:
    out: list[FormatInfo] = []
    for tier in QUALITY_TIERS:
        f = _pick_video_format(formats, tier)
        if f:
            height = f.get("height") or tier
            vcodec = (f.get("vcodec") or "").split(".")[0] or None
            acodec = (f.get("acodec") or "").split(".")[0] or None
            out.append(
                FormatInfo(
                    id=f"video_{tier}",
                    label=f"{height}p MP4 · {vcodec or 'video'}{' + ' + acodec if acodec else ''}",
                    ext="mp4",
                    size_estimate=_format_bytes(_estimate_size_bytes(formats, tier, duration)),
                    note="Merged with best audio" if acodec is None else "Built-in audio",
                    has_audio=acodec is not None,
                    vcodec=vcodec,
                    acodec=acodec,
                    height=height,
                )
            )
        else:
            out.append(
                FormatInfo(
                    id=f"video_{tier}",
                    label=f"Up to {tier}p MP4",
                    ext="mp4",
                    size_estimate=None,
                    note="Best available at this resolution",
                    has_audio=False,
                    height=tier,
                )
            )
    return out


def _build_audio_formats(duration: Optional[int], bitrates: list[int] = AUDIO_BITRATES) -> list[FormatInfo]:
    out: list[FormatInfo] = []
    for bitrate in bitrates:
        size = None
        if duration:
            size = (bitrate * 1000 / 8) * duration
        size_str = _format_bytes(size)
        if bitrate == 320:
            note = "Best quality · ~2.4 MB/min"
        elif bitrate == 192:
            note = "High quality · ~1.4 MB/min"
        elif bitrate == 128:
            note = "Standard · ~1 MB/min"
        else:
            note = "Lightweight · ~0.7 MB/min"
        out.append(
            FormatInfo(
                id=f"audio_{bitrate}",
                label=f"MP3 · {bitrate} kbps",
                ext="mp3",
                size_estimate=size_str,
                note=note,
                has_audio=True,
                abr=float(bitrate),
            )
        )
    return out


def get_info(url: str) -> VideoInfo | PlaylistInfo:
    opts = _common_ydl_opts(TEMP_DIR, playlist_flat=False)
    opts["extract_flat"] = "in_playlist"
    with YoutubeDL(opts) as ydl:
        info = ydl.extract_info(url, download=False)

    if not info:
        raise ValueError("Could not extract info from URL")

    if info.get("_type") == "playlist":
        entries_raw = info.get("entries") or []
        entries: list[PlaylistEntry] = []
        total_duration = 0
        for e in entries_raw:
            if not e:
                continue
            dur = int(e.get("duration") or 0)
            total_duration += dur
            entries.append(
                PlaylistEntry(
                    id=e.get("id") or "",
                    title=e.get("title") or "Untitled",
                    channel=e.get("uploader") or e.get("channel") or "",
                    duration=dur,
                    duration_string=_duration_to_str(dur),
                    thumbnail=e.get("thumbnails", [{}])[-1].get("url", "") if e.get("thumbnails") else "",
                    webpage_url=e.get("url") or e.get("webpage_url") or "",
                )
            )
        avg_duration = total_duration // len(entries) if entries else None
        return PlaylistInfo(
            id=info.get("id") or "",
            title=info.get("title") or "Playlist",
            channel=info.get("uploader") or info.get("channel") or "",
            count=len(entries),
            entries=entries,
            webpage_url=info.get("webpage_url") or url,
            video_formats=_build_video_formats([], avg_duration),
            audio_formats=_build_audio_formats(avg_duration),
        )

    formats = info.get("formats") or []
    duration = info.get("duration")
    upload = info.get("upload_date")
    upload_str = f"{upload[6:8]}/{upload[4:6]}/{upload[0:4]}" if upload and len(upload) == 8 else None

    return VideoInfo(
        id=info.get("id") or "",
        title=info.get("title") or "Untitled",
        channel=info.get("uploader") or info.get("channel") or "",
        duration=int(duration or 0),
        duration_string=_duration_to_str(duration),
        thumbnail=info.get("thumbnail") or "",
        view_count=info.get("view_count"),
        upload_date=upload_str,
        webpage_url=info.get("webpage_url") or url,
        video_formats=_build_video_formats(formats, duration),
        audio_formats=_build_audio_formats(duration),
    )


class DownloadManager:
    """Owns a registry of progress listeners keyed by request id."""

    def __init__(self) -> None:
        self._listeners: dict[str, list[asyncio.Queue]] = {}
        self._lock = asyncio.Lock()
        self._batch_ctx: dict[str, dict[str, Any]] = {}

    async def subscribe(self, request_id: str) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=64)
        async with self._lock:
            self._listeners.setdefault(request_id, []).append(q)
        return q

    async def unsubscribe(self, request_id: str, q: asyncio.Queue) -> None:
        async with self._lock:
            if request_id in self._listeners:
                try:
                    self._listeners[request_id].remove(q)
                except ValueError:
                    pass
                if not self._listeners[request_id]:
                    self._listeners.pop(request_id, None)

    def _emit(self, request_id: str, event: dict) -> None:
        for q in list(self._listeners.get(request_id, [])):
            try:
                q.put_nowait(event)
            except asyncio.QueueFull:
                pass

    def progress_hook(self, request_id: str):
        def hook(d: dict) -> None:
            status = d.get("status")
            event: dict[str, Any] = {}
            ctx = self._batch_ctx.get(request_id)
            if ctx:
                event["item_index"] = ctx.get("item_index")
                event["item_title"] = ctx.get("item_title")
                event["batch_total"] = ctx.get("batch_total")
            if status == "downloading":
                event.update(
                    {
                        "type": "progress",
                        "percent": _parse_percent(_strip_ansi(d.get("_percent_str", ""))),
                        "speed": _strip_ansi(d.get("_speed_str", "")),
                        "eta": _strip_ansi(d.get("_eta_str", "")),
                        "downloaded": _strip_ansi(d.get("_downloaded_bytes_str", "")),
                        "total": _strip_ansi(
                            d.get("_total_bytes_str", "")
                            or d.get("_total_bytes_estimate_str", "")
                        ),
                    }
                )
                self._emit(request_id, event)
            elif status == "finished":
                event["type"] = "finished"
                event["filename"] = d.get("filename", "")
                self._emit(request_id, event)
            elif status == "error":
                event["type"] = "error"
                event["message"] = str(d.get("error", ""))
                self._emit(request_id, event)
        return hook

    def _build_download_opts(
        self,
        request_id: str,
        out_dir: Path,
        fmt: str,
        postprocessors: Optional[list[dict]] = None,
    ) -> dict:
        opts = _common_ydl_opts(out_dir, playlist_flat=False)
        opts["format"] = fmt
        opts["merge_output_format"] = "mp4"
        opts["progress_hooks"] = [self.progress_hook(request_id)]
        if postprocessors:
            opts["postprocessors"] = postprocessors
        return opts

    async def download(
        self,
        request_id: str,
        url: str,
        kind: str,
        quality: Optional[int] = None,
        emit_done: bool = True,
    ) -> tuple[Path, str]:
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(
            None, self._download_sync, request_id, url, kind, quality, emit_done
        )

    def _download_sync(
        self,
        request_id: str,
        url: str,
        kind: str,
        quality: Optional[int],
        emit_done: bool = True,
    ) -> tuple[Path, str]:
        out_dir = TEMP_DIR / request_id
        out_dir.mkdir(parents=True, exist_ok=True)

        if kind == "audio":
            bitrate = int(quality) if quality else 192
            opts = self._build_download_opts(
                request_id,
                out_dir,
                fmt="bestaudio/best",
                postprocessors=[
                    {
                        "key": "FFmpegExtractAudio",
                        "preferredcodec": "mp3",
                        "preferredquality": str(bitrate),
                    }
                ],
            )
        else:
            max_h = int(quality) if quality else 1080
            opts = self._build_download_opts(
                request_id, out_dir, fmt=_format_selector(max_h)
            )

        try:
            with YoutubeDL(opts) as ydl:
                info = ydl.extract_info(url, download=True)
                if info.get("_type") == "playlist":
                    raise ValueError("URL is a playlist — please use a single video URL")

                if kind == "audio":
                    final = self._find_file(out_dir, (".mp3", ".m4a", ".opus", ".webm", ".mkv"))
                else:
                    final = self._find_file(out_dir, (".mp4", ".mkv", ".webm"))

                if not final:
                    raise FileNotFoundError("yt-dlp finished but no output file was found")
                filename = final.name
                return final, filename
        finally:
            if emit_done:
                self._emit(request_id, {"type": "done"})

    async def download_playlist(
        self,
        request_id: str,
        playlist_url: str,
        kind: str,
        quality: Optional[int],
    ) -> tuple[Path, str]:
        info = await asyncio.get_running_loop().run_in_executor(
            None, get_info, playlist_url
        )
        if not isinstance(info, PlaylistInfo):
            raise ValueError("URL is not a playlist")

        out_dir = TEMP_DIR / request_id
        out_dir.mkdir(parents=True, exist_ok=True)

        files: list[tuple[Path, str]] = []
        total = len(info.entries)

        for i, entry in enumerate(info.entries):
            self._batch_ctx[request_id] = {
                "item_index": i,
                "item_title": entry.title,
                "batch_total": total,
            }
            self._emit(
                request_id,
                {
                    "type": "video_start",
                    "n": i + 1,
                    "total": total,
                    "title": entry.title,
                },
            )
            try:
                fp, fn = await self.download(
                    request_id=request_id,
                    url=entry.webpage_url,
                    kind=kind,
                    quality=quality,
                    emit_done=False,
                )
                dest = out_dir / fn
                shutil.move(str(fp), str(dest))
                files.append((dest, fn))
                self._emit(
                    request_id,
                    {
                        "type": "video_ok",
                        "n": i + 1,
                        "total": total,
                        "title": entry.title,
                        "filename": fn,
                    },
                )
            except Exception as exc:
                self._emit(
                    request_id,
                    {
                        "type": "video_fail",
                        "n": i + 1,
                        "total": total,
                        "title": entry.title,
                        "message": str(exc),
                    },
                )
            finally:
                self._batch_ctx.pop(request_id, None)

        if not files:
            raise RuntimeError("No videos could be downloaded from the playlist")

        self._emit(request_id, {"type": "zipping", "count": len(files)})

        safe_title = re.sub(r'[<>:"/\\|?*]', "_", info.title[:120])
        zip_path = out_dir / f"{safe_title}.zip"
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
            for fp, fn in files:
                zf.write(fp, fn)

        self._emit(request_id, {"type": "pl_done", "zip_filename": f"{safe_title}.zip"})
        return zip_path, f"{safe_title}.zip"

    @staticmethod
    def _find_file(directory: Path, exts: tuple[str, ...]) -> Optional[Path]:
        candidates = [p for p in directory.iterdir() if p.is_file() and p.suffix.lower() in exts]
        if not candidates:
            return None
        return max(candidates, key=lambda p: p.stat().st_mtime)


manager = DownloadManager()
