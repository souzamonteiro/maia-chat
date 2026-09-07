import crypto from 'node:crypto';
import { Router } from 'express';
import { config } from '../config.js';
import { generationStats } from '../limits.js';
import { metricsText } from '../metrics.js';

export const metricsRouter = Router();

function authorized(req) {
  if (!config.metricsToken) return false;
  const token = (req.get('authorization') || '').split(' ')[1] || '';
  const expected = crypto.createHash('sha256').update(config.metricsToken).digest();
  const received = crypto.createHash('sha256').update(token).digest();
  return crypto.timingSafeEqual(expected, received);
}

metricsRouter.get('/', (req, res) => {
  if (!authorized(req)) return res.sendStatus(404);
  res.type('text/plain; version=0.0.4; charset=utf-8').send(metricsText(generationStats()));
});
