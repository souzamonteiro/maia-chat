#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:3080}"
MODEL="${MODEL:-qwen2.5:14b}"

echo "== Health =="
curl -fsS "$BASE_URL/api/health"
echo
echo

echo "== Models =="
curl -fsS "$BASE_URL/v1/models"
echo
echo

echo "== Chat =="
curl -N "$BASE_URL/v1/chat/completions" \
  -H 'Content-Type: application/json' \
  -d "{
    \"model\": \"$MODEL\",
    \"stream\": true,
    \"messages\": [
      {\"role\": \"user\", \"content\": \"Say hello in English and Portuguese.\"}
    ]
  }"
echo
