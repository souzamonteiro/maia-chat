import 'dotenv/config';

function csv(value = '') {
  return value.split(',').map(item => item.trim()).filter(Boolean);
}

export const config = {
  host: process.env.HOST || '127.0.0.1',
  port: Number(process.env.PORT || 3080),
  maiaName: process.env.MAIA_NAME || 'Maia',
  defaultModel: process.env.MAIA_DEFAULT_MODEL || 'qwen2.5:14b',
  ollamaUrl: (process.env.OLLAMA_URL || 'http://127.0.0.1:11434').replace(/\/$/, ''),
  ollamaTimeoutMs: Number(process.env.OLLAMA_TIMEOUT_MS || 120000),
  apiKey: process.env.MAIA_API_KEY || '',
  allowedOrigins: csv(process.env.MAIA_ALLOWED_ORIGINS || '')
};
