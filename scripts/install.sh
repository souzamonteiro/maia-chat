#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/srv/maia/maia-chat}"
APP_USER="${APP_USER:-maia}"

if [[ $EUID -ne 0 ]]; then
  echo "Run as root: sudo ./scripts/install.sh"
  exit 1
fi

if ! id "$APP_USER" >/dev/null 2>&1; then
  useradd --system --create-home --shell /usr/sbin/nologin "$APP_USER"
fi

mkdir -p "$(dirname "$APP_DIR")"

if [[ "$PWD" != "$APP_DIR" ]]; then
  rsync -a --delete --exclude '.git' --exclude 'node_modules' "$PWD/" "$APP_DIR/"
fi

cd "$APP_DIR"

if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "Created $APP_DIR/.env — edit it before starting the service."
fi

npm install --omit=dev

chown -R "$APP_USER:$APP_USER" "$APP_DIR"

install -m 0644 deploy/systemd/maia-chat.service /etc/systemd/system/maia-chat.service
systemctl daemon-reload
systemctl enable maia-chat.service

echo
echo "Installed Maia Chat."
echo "Next:"
echo "  1. Edit $APP_DIR/.env"
echo "  2. sudo systemctl restart maia-chat"
echo "  3. sudo systemctl status maia-chat"
