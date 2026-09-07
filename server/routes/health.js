import { Router } from 'express';
import crypto from 'node:crypto';
import { listModels } from '../providers/ollama.js';
import { config } from '../config.js';

export const healthRouter = Router();

healthRouter.get('/live', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'maia-chat'
  });
});

function authorized(req) {
  if (!config.operationsToken) return false;
  const token = (req.get('authorization') || '').split(' ')[1] || '';
  const expected = crypto.createHash('sha256').update(config.operationsToken).digest();
  const received = crypto.createHash('sha256').update(token).digest();
  return crypto.timingSafeEqual(expected, received);
}

function publicHealth({ status, ollama, modelsCount }) {
  return { status, service: 'maia-chat', ollama, modelsCount };
}

async function readiness(_req, res, { detailed = false } = {}) {
  try {
    const models = await listModels();
    const defaultModelInstalled = models.some((model) => model.id === config.defaultModel);
    if (!defaultModelInstalled) {
      const payload = {
        status: 'degraded',
        service: 'maia-chat',
        ollama: true,
        modelsCount: models.length
      };
      if (detailed) {
        payload.models = models.map((model) => model.id);
        payload.defaultModel = config.defaultModel;
        payload.reason = 'default_model_not_installed';
      }
      return res.status(503).json(payload);
    }
    const payload = {
      status: 'ok',
      service: 'maia-chat',
      ollama: true,
      modelsCount: models.length
    };
    if (detailed) {
      payload.models = models.map((model) => model.id);
      payload.defaultModel = config.defaultModel;
    }
    res.status(200).json(payload);
  } catch {
    res.status(503).json(publicHealth({ status: 'degraded', ollama: false, modelsCount: 0 }));
  }
}

healthRouter.get('/ready', (req, res) => {
  if (!authorized(req)) return res.sendStatus(404);
  return readiness(req, res, { detailed: true });
});
healthRouter.get('/', readiness);
