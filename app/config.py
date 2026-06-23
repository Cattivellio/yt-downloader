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

SPOTDL_BITRATE = os.environ.get("SPOTDL_BITRATE", "128k")

# Spotify credentials — defaults are spotDL's bundled public credentials.
# Override with your own app credentials via env vars if needed.
try:
    from spotdl.utils.config import SPOTIFY_OPTIONS as _SPOTIFY_OPTIONS
    _DEFAULT_CLIENT_ID = _SPOTIFY_OPTIONS["client_id"]
    _DEFAULT_CLIENT_SECRET = _SPOTIFY_OPTIONS["client_secret"]
except (ImportError, KeyError):
    _DEFAULT_CLIENT_ID = ""
    _DEFAULT_CLIENT_SECRET = ""

SPOTIFY_CLIENT_ID = os.environ.get("SPOTIFY_CLIENT_ID", _DEFAULT_CLIENT_ID)
SPOTIFY_CLIENT_SECRET = os.environ.get("SPOTIFY_CLIENT_SECRET", _DEFAULT_CLIENT_SECRET)
