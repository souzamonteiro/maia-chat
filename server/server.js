import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { config } from './config.js';
import { apiAuth } from './middleware/auth.js';
import { chatRouter } from './routes/chat.js';
import { healthRouter } from './routes/health.js';
import { modelsRouter } from './routes/models.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, '..', 'public');

const app = express();

app.disable('x-powered-by');

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      "default-src": ["'self'"],
      "script-src": ["'self'"],
      "style-src": ["'self'"],
      "img-src": ["'self'", "data:"],
      "connect-src": ["'self'"],
      "font-src": ["'self'"],
      "object-src": ["'none'"],
      "base-uri": ["'self'"],
      "frame-ancestors": ["'none'"]
    }
  },
  crossOriginEmbedderPolicy: false
}));

app.use(morgan('combined'));
app.use(express.json({ limit: '2mb' }));

app.use((req, res, next) => {
  const origin = req.get('origin');

  if (!origin || config.allowedOrigins.length === 0) {
    return next();
  }

  if (config.allowedOrigins.includes(origin)) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Vary', 'Origin');
    res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  }

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }

  next();
});

app.get('/api/config', (_req, res) => {
  res.json({
    name: config.maiaName,
    defaultModel: config.defaultModel
  });
});

app.use('/api/health', healthRouter);

app.use('/v1', apiAuth);
app.use('/v1/models', modelsRouter);
app.use('/v1/chat/completions', chatRouter);

app.use(express.static(publicDir, {
  extensions: ['html'],
  maxAge: '1h'
}));

app.get('/{*splat}', (_req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.use((error, _req, res, _next) => {
  console.error(error);

  const isAbort = error?.name === 'AbortError';
  const status = isAbort ? 504 : 502;

  res.status(status).json({
    error: {
      message: isAbort ? 'Upstream request timed out.' : (error.message || 'Unexpected error.'),
      type: 'upstream_error'
    }
  });
});

app.listen(config.port, config.host, () => {
  console.log(`Maia Chat listening on http://${config.host}:${config.port}`);
  console.log(`Ollama upstream: ${config.ollamaUrl}`);
  console.log(`Default model: ${config.defaultModel}`);
});
