#!/usr/bin/env bash
# Deploy the Maia RAG bridge into an existing native Maia Chat installation.
set -euo pipefail
SOURCE_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR=/srv/maia/maia-chat
if [[ $EUID -ne 0 ]]; then
  echo "Execute: sudo bash $SOURCE_DIR/scripts/enable-rag.sh"
  exit 1
fi
[[ -f "$APP_DIR/.env" && -d "$APP_DIR/node_modules" ]] || {
  echo "Existing Maia Chat installation not found at $APP_DIR" >&2
  exit 1
}
# Back up configuration and the exact files replaced before deploying.
BACKUP_DIR="$(mktemp -d /srv/maia/maia-chat-rag-backup-XXXXXXXX)"
chmod 0700 "$BACKUP_DIR"
cp -a "$APP_DIR/.env" "$BACKUP_DIR/.env"
for relative in server/config.js server/config-validation.js server/routes/chat.js server/rag.js; do
  mkdir -p "$BACKUP_DIR/$(dirname "$relative")"
  if [[ -f "$APP_DIR/$relative" ]]; then
    cp -a "$APP_DIR/$relative" "$BACKUP_DIR/$relative"
  fi
  if [[ "$SOURCE_DIR" != "$APP_DIR" ]]; then
    install -o root -g maia -m 0640 "$SOURCE_DIR/$relative" "$APP_DIR/$relative"
  fi
done
python3 - <<'PY'
from pathlib import Path
import re
p = Path('/srv/maia/maia-chat/.env')
s = p.read_text()
# Preserve an existing custom URL and collection restriction.
settings = {'MAIA_RAG_ENABLED': 'true'}
if not re.search(r'^MAIA_RAG_URL=.+$', s, re.M):
    settings['MAIA_RAG_URL'] = 'http://127.0.0.1:4310'
for key, value in settings.items():
    pattern = rf'^{key}=.*$'
    s = re.sub(pattern, f'{key}={value}', s, flags=re.M) if re.search(pattern, s, re.M) else s + f'\n{key}={value}\n'
p.write_text(s)
PY
chown root:maia "$APP_DIR/.env"
chmod 0640 "$APP_DIR/.env"
echo "Backup: $BACKUP_DIR"
systemctl restart maia-chat
systemctl --no-pager --full status maia-chat
echo 'Maia RAG enabled. Open Maia Chat and ask about an indexed document.'
