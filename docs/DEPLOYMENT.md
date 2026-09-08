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
# Trust only the WireGuard IP of the Nginx VPS to forward client IPs.
MAIA_TRUSTED_PROXY=<VPS_WIREGUARD_IP>
```

The bundled `maia-chat.service` requires `wg-quick@wg0.service` and starts only
after `wg0` is available. Enable the tunnel before enabling Maia Chat:

```bash
sudo systemctl enable --now wg-quick@wg0
sudo systemctl enable --now maia-chat
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

The Nginx site must allow the document extraction request body. Maia Chat
accepts documents up to 10 MiB before browser base64 encoding, so keep
`client_max_body_size 15m` on `/api/documents/`.

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

For IP-based rate limits to identify the browser rather than Nginx, retain the
standard forwarded header in the Nginx site configuration:

```nginx
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
```

Set `MAIA_TRUSTED_PROXY` only to the Nginx VPS WireGuard IP or an explicitly
trusted CIDR. Do not configure a trust-all proxy value, because it lets clients
spoof their IP address through `X-Forwarded-For`.

The application also emits:

```http
X-Accel-Buffering: no
```

for chat streams.

## 8. Timeout alignment

The defaults intentionally protect against stalled connections without imposing
a total limit on an active model response:

| Layer               | Setting                                       | Default              |
| ------------------- | --------------------------------------------- | -------------------- |
| Maia Chat to Ollama | `OLLAMA_TIMEOUT_MS` inactivity timeout        | 120 seconds          |
| Nginx upstream      | `proxy_read_timeout` and `proxy_send_timeout` | 300 seconds          |
| Node.js HTTP server | request timeout                               | disabled for streams |
| systemd             | `TimeoutStopSec` graceful shutdown allowance  | 45 seconds           |

Keep Nginx idle timeouts greater than `OLLAMA_TIMEOUT_MS`; `300s` leaves room
for a controlled upstream error to reach the browser. Node does not end an
active stream on a fixed duration. WireGuard peers should use `PersistentKeepalive
= 25` when NAT could otherwise expire an idle tunnel between requests.
