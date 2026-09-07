import { Router } from 'express';
import { listModels } from '../providers/ollama.js';
import { config } from '../config.js';

export const healthRouter = Router();

healthRouter.get('/live', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'maia-chat'
  });
});

async function readiness(_req, res) {
  try {
    const models = await listModels();
    const defaultModelInstalled = models.some((model) => model.id === config.defaultModel);
    if (!defaultModelInstalled) {
      return res.status(503).json({
        status: 'degraded',
        service: 'maia-chat',
        ollama: true,
        modelsCount: models.length,
        models: models.map((m) => m.id),
        defaultModel: config.defaultModel,
        reason: 'default_model_not_installed'
      });
    }
    res.status(200).json({
      status: 'ok',
      service: 'maia-chat',
      ollama: true,
      modelsCount: models.length,
      models: models.map((m) => m.id),
      defaultModel: config.defaultModel
    });
  } catch {
    res.status(503).json({
      status: 'degraded',
      service: 'maia-chat',
      ollama: false,
      modelsCount: 0,
      models: [],
      defaultModel: config.defaultModel
    });
  }
}

healthRouter.get('/ready', readiness);
healthRouter.get('/', readiness);
