import { Router } from 'express';
import { RequestLimitError } from '../errors.js';
import { enforceRateLimit } from '../rate-limit.js';
import { searchWeb } from '../search.js';

export const searchRouter = Router();

searchRouter.get('/', async (req, res, next) => {
  const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (!query || query.length > 512) {
    return next(new RequestLimitError('`q` must be a non-empty query of at most 512 characters.'));
  }
  try {
    enforceRateLimit({ ip: req.ip, keyId: req.apiKeyId });
    const results = await searchWeb(query, { language: req.query.language });
    res.json({ object: 'list', data: results });
  } catch (error) {
    next(error);
  }
});
