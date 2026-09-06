# Maia Chat

Maia Chat is the public web interface and OpenAI-compatible gateway for Maia language models.

The first version uses **Ollama** as its inference provider. The web application does not talk directly to Ollama; it talks to Maia Chat, which keeps the inference backend replaceable.

## Architecture

```text
Browser
   |
   | HTTPS
   v
maia.maiaplatform.org
   |
   v
Nginx / Maia Edge VPS
   |
   | WireGuard
   v
Maia Chat (Node.js)
   |
   | localhost / private network
   v
Ollama
   |
   +-- qwen2.5:14b
   +-- future Maia models
```

## Current features

- Responsive web chat interface
- Streaming responses
- Local conversation history
- Model selection from Ollama
- Stop generation
- Markdown/code rendering
- Health endpoint
- OpenAI-style `GET /v1/models`
- OpenAI-style `POST /v1/chat/completions`
- Optional bearer-token API authentication
- Nginx deployment example for Maia Edge
- systemd service

## Requirements

- Ubuntu 24.04 LTS or compatible Linux
- Node.js 20+
- Ollama
- At least one model installed in Ollama
- Nginx on the public ingress if using Maia Edge

## Development

```bash
cp .env.example .env
npm install
npm run dev
```

Open:

```text
http://127.0.0.1:3080
```

Make sure Ollama is running:

```bash
ollama serve
```

and that a model exists:

```bash
ollama list
```

For the current experimental machine, configure for example:

```env
MAIA_DEFAULT_MODEL=qwen2.5:14b
OLLAMA_URL=http://127.0.0.1:11434
```

## API

### Health

```http
GET /api/health
```

### Models

```http
GET /v1/models
```

### Chat completion

```http
POST /v1/chat/completions
Content-Type: application/json
```

Example:

```json
{
  "model": "qwen2.5:14b",
  "stream": true,
  "messages": [
    {
      "role": "user",
      "content": "Hello, Maia."
    }
  ]
}
```

Streaming follows the familiar SSE shape:

```text
data: {"id":"chatcmpl-...","choices":[{"delta":{"content":"Hello"}}]}

data: [DONE]
```

## Production installation

Clone the repository on the Maia Edge client:

```bash
cd /srv/maia
git clone https://github.com/YOUR_USER/maia-chat.git
cd maia-chat
sudo ./scripts/install.sh
```

Then edit:

```bash
sudo nano /srv/maia/maia-chat/.env
```

Recommended when the Node server should be reachable only over WireGuard:

```env
HOST=10.20.0.2
PORT=3080
MAIA_NAME=Maia
MAIA_DEFAULT_MODEL=qwen2.5:14b
OLLAMA_URL=http://127.0.0.1:11434
```

Replace `10.20.0.2` with the actual WireGuard address of the client.

Restart:

```bash
sudo systemctl restart maia-chat
sudo systemctl status maia-chat
```

Allow only WireGuard traffic:

```bash
sudo ufw allow in on wg0 to any port 3080 proto tcp
```

## Public Nginx

Use `deploy/nginx/maia.maiaplatform.org.conf` on the public Maia Edge VPS.

Change:

```nginx
set $maia_upstream http://10.20.0.2:3080;
```

to the real WireGuard client IP.

Then:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

Issue the TLS certificate in the same manner already used for the other Maia Platform subdomains.

## Security model

Ollama should **not** be exposed directly to the Internet.

Recommended flow:

```text
Internet -> Nginx -> WireGuard -> Maia Chat -> Ollama
```

For external programmatic API access, set:

```env
MAIA_API_KEY=replace-with-a-long-random-secret
```

Clients then use:

```http
Authorization: Bearer replace-with-a-long-random-secret
```

Do not embed that key in the public web UI.

If the built-in web UI must remain public while the API later becomes authenticated, split public UI routes and external API authentication into separate policies or subdomains.

## Future Maia model

When the first Maia model is available through Ollama, the change can be as small as:

```env
MAIA_DEFAULT_MODEL=maia-small
```

The web interface and API remain unchanged.

## Roadmap

See [ROADMAP.md](ROADMAP.md).

## License

MIT
