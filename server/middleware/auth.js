import crypto from 'node:crypto';
import { config } from '../config.js';

function tokenHash(token) {
  return crypto
    .createHash('sha256')
    .update(token || '')
    .digest();
}

function keyMatches(key, receivedHash) {
  return crypto.timingSafeEqual(Buffer.from(key.hash, 'hex'), receivedHash);
}

function keyExpired(key) {
  return key.expiresAt && new Date(key.expiresAt).getTime() <= Date.now();
}

export function apiAuth(req, res, next) {
  if (config.apiKeys.length === 0) return next();

  const auth = req.get('authorization') || '';
  const [scheme, token] = auth.split(' ');
  const receivedHash = tokenHash(token);
  const key = config.apiKeys.find(
    (candidate) => !keyExpired(candidate) && keyMatches(candidate, receivedHash)
  );

  if (scheme !== 'Bearer' || !key) {
    return res.status(401).json({
      error: {
        message: 'Invalid or missing API key.',
        type: 'authentication_error'
      }
    });
  }

  req.apiKeyId = key.id;
  req.apiKeyScopes = key.scopes || ['models', 'chat'];
  next();
}

export function requireScope(scope) {
  return (req, res, next) => {
    if (!req.apiKeyScopes || req.apiKeyScopes.includes(scope)) return next();
    return res.status(403).json({
      error: {
        message: 'This API key does not have permission for this operation.',
        type: 'permission_error',
        code: 'insufficient_scope'
      }
    });
  };
}
