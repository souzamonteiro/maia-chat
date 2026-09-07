import { Router } from 'express';
import { createEmbeddings } from '../providers/ollama.js';

export const embeddingsRouter = Router();

function inputs(value) {
  const items = typeof value === 'string' ? [value] : value;
  if (
    !Array.isArray(items) ||
    items.length === 0 ||
    items.some((item) => typeof item !== 'string')
  ) {
    return null;
  }
  return items;
}

embeddingsRouter.post('/', async (req, res, next) => {
  const input = inputs(req.body?.input);
  if (!input) {
    return res.status(400).json({
      error: {
        message: '`input` must be a non-empty string or array of strings.',
        type: 'invalid_request_error',
        code: 'invalid_embedding_input'
      }
    });
  }

  try {
    const result = await createEmbeddings({ model: req.body.model, input });
    return res.json({
      object: 'list',
      data: result.embeddings.map((embedding, index) => ({
        object: 'embedding',
        embedding,
        index
      })),
      model: result.model,
      usage: { prompt_tokens: 0, total_tokens: 0 }
    });
  } catch (error) {
    next(error);
  }
});
