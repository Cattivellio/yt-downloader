#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if [ ! -d ".venv" ]; then
  echo "→ Creating virtual environment…"
  python3 -m venv .venv
fi

# shellcheck disable=SC1091
source .venv/bin/activate

echo "→ Installing / updating dependencies…"
pip install --quiet --upgrade -r requirements.txt

HOST="${YT_HOST:-127.0.0.1}"
PORT="${YT_PORT:-8000}"

echo "→ Starting server on http://${HOST}:${PORT}"
exec uvicorn app.main:app --host "${HOST}" --port "${PORT}" --reload
