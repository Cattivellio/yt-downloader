# YT Downloader

A minimal, fast, local video/audio downloader. Paste a YouTube, Instagram, or TikTok URL, pick a format, done.

- **Backend:** FastAPI + yt-dlp
- **Frontend:** vanilla HTML / CSS / JS (no build step)
- **Style:** shadcn-inspired, light + dark mode
- **Platforms:** YouTube, Instagram, TikTok

## Features

- YouTube (videos + playlists), Instagram (reels / posts), TikTok (videos)
- Curated MP4 options per platform:
  - YouTube: 1080p, 720p, 480p, 360p (best available per tier)
  - Instagram / TikTok: best single source
- Multiple MP3 bitrates (320, 192, 128, 96 kbps) extracted from the best audio source
- **Share button** on every format — generates a one-click link that, when opened, auto-starts the download
- Playlists: bulk-download chips in the header, per-card toggle + **Batch (zip)** mode
- Live progress bar via Server-Sent Events
- Dark mode (persists in `localStorage`)
- No external CDN dependencies at runtime

## Requirements

- **Python 3.10+**
- **FFmpeg** (must be on `PATH`)

```bash
# Debian / Ubuntu
sudo apt install ffmpeg python3 python3-venv

# macOS
brew install ffmpeg python3

# Fedora / RHEL
sudo dnf install ffmpeg python3
```

## Quick start

```bash
cd ~/Documents/youtube-downloader
chmod +x run.sh
./run.sh
```

Then open <http://127.0.0.1:8000> in your browser.

The first run creates a `.venv` and installs dependencies. Subsequent runs are instant.

## Manual start

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

## Project layout

```
youtube-downloader/
├── app/
│   ├── main.py            # FastAPI routes
│   ├── downloader.py      # yt-dlp wrapper
│   ├── models.py          # Pydantic models
│   └── config.py          # Settings
├── static/
│   ├── css/styles.css     # shadcn-inspired design system
│   └── js/{app.js, htmx.min.js}
├── templates/index.html
├── requirements.txt
├── run.sh
└── README.md
```

## API

| Method | Path | Description |
|---|---|---|
| `GET`  | `/`                     | The web app |
| `GET`  | `/share`                | Query `url`, `kind`, `quality`. Landing page that auto-triggers the download |
| `POST` | `/api/info`             | Body `{url}`. Returns video or playlist metadata |
| `GET`  | `/api/download`         | Query `url`, `kind=video|audio`, `quality` (video height or audio kbps), `request_id`. Streams the file |
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
- **Audio/video out of sync or no audio** — Make sure `ffmpeg` is installed and on `PATH`. Run `ffmpeg -version` to verify.
- **Slow first request** — yt-dlp fetches JS players on first run. Subsequent requests are fast.
- **Format not available** — yt-dlp picks the best format for the requested tier. If 1080p isn't available for a video, you'll get the best it can do (e.g. 720p) and the row will reflect the actual resolution.

## Updating

yt-dlp follows YouTube's changes. To stay current:

```bash
source .venv/bin/activate
pip install -U yt-dlp
```

## Notes

- This tool is intended for personal use with content you have the right to download.
- All processing happens locally — nothing is uploaded.
- Temporary files live under `/tmp/yt-downloader/` and are removed after each download.
