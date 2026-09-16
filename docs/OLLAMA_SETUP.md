# Setup Ollama to use GPU

## Edit the systemd service

```
sudo nano /etc/systemd/system/ollama.service
```
Add:

```
Environment="OLLAMA_IGPU_ENABLE=1"
Environment="HSA_OVERRIDE_GFX_VERSION=9.0.0"
```

Restart the Ollama service:

```
sudo systemctl restart ollama
```
