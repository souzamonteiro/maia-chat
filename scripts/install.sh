#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/srv/maia/maia-chat"
APP_USER="maia"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd)"
NODE_MAJOR=22

if [[ $EUID -ne 0 ]]; then
  echo "Run as root: sudo ./scripts/install.sh"
  exit 1
fi

if [[ ! -f "$SOURCE_DIR/package.json" || ! -f "$SOURCE_DIR/package-lock.json" ]]; then
  echo "Run this script from a complete Maia Chat checkout."
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl gnupg rsync

installed_major=""
if command -v node >/dev/null 2>&1; then
  installed_major="$(node --version | sed -E 's/^v([0-9]+).*/\1/')"
fi

if [[ "$installed_major" != "$NODE_MAJOR" ]]; then
  install -d -m 0755 /etc/apt/keyrings
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key |
    gpg --dearmor --yes -o /etc/apt/keyrings/nodesource.gpg
  printf '%s\n' \
    "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_${NODE_MAJOR}.x nodistro main" \
    >/etc/apt/sources.list.d/nodesource.list
  apt-get update
  apt-get install -y nodejs
fi

if ! id "$APP_USER" >/dev/null 2>&1; then
  useradd --system --create-home --home-dir /var/lib/maia-chat --shell /usr/sbin/nologin "$APP_USER"
fi

install -d -o root -g "$APP_USER" -m 0750 "$(dirname "$APP_DIR")"
install -d -o "$APP_USER" -g "$APP_USER" -m 0750 /var/lib/maia-chat
if [[ "$SOURCE_DIR" != "$APP_DIR" ]]; then
  rsync -a --delete \
    --exclude '.env' \
    --exclude '.git' \
    --exclude '.github' \
    --exclude 'node_modules' \
    --exclude 'test' \
    "$SOURCE_DIR/" "$APP_DIR/"
fi

cd "$APP_DIR"
npm ci --omit=dev

chown -R root:"$APP_USER" "$APP_DIR"
find "$APP_DIR" -type d -exec chmod 0750 {} +
find "$APP_DIR" -type f -exec chmod 0640 {} +
chmod 0750 "$APP_DIR/scripts/install.sh"

if [[ ! -f "$APP_DIR/.env" ]]; then
  install -o root -g "$APP_USER" -m 0640 "$APP_DIR/.env.example" "$APP_DIR/.env"
  echo "Created $APP_DIR/.env from .env.example."
fi
chown root:"$APP_USER" "$APP_DIR/.env"
chmod 0640 "$APP_DIR/.env"

install -m 0644 deploy/systemd/maia-chat.service /etc/systemd/system/maia-chat.service
systemctl daemon-reload
systemctl enable --now maia-chat.service

echo
echo "Installed Maia Chat."
echo "Service status:"
systemctl --no-pager --full status maia-chat.service || true
echo
echo "Review $APP_DIR/.env, then restart after any change:"
echo "  sudo systemctl restart maia-chat"
