# Deployment on Maia Edge

## 1. DNS

Create:

```text
maia.maiaplatform.org
```

pointing to the public Maia Edge VPS.

## 2. Office/client machine

The recommended layout is:

```text
/srv/maia/maia-chat
```

Clone and install:

```bash
cd /srv/maia
git clone https://github.com/YOUR_USER/maia-chat.git
cd maia-chat
sudo ./scripts/install.sh
```

Edit `.env`.

If Node listens directly on the WireGuard address:

```env
HOST=<CLIENT_WIREGUARD_IP>
PORT=3080
```

Confirm:

```bash
curl http://<CLIENT_WIREGUARD_IP>:3080/api/health
```

from the VPS.

## 3. Firewall

On the client:

```bash
sudo ufw allow in on wg0 to any port 3080 proto tcp
```

Do not expose `11434/tcp`.

## 4. VPS Nginx

Copy:

```text
deploy/nginx/maia.maiaplatform.org.conf
```

to:

```text
/etc/nginx/sites-available/maia.maiaplatform.org
```

Enable it:

```bash
sudo ln -s /etc/nginx/sites-available/maia.maiaplatform.org \
  /etc/nginx/sites-enabled/maia.maiaplatform.org
```

Edit the upstream WireGuard address.

Validate:

```bash
sudo nginx -t
```

## 5. TLS

Issue the Let's Encrypt certificate using the same Certbot workflow as the other Maia Platform virtual hosts.

Reload:

```bash
sudo systemctl reload nginx
```

## 6. Verification

```bash
curl https://maia.maiaplatform.org/api/health
curl https://maia.maiaplatform.org/v1/models
```

Then open the web UI.

## 7. Troubleshooting streaming

If the entire response appears only at the end, verify:

```nginx
proxy_buffering off;
proxy_cache off;
proxy_read_timeout 300s;
```

The application also emits:

```http
X-Accel-Buffering: no
```

for chat streams.
