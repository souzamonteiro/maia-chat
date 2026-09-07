import crypto from 'node:crypto';
import { recordRequest } from './metrics.js';

export function requestId(req, res, next) {
  req.requestId = req.get('x-request-id') || crypto.randomUUID();
  res.set('X-Request-Id', req.requestId);
  next();
}

export function log(event, fields = {}) {
  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      event,
      ...fields
    })
  );
}

export function requestLogger(req, res, next) {
  const startedAt = performance.now();
  res.on('finish', () => {
    const durationMs = Math.round(performance.now() - startedAt);
    recordRequest({ method: req.method, path: req.path, status: res.statusCode, durationMs });
    log('request_completed', {
      requestId: req.requestId,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs
    });
  });
  next();
}
