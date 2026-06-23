from __future__ import annotations

import logging
import re
import zipfile
from pathlib import Path
from typing import Any

import gallery_dl
from gallery_dl import config as gconfig
from gallery_dl import job as gjob

logger = logging.getLogger(__name__)


_INSTAGRAM_RE = re.compile(
    r"https?://(www\.)?instagram\.com/(p|reel|reels|tv)/[A-Za-z0-9_-]+",
    re.IGNORECASE,
)


def is_instagram_url(url: str) -> bool:
    return bool(_INSTAGRAM_RE.match(url))


def is_potentially_image_url(url: str) -> bool:
    """True for URLs that might yield image content (Instagram posts)."""
    return is_instagram_url(url)


class GalleryDownloader:
    """Wrapper around gallery-dl for downloading image content."""

    def __init__(self) -> None:
        gconfig.set(("log",), "level", "WARNING")
        gconfig.set(("log",), "format", "{asctime} {levelname} {name}: {message}")

    def get_info(self, url: str) -> dict[str, Any]:
        """
        Probe a URL for image content. Returns a dict compatible with
        VideoInfo (video_formats=[]), with extra fields content_kind and
        image_count consumed by the frontend.
        """
        if not is_instagram_url(url):
            raise ValueError(f"Not an Instagram URL: {url}")

        image_urls: list[str] = []
        try:
            gconfig.set(("extractor",), "base-directory", "/tmp")
            gconfig.set(("extractor",), "skip-download", True)
            job = gjob.DataJob(url)
            for kwdict in job.run():
                if not isinstance(kwdict, dict):
                    continue
                for key in ("image", "images", "display_url", "thumbnail"):
                    val = kwdict.get(key)
                    if isinstance(val, str) and val.startswith("http"):
                        image_urls.append(val)
                    elif isinstance(val, list):
                        for v in val:
                            if isinstance(v, str) and v.startswith("http"):
                                image_urls.append(v)
        except Exception as exc:
            logger.warning("gallery-dl info probe failed: %s", exc)

        return {
            "type": "video",
            "id": self._extract_id(url),
            "title": "Instagram post",
            "platform": "instagram",
            "channel": "",
            "duration": 0,
            "duration_string": "—",
            "thumbnail": image_urls[0] if image_urls else "",
            "view_count": None,
            "upload_date": None,
            "webpage_url": url,
            "video_formats": [],
            "audio_formats": [
                {
                    "id": "image_all",
                    "label": (
                        f"Download {len(image_urls)} image{'' if len(image_urls) == 1 else 's'}"
                        if image_urls
                        else "Download images"
                    ),
                    "ext": "zip",
                    "size_estimate": None,
                    "note": "Photo post · via gallery-dl",
                    "has_audio": False,
                    "abr": None,
                }
            ],
            "content_kind": "images",
            "image_count": max(len(image_urls), 1),
        }

    def download_images(self, url: str, out_dir: Path) -> tuple[Path, str]:
        out_dir.mkdir(parents=True, exist_ok=True)
        gconfig.set(("extractor",), "base-directory", str(out_dir))
        gconfig.set(("extractor",), "directory", [""])
        gconfig.set(("extractor",), "filename", "{id}.{extension}")
        job = gjob.DownloadJob(url)
        job.run()

        files = sorted(p for p in out_dir.rglob("*") if p.is_file() and p.suffix)
        if not files:
            raise RuntimeError("No images were downloaded")

        if len(files) == 1:
            return files[0], files[0].name

        safe_title = re.sub(r'[<>:"/\\|?*]', "_", "instagram_post")[:80]
        zip_path = out_dir / f"{safe_title}.zip"
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
            for fp in files:
                zf.write(fp, fp.name)
        return zip_path, zip_path.name

    @staticmethod
    def _extract_id(url: str) -> str:
        m = re.search(r"/(p|reel|reels|tv)/([A-Za-z0-9_-]+)", url)
        return m.group(2) if m else ""


gallery_downloader = GalleryDownloader()
