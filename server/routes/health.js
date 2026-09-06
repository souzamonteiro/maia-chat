import { Router } from 'express';
import { health } from '../providers/ollama.js';
import { config } from '../config.js';

export const healthRouter = Router();

healthRouter.get('/', async (_req, res) => {
  const ollama = await health();

  res.status(ollama ? 200 : 503).json({
    status: ollama ? 'ok' : 'degraded',
    service: 'maia-chat',
    ollama,
    defaultModel: config.defaultModel
  });
});
