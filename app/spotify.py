from __future__ import annotations

import re
import shutil
import zipfile
from pathlib import Path
from typing import Any, Optional

from spotdl import Spotdl

from .config import (
    SPOTDL_BITRATE,
    SPOTIFY_CLIENT_ID,
    SPOTIFY_CLIENT_SECRET,
    TEMP_DIR,
)


_SPOTIFY_URL_RE = re.compile(
    r"open\.spotify\.com/(track|album|playlist|artist)/([A-Za-z0-9]+)",
    re.IGNORECASE,
)


def _duration_to_str(seconds: Optional[int]) -> str:
    if not seconds:
        return "—"
    h, rem = divmod(int(seconds), 3600)
    m, s = divmod(rem, 60)
    if h:
        return f"{h}:{m:02d}:{s:02d}"
    return f"{m}:{s:02d}"


def parse_spotify_url(url: str) -> tuple[str, str]:
    """Return (url_type, spotify_id) from a Spotify URL."""
    m = _SPOTIFY_URL_RE.search(url)
    if not m:
        raise ValueError(f"Not a valid Spotify URL: {url}")
    return m.group(1), m.group(2)


def _make_audio_formats() -> list[dict[str, Any]]:
    return [
        {
            "id": "audio_128",
            "label": "MP3 · 128 kbps",
            "ext": "mp3",
            "size_estimate": None,
            "note": "Standard quality · via YouTube",
            "has_audio": True,
            "abr": 128.0,
        }
    ]


class SpotifyDownloader:
    """Wrapper around spotDL's Spotdl class for use in the FastAPI app."""

    def __init__(self) -> None:
        self._client: Optional[Spotdl] = None

    def _get_client(self) -> Spotdl:
        if self._client is None:
            self._client = Spotdl(
                client_id=SPOTIFY_CLIENT_ID,
                client_secret=SPOTIFY_CLIENT_SECRET,
                downloader_settings={
                    "format": "mp3",
                    "bitrate": SPOTDL_BITRATE,
                    "output": "{artists} - {title}.{output-ext}",
                    "threads": 4,
                    "overwrite": "skip",
                    "simple_tui": True,
                    "print_errors": False,
                    "audio_providers": ["youtube-music"],
                    "lyrics_providers": [],
                },
            )
        return self._client

    def get_info(self, url: str) -> dict[str, Any]:
        url_type, _spotify_id = parse_spotify_url(url)
        client = self._get_client()
        songs = client.search([url])

        if not songs:
            raise ValueError(f"Could not fetch songs from Spotify {url_type}")

        if url_type == "track":
            return self._track_to_info(songs[0], url)
        return self._songs_to_playlist_info(songs, url, url_type)

    def _track_to_info(self, song: Any, url: str) -> dict[str, Any]:
        duration = int(song.duration or 0)
        return {
            "type": "video",
            "id": song.song_id or "",
            "title": song.display_name or "Unknown",
            "platform": "spotify",
            "channel": song.artist or "",
            "duration": duration,
            "duration_string": _duration_to_str(duration),
            "thumbnail": song.cover_url or "",
            "view_count": None,
            "upload_date": None,
            "webpage_url": url,
            "video_formats": [],
            "audio_formats": _make_audio_formats(),
        }

    def _songs_to_playlist_info(
        self, songs: list[Any], url: str, url_type: str
    ) -> dict[str, Any]:
        entries: list[dict[str, Any]] = []
        for song in songs:
            dur = int(song.duration or 0)
            entries.append(
                {
                    "id": song.song_id or "",
                    "title": song.display_name or "Unknown",
                    "channel": song.artist or "",
                    "duration": dur,
                    "duration_string": _duration_to_str(dur),
                    "thumbnail": song.cover_url or "",
                    "webpage_url": url,
                }
            )

        primary_artist = entries[0]["channel"] if entries else ""
        title = entries[0]["title"] if entries else f"Spotify {url_type.title()}"

        return {
            "type": "playlist",
            "id": url.split("/")[-1].split("?")[0],
            "title": title,
            "platform": "spotify",
            "channel": primary_artist,
            "count": len(entries),
            "entries": entries,
            "webpage_url": url,
            "video_formats": [],
            "audio_formats": _make_audio_formats(),
        }

    def download_track(self, url: str, out_dir: Path) -> tuple[Path, str]:
        out_dir.mkdir(parents=True, exist_ok=True)
        client = self._get_client()
        songs = client.search([url])
        if not songs:
            raise RuntimeError("Could not find Spotify track")

        results = client.download_songs(songs)
        if not results or not results[0][1]:
            raise RuntimeError(f"Failed to download: {songs[0].display_name}")

        downloaded_path = results[0][1]
        dest = out_dir / downloaded_path.name
        shutil.move(str(downloaded_path), str(dest))
        return dest, dest.name

    def download_playlist(self, url: str, out_dir: Path) -> tuple[Path, str]:
        out_dir.mkdir(parents=True, exist_ok=True)

        client = self._get_client()
        songs = client.search([url])
        if not songs:
            raise RuntimeError("Could not find songs in Spotify playlist")

        results = client.download_songs(songs)

        files: list[tuple[Path, str]] = []
        for _song, path in results:
            if path:
                dest = out_dir / path.name
                shutil.move(str(path), str(dest))
                files.append((dest, path.name))

        if not files:
            raise RuntimeError("No tracks could be downloaded from the Spotify URL")

        title = songs[0].display_name if songs else "Spotify Playlist"
        safe_title = re.sub(r'[<>:"/\\|?*]', "_", title[:120])
        zip_path = out_dir / f"{safe_title}.zip"
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
            for fp, fn in files:
                zf.write(fp, fn)

        return zip_path, f"{safe_title}.zip"


spotify_downloader = SpotifyDownloader()
