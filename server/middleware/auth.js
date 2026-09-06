import { config } from '../config.js';

export function apiAuth(req, res, next) {
  if (!config.apiKey) return next();

  const auth = req.get('authorization') || '';
  const [scheme, token] = auth.split(' ');

  if (scheme !== 'Bearer' || token !== config.apiKey) {
    return res.status(401).json({
      error: {
        message: 'Invalid or missing API key.',
        type: 'authentication_error'
      }
    });
  }

  next();
}
