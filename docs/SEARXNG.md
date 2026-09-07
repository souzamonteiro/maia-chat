# SearXNG for Maia Chat

This runbook prepares a private SearXNG instance for the optional Maia Chat web-search feature. Do not expose SearXNG directly to the public Internet. Maia Chat should reach it over localhost, WireGuard, or another private network. It uses uWSGI, the supported native production path for Ubuntu/Debian. `python -m searx.webapp` is useful only for an interactive check, not as the permanent service.

## Requirements

- Ubuntu/Debian host with Python 3, Git, and systemd
- A host reachable from Maia Chat over a private address
- Outbound HTTPS access from SearXNG to its configured search engines

## Install

Install the build and Python dependencies:

```bash
sudo apt-get update
sudo apt-get install -y \
  git build-essential python3-dev python3-babel python3-venv python-is-python3 \
  uwsgi uwsgi-plugin-python3 \
  libxslt1-dev zlib1g-dev libffi-dev libssl-dev
```

Create an unprivileged system user and directories:

```bash
id -u searxng >/dev/null 2>&1 || sudo useradd --system --create-home --home-dir /usr/local/searxng --shell /bin/bash searxng
sudo install -d -o searxng -g searxng -m 0750 /usr/local/searxng
sudo install -d -o root -g searxng -m 0750 /etc/searxng
sudo install -d -o searxng -g searxng -m 0750 /var/cache/searxng
```

Clone SearXNG and install it in a virtual environment owned by the service user. Run each command once on a clean host:

```bash
sudo -H -u searxng git clone https://github.com/searxng/searxng /usr/local/searxng/searxng-src
sudo -H -u searxng python3 -m venv /usr/local/searxng/searx-pyenv
sudo -H -u searxng /usr/local/searxng/searx-pyenv/bin/pip install --upgrade pip setuptools wheel
sudo -H -u searxng /usr/local/searxng/searx-pyenv/bin/pip install --upgrade \
  pyyaml msgspec typing-extensions pybind11
sudo -H -u searxng /usr/local/searxng/searx-pyenv/bin/pip install --use-pep517 --no-build-isolation -e /usr/local/searxng/searxng-src
```

If an earlier attempt already cloned the repository and created the virtual
environment, do not clone again. Resume from the dependency bootstrap command:

```bash
sudo install -d -o root -g searxng -m 0750 /etc/searxng
sudo -H -u searxng /usr/local/searxng/searx-pyenv/bin/pip install --upgrade \
  pyyaml msgspec typing-extensions pybind11
sudo -H -u searxng /usr/local/searxng/searx-pyenv/bin/pip install --use-pep517 --no-build-isolation -e /usr/local/searxng/searxng-src
```

Generate a secret and keep it available only while editing the configuration:

```bash
openssl rand -hex 32
```

Create `/etc/searxng/settings.yml` with exactly this minimal private configuration. Replace `REPLACE_WITH_A_RANDOM_SECRET` with the generated value. This creates a new file and intentionally does not overwrite an existing configuration:

```yaml
use_default_settings: true
general:
  debug: false
  instance_name: 'Maia Chat Search'
server:
  bind_address: '127.0.0.1'
  port: 8080
  secret_key: 'REPLACE_WITH_A_RANDOM_SECRET'
  limiter: false
  public_instance: false
formats:
  - html
  - json
```

Use `sudoedit /etc/searxng/settings.yml` to create it. Then apply safe ownership and permissions:

```bash
sudoedit /etc/searxng/settings.yml
sudo chown root:searxng /etc/searxng/settings.yml
sudo chmod 0640 /etc/searxng/settings.yml
```

Create `/etc/searxng/uwsgi.ini` with `sudoedit /etc/searxng/uwsgi.ini`:

```ini
[uwsgi]
uid = searxng
gid = searxng
chdir = /usr/local/searxng/searxng-src/searx
env = LANG=C.UTF-8
env = LANGUAGE=C.UTF-8
env = LC_ALL=C.UTF-8
env = SEARXNG_SETTINGS_PATH=/etc/searxng/settings.yml
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
```

Create `/etc/systemd/system/searxng.service` with
`sudoedit /etc/systemd/system/searxng.service`:

```ini
[Unit]
Description=SearXNG private metasearch service
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
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
```

Apply permissions to the uWSGI configuration, then start and inspect the native service:

```bash
sudo chown root:searxng /etc/searxng/uwsgi.ini
sudo chmod 0640 /etc/searxng/uwsgi.ini
sudo systemctl daemon-reload
sudo systemctl enable --now searxng
sudo systemctl status searxng
sudo journalctl -u searxng -n 50 --no-pager
```

If systemd reports `status=226/NAMESPACE` and says that
`/var/cache/searxng` does not exist, create the writable cache path and restart
the service:

```bash
sudo install -d -o searxng -g searxng -m 0750 /var/cache/searxng
sudo systemctl restart searxng
sudo systemctl status searxng
```

If an earlier version of this runbook created a unit whose `ExecStart` is
`python -m searx.webapp`, replace it with the uWSGI unit and create
`/etc/searxng/uwsgi.ini` above. Then run:

```bash
sudo systemctl daemon-reload
sudo systemctl restart searxng
sudo systemctl status searxng
```

## Verify privately

On the SearXNG host:

```bash
curl --fail --get 'http://127.0.0.1:8080/search' \
  --data-urlencode 'q=Maia Chat' \
  --data-urlencode 'format=json'
```

The response must contain JSON with a `results` array. If the check fails, inspect `sudo journalctl -u searxng -n 100 --no-pager` before changing settings. If Maia Chat runs on another private host, change both `bind_address` and `http` in `/etc/searxng/uwsgi.ini` to the specific WireGuard address and allow only that peer in the host firewall. Do not proxy this endpoint through the public Maia Nginx virtual host.

## Maia Chat configuration

To enable web search in Maia Chat, configure the private base URL:

```env
MAIA_SEARCH_PROVIDER=searxng
MAIA_SEARXNG_URL=http://127.0.0.1:8080
MAIA_SEARCH_TIMEOUT_MS=10000
MAIA_SEARCH_MAX_RESULTS=5
```

For a remote private deployment, use the SearXNG WireGuard address instead. Keep search configuration, rate limits, and any future provider credentials in the deployment environment file, never in source control.

## Operations

- Update the checked-out SearXNG revision only after testing result quality and JSON compatibility in staging; record the verified commit or release tag for production.
- Restrict service-user, source-directory, and configuration-file access to operators because the SearXNG secret key is sensitive.
- Monitor failed requests, engine availability, and outbound traffic at SearXNG; Maia Chat logs omit search queries and result content.
- Back up `/etc/searxng/settings.yml` and `/etc/searxng/uwsgi.ini` encrypted at rest along with other deployment configuration.
