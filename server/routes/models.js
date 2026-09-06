import { Router } from 'express';
import { listModels } from '../providers/ollama.js';

export const modelsRouter = Router();

modelsRouter.get('/', async (_req, res, next) => {
  try {
    const data = await listModels();
    res.json({
      object: 'list',
      data
    });
  } catch (error) {
    next(error);
  }
});
