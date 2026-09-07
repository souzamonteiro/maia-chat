import { Router } from 'express';
import { listModels, listRunningModelIds } from '../providers/ollama.js';

export const modelsRouter = Router();

modelsRouter.get('/', async (_req, res, next) => {
  try {
    const [models, runningModels] = await Promise.all([listModels(), listRunningModelIds()]);
    const data = models.map((model) => {
      const loaded = runningModels.has(model.id);
      return {
        ...model,
        loaded,
        status: loaded ? (model.status === 'default' ? 'default_loaded' : 'loaded') : model.status
      };
    });
    res.json({
      object: 'list',
      data
    });
  } catch (error) {
    next(error);
  }
});
