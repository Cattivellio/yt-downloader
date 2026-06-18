from __future__ import annotations

import os
import shutil
import tempfile
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent.parent
TEMP_DIR = Path(tempfile.gettempdir()) / "yt-downloader"
TEMP_DIR.mkdir(parents=True, exist_ok=True)

FFMPEG_LOCATION = shutil.which("ffmpeg")

HOST = os.environ.get("YT_HOST", "127.0.0.1")
PORT = int(os.environ.get("YT_PORT", "8000"))

COOKIE_FILE = os.environ.get("YT_COOKIE_FILE")
