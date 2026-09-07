import express from 'express';
import helmet from 'helmet';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { config } from './config.js';
import { validateConfiguration } from './config-validation.js';
import { apiAuth, requireScope } from './middleware/auth.js';
import { chatRouter } from './routes/chat.js';
import { healthRouter } from './routes/health.js';
import { modelsRouter } from './routes/models.js';
import { embeddingsRouter } from './routes/embeddings.js';
import { searchRouter } from './routes/search.js';
import { metricsRouter } from './routes/metrics.js';
import { warmModel } from './providers/ollama.js';
import { errorPayload } from './errors.js';
import { drainStreams } from './lifecycle.js';
import { log, requestId, requestLogger } from './observability.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, '..', 'public');

validateConfiguration(config);

const app = express();

app.disable('x-powered-by');
if (config.trustedProxy.length > 0) app.set('trust proxy', config.trustedProxy);

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        'default-src': ["'self'"],
        'script-src': ["'self'", "'sha256-df2u53kTsQ4L6nZwHoTGIc05eWJGpD7C+XOx8bSZiik='"],
        'style-src': ["'self'"],
        'img-src': ["'self'", 'data:'],
        'connect-src': ["'self'"],
        'font-src': ["'self'"],
        'object-src': ["'none'"],
        'base-uri': ["'self'"],
        'frame-ancestors': ["'none'"]
      }
    },
    crossOriginEmbedderPolicy: false
  })
);

app.use(requestId);
app.use(requestLogger);
app.use(express.json({ limit: config.maxRequestBytes }));

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
    version: config.version,
    defaultModel: config.defaultModel,
    webSearchEnabled: config.searchProvider === 'searxng'
  });
});

app.use('/api/health', healthRouter);
app.use('/api/metrics', metricsRouter);
app.use('/api/models', modelsRouter);
app.use('/api/search', searchRouter);
app.use('/api/chat/completions', chatRouter);

app.use('/v1', apiAuth);
app.use('/v1/models', requireScope('models'), modelsRouter);
app.use('/v1/chat/completions', requireScope('chat'), chatRouter);
app.use('/v1/embeddings', requireScope('embeddings'), embeddingsRouter);

app.use(
  '/vendor/marked',
  express.static(path.join(__dirname, '..', 'node_modules', 'marked', 'lib'))
);
app.use(
  '/vendor/dompurify',
  express.static(path.join(__dirname, '..', 'node_modules', 'dompurify', 'dist'))
);
app.use(
  '/vendor/highlight.js',
  express.static(path.join(__dirname, '..', 'node_modules', '@highlightjs', 'cdn-assets'))
);
app.use(
  express.static(publicDir, {
    extensions: ['html'],
    maxAge: '1h'
  })
);

app.get('/{*splat}', (_req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.use((error, req, res, _next) => {
  const payload = errorPayload(error);
  log('request_failed', {
    requestId: req.requestId,
    method: req.method,
    path: req.path,
    status: payload.status,
    errorCode: payload.body.error.code
  });
  res.status(payload.status).json(payload.body);
});

const server = app.listen(config.port, config.host, () => {
  log('server_started', {
    host: config.host,
    port: config.port,
    defaultModel: config.defaultModel
  });
  if (config.warmupModel) {
    warmModel().then(
      () => log('model_warmed', { model: config.defaultModel }),
      (error) =>
        log('model_warmup_failed', {
          model: config.defaultModel,
          errorCode: error.code || 'internal_error'
        })
    );
  }
});

// Ollama enforces inactivity timeouts. Do not impose a shorter total stream duration in Node.
server.requestTimeout = 0;
server.headersTimeout = 60_000;
server.keepAliveTimeout = 65_000;

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  log('server_draining', { signal });
  server.close();
  await drainStreams(config.shutdownTimeoutMs);
  process.exit(0);
}

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
