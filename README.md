# VidDown

A minimal, fast, local video/audio downloader for YouTube, Instagram, TikTok, and Spotify. Paste a link, pick a format, done.

- **Backend:** FastAPI + yt-dlp + spotDL
- **Frontend:** vanilla HTML / CSS / JS (no build step)
- **Style:** shadcn-inspired, light + dark mode
- **Platforms:** YouTube, Instagram, TikTok, Spotify

## Features

- YouTube (videos + playlists), Instagram (reels / posts), TikTok (videos), Spotify (tracks, playlists, albums)
- Curated MP4 options per platform:
  - YouTube: 1080p, 720p, 480p, 360p (best available per tier)
  - Instagram / TikTok: best single source
- Spotify: MP3 audio at 128 kbps (via YouTube source, with full Spotify metadata)
- Multiple MP3 bitrates (320, 192, 128, 96 kbps) extracted from the best audio source
- **Share button** on every format — generates a one-click link that, when opened, auto-starts the download
- Playlists: bulk-download chips in the header, per-card toggle + **Batch (zip)** mode
- Live progress bar via Server-Sent Events
- Dark mode (persists in `localStorage`)
- No external CDN dependencies at runtime

## Quick start

### Local (Python venv)

Requirements: **Python 3.10+**, **FFmpeg**

```bash
git clone https://github.com/Cattivellio/yt-downloader.git
cd yt-downloader
chmod +x run.sh
./run.sh
```

Then open <http://127.0.0.1:8000>.

### Docker

```bash
git clone https://github.com/Cattivellio/yt-downloader.git
cd yt-downloader
docker compose up -d --build
```

Open <http://localhost:8200>.

### Manual start

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

### FFmpeg install

```bash
# Debian / Ubuntu
sudo apt install ffmpeg python3 python3-venv

# macOS
brew install ffmpeg python3

# Fedora / RHEL
sudo dnf install ffmpeg python3
```

## Project layout

```
yt-downloader/
├── app/
│   ├── main.py            # FastAPI routes
│   ├── downloader.py      # yt-dlp wrapper
│   ├── spotify.py         # spotDL v4 wrapper
│   ├── models.py          # Pydantic models
│   └── config.py          # Settings
├── static/
│   ├── css/styles.css     # shadcn-inspired design system
│   └── js/{app.js, htmx.min.js}
├── templates/
│   ├── index.html
│   └── share.html         # Shared download landing page
├── Dockerfile
├── docker-compose.yml
├── requirements.txt
├── run.sh
└── README.md
```

## API

| Method | Path | Description |
|---|---|---|
| `GET`  | `/`                     | The web app |
| `GET`  | `/share`                | Query `url`, `kind`, `quality`. Landing page that auto-triggers the download |
| `POST` | `/api/info`             | Body `{url}`. Returns video metadata + available formats |
| `GET`  | `/api/download`         | Query `url`, `kind`, `quality`, `request_id`. Streams a single file |
| `POST` | `/api/download-playlist`| Body `{url, kind, quality, request_id}`. Downloads all playlist videos, returns a zip |
| `GET`  | `/api/progress`         | Server-Sent Events stream of download progress |
| `GET`  | `/api/health`           | Liveness check |

## Sharing a download

Click the share icon next to any format's Download button. The app copies a link like:

```
http://your-host:8000/share?url=<youtube-url>&kind=audio&quality=128
```

When the recipient opens it, they see a small landing page and the download starts automatically (with a manual fallback button). The link only works while the app is running. For public sharing, expose the app on a reachable host (LAN IP, VPS, or a tunnel like `ngrok` / `cloudflared`).

## Troubleshooting

- **"Sign in to confirm you're not a bot"** — YouTube occasionally throttles unauthenticated requests. Update yt-dlp (`pip install -U yt-dlp`). If it persists, set `YT_COOKIE_FILE=/path/to/cookies.txt` before running.
- **Instagram "empty media response"** — the post may require authentication. Use `--cookies-from-browser` or pass cookies via the `YT_COOKIE_FILE` env var.
- **TikTok "IP blocked"** — your IP or VM IP may be rate-limited by TikTok. Try from a different connection or use a VPN.
- **Spotify download fails** — spotDL uses YouTube as a source. If the YouTube source is unavailable, try again later. For higher quality (256 kbps), set `SPOTDL_BITRATE=256k` (requires YouTube Music Premium).
- **Audio/video out of sync or no audio** — Make sure `ffmpeg` is installed and on `PATH`. Run `ffmpeg -version` to verify.
- **Slow first request** — yt-dlp fetches JS players on first run. Subsequent requests are fast.
- **Format not available** — yt-dlp picks the best format for the requested tier. If 1080p isn't available for a video, you'll get the best it can do (e.g. 720p) and the row will reflect the actual resolution.

## Updating

yt-dlp follows platform changes. To stay current:

```bash
# Local install
source .venv/bin/activate
pip install -U yt-dlp

# Docker
docker compose build --no-cache
docker compose up -d
```

## Notes

- This tool is intended for personal use with content you have the right to download.
- All processing happens locally — nothing is uploaded.
- Temporary files live under `/tmp/yt-downloader/` and are removed after each download.
