const positiveIntegers = [
  'port',
  'defaultContextWindow',
  'maxRequestBytes',
  'maxMessages',
  'maxOutputTokens',
  'maxConcurrentGenerations',
  'maxConcurrentGenerationsPerClient',
  'maxQueuedGenerations',
  'generationQueueTimeoutMs',
  'rateLimitWindowMs',
  'rateLimitMaxRequests',
  'searchTimeoutMs',
  'searchMaxResults',
  'shutdownTimeoutMs',
  'ollamaTimeoutMs'
];

export function validateConfiguration(config) {
  if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535.');
  }
  if (!config.host.trim()) throw new Error('HOST must not be empty.');
  if (!['ollama', 'openai-compatible'].includes(config.inferenceProvider)) {
    throw new Error('MAIA_INFERENCE_PROVIDER must be ollama or openai-compatible.');
  }
  if (!['disabled', 'searxng'].includes(config.searchProvider)) {
    throw new Error('MAIA_SEARCH_PROVIDER must be disabled or searxng.');
  }

  for (const field of positiveIntegers.filter((field) => field !== 'port')) {
    if (!Number.isInteger(config[field]) || config[field] < 1) {
      throw new Error(`${field} must be a positive integer.`);
    }
  }

  try {
    const url = new URL(config.ollamaUrl);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('unsupported protocol');
  } catch {
    throw new Error('OLLAMA_URL must be a valid http:// or https:// URL.');
  }
  if (config.inferenceProvider === 'openai-compatible') {
    try {
      const url = new URL(config.openaiCompatibleUrl);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('unsupported protocol');
    } catch {
      throw new Error('MAIA_OPENAI_COMPATIBLE_URL must be a valid http:// or https:// URL.');
    }
  }
  if (config.searchProvider === 'searxng') {
    try {
      const url = new URL(config.searxngUrl);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('unsupported protocol');
    } catch {
      throw new Error('MAIA_SEARXNG_URL must be a valid http:// or https:// URL.');
    }
  }

  const namedProxies = new Set(['loopback', 'linklocal', 'uniquelocal']);
  for (const proxy of config.trustedProxy) {
    if (!namedProxies.has(proxy) && !/^[0-9a-f:.]+(?:\/\d{1,3})?$/i.test(proxy)) {
      throw new Error(
        'MAIA_TRUSTED_PROXY must contain IP addresses, CIDRs, or Express named ranges.'
      );
    }
  }

  const ids = new Set();
  for (const key of config.apiKeys) {
    if (!key.id || ids.has(key.id)) throw new Error('MAIA_API_KEYS must use unique non-empty IDs.');
    if (!/^[a-f0-9]{64}$/i.test(key.hash))
      throw new Error(`API key ${key.id} has an invalid hash.`);
    if (
      key.scopes &&
      (!Array.isArray(key.scopes) ||
        key.scopes.some((scope) => !['models', 'chat', 'embeddings'].includes(scope)))
    ) {
      throw new Error(`API key ${key.id} has invalid scopes.`);
    }
    if (key.expiresAt && Number.isNaN(new Date(key.expiresAt).getTime())) {
      throw new Error(`API key ${key.id} has an invalid expiresAt value.`);
    }
    ids.add(key.id);
  }

  for (const [model, settings] of Object.entries(config.modelSettings)) {
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
      throw new Error(`Model settings for ${model} must be an object.`);
    }
    if (settings.systemPrompt !== undefined && typeof settings.systemPrompt !== 'string') {
      throw new Error(`Model settings for ${model} must use a string systemPrompt.`);
    }
    const generation = settings.generation || {};
    for (const [name, value] of Object.entries(generation)) {
      const limits = {
        temperature: [0, 2],
        top_p: [0.01, 1],
        max_tokens: [1, config.maxOutputTokens]
      };
      if (
        !limits[name] ||
        typeof value !== 'number' ||
        !Number.isFinite(value) ||
        value < limits[name][0] ||
        value > limits[name][1] ||
        (name === 'max_tokens' && !Number.isInteger(value))
      ) {
        throw new Error(`Model settings for ${model} have an invalid ${name} default.`);
      }
    }
  }

  if (config.modelBlacklist.includes(config.defaultModel)) {
    throw new Error('MAIA_DEFAULT_MODEL cannot be included in MAIA_MODEL_BLACKLIST.');
  }
}
