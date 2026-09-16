#!/usr/bin/env bash
# Native localhost installation, reusing the existing Node.js and Ollama.
set -euo pipefail
SOURCE_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR=/srv/maia/maia-chat
if [[ $EUID -ne 0 ]]; then
  echo "Execute: sudo bash $SOURCE_DIR/scripts/install-local.sh"
  exit 1
fi
/usr/bin/node -e 'if (Number(process.versions.node.split(".")[0]) < 22) process.exit(1)'
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates git rsync build-essential python3-dev python3-venv uwsgi uwsgi-plugin-python3 libxslt1-dev zlib1g-dev libffi-dev libssl-dev
id maia >/dev/null 2>&1 || useradd --system --create-home --home-dir /var/lib/maia-chat --shell /usr/sbin/nologin maia
id searxng >/dev/null 2>&1 || useradd --system --create-home --home-dir /usr/local/searxng --shell /usr/sbin/nologin searxng
install -d -o searxng -g searxng -m 0750 /usr/local/searxng /var/cache/searxng
install -d -o root -g searxng -m 0750 /etc/searxng
if [[ ! -d /usr/local/searxng/searxng-src/.git ]]; then
  runuser -u searxng -- git clone --depth 1 https://github.com/searxng/searxng /usr/local/searxng/searxng-src
fi
if [[ ! -x /usr/local/searxng/searx-pyenv/bin/python ]]; then
  runuser -u searxng -- python3 -m venv /usr/local/searxng/searx-pyenv
fi
runuser -u searxng -- /usr/local/searxng/searx-pyenv/bin/pip install --upgrade pip setuptools wheel pyyaml msgspec typing-extensions pybind11
runuser -u searxng -- /usr/local/searxng/searx-pyenv/bin/pip install --use-pep517 --no-build-isolation -e /usr/local/searxng/searxng-src
if [[ ! -f /etc/searxng/settings.yml ]]; then
  python3 - <<'PY'
import pathlib, secrets
p = pathlib.Path('/etc/searxng/settings.yml')
p.write_text('''use_default_settings: true
general:
  debug: false
  instance_name: 'Maia Chat Search'
server:
  bind_address: '127.0.0.1'
  port: 8080
  secret_key: '%s'
  limiter: false
  public_instance: false
search:
  formats: [html, json]
''' % secrets.token_hex(32))
PY
fi
chown root:searxng /etc/searxng/settings.yml
chmod 0640 /etc/searxng/settings.yml
cat >/etc/searxng/uwsgi.ini <<'EOF'
[uwsgi]
uid = searxng
gid = searxng
chdir = /usr/local/searxng/searxng-src/searx
env = LANG=C.UTF-8
env = SEARXNG_SETTINGS_PATH=/etc/searxng/settings.yml
env = XDG_CACHE_HOME=/var/cache/searxng
disable-logging = true
single-interpreter = true
master = true
lazy-apps = true
enable-threads = true
workers = 2
threads = 4
plugin = python3,http
module = searx.webapp
virtualenv = /usr/local/searxng/searx-pyenv
pythonpath = /usr/local/searxng/searxng-src
http = 127.0.0.1:8080
buffer-size = 8192
die-on-term = true
EOF
chown root:searxng /etc/searxng/uwsgi.ini
chmod 0640 /etc/searxng/uwsgi.ini
cat >/etc/systemd/system/searxng.service <<'EOF'
[Unit]
Description=SearXNG private search for Maia Chat
After=network-online.target
Wants=network-online.target
[Service]
ExecStart=/usr/bin/uwsgi --ini /etc/searxng/uwsgi.ini
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/cache/searxng
[Install]
WantedBy=multi-user.target
EOF
install -d -o root -g maia -m 0750 /srv/maia "$APP_DIR"
install -d -o maia -g maia -m 0750 /var/lib/maia-chat
if [[ "$SOURCE_DIR" != "$APP_DIR" ]]; then
  rsync -a --exclude .git --exclude .env --exclude node_modules --exclude test "$SOURCE_DIR/" "$APP_DIR/"
fi
chown -R maia:maia "$APP_DIR"
runuser -u maia -- bash -c 'cd /srv/maia/maia-chat && npm ci --omit=dev --cache /var/lib/maia-chat/npm-cache'
if [[ ! -f "$APP_DIR/.env" ]]; then
  install -m 0640 "$APP_DIR/.env.example" "$APP_DIR/.env"
fi
python3 - <<'PY'
from pathlib import Path
import re, shutil, time
p = Path('/srv/maia/maia-chat/.env')
shutil.copy2(p, str(p) + '.backup-' + str(time.time_ns()))
s = p.read_text()
for k, v in {'HOST':'127.0.0.1', 'PORT':'3080', 'MAIA_SEARCH_PROVIDER':'searxng', 'MAIA_SEARXNG_URL':'http://127.0.0.1:8080'}.items():
    pattern = rf'^{k}=.*$'
    s = re.sub(pattern, f'{k}={v}', s, flags=re.M) if re.search(pattern, s, re.M) else s + f'\n{k}={v}\n'
p.write_text(s)
PY
chown -R root:maia "$APP_DIR"
find "$APP_DIR" -type d -exec chmod 0750 {} +
find "$APP_DIR" -type f -exec chmod 0640 {} +
sed -e '/^Requires=wg-quick@wg0.service$/d' -e 's/ wg-quick@wg0.service//g' "$SOURCE_DIR/deploy/systemd/maia-chat.service" >/etc/systemd/system/maia-chat.service
chmod 0644 /etc/systemd/system/{maia-chat,searxng}.service
systemctl daemon-reload
systemctl enable maia-chat searxng
systemctl restart searxng maia-chat
sleep 5
systemctl --no-pager --full status maia-chat searxng
curl --fail --retry 5 --retry-connrefused --retry-delay 2 http://127.0.0.1:3080/api/health
curl --fail --max-time 60 --get http://127.0.0.1:3080/api/search --data-urlencode 'q=Ubuntu Linux'
echo
echo 'Abra http://127.0.0.1:3080'
