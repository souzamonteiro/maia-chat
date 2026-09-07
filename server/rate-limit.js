import { config } from './config.js';
import { RateLimitError } from './errors.js';

const requests = new Map();

function checkBucket(key, now) {
  const windowStart = now - config.rateLimitWindowMs;
  const entries = (requests.get(key) || []).filter((timestamp) => timestamp > windowStart);
  if (entries.length >= config.rateLimitMaxRequests) {
    requests.set(key, entries);
    const retryAfterMs = entries[0] + config.rateLimitWindowMs - now;
    throw Object.assign(new RateLimitError(), { retryAfterMs });
  }
  entries.push(now);
  requests.set(key, entries);
}

export function enforceRateLimit({ ip, keyId, now = Date.now() }) {
  checkBucket(`ip:${ip}`, now);
  if (keyId) checkBucket(`key:${keyId}`, now);
}

export function resetRateLimits() {
  requests.clear();
}
