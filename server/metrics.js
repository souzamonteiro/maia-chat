const counters = new Map();
const sums = new Map();

function add(map, name, value = 1) {
  map.set(name, (map.get(name) || 0) + value);
}

function labels(values) {
  return Object.entries(values)
    .map(
      ([key, value]) => `${key}="${String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`
    )
    .join(',');
}

export function recordRequest({ method, path, status, durationMs }) {
  add(counters, `maia_http_requests_total{${labels({ method, path, status })}}`);
  add(sums, 'maia_http_request_duration_seconds_sum', durationMs / 1000);
  add(counters, 'maia_http_request_duration_seconds_count');
}

export function recordGeneration({
  success,
  durationMs,
  firstTokenMs,
  promptTokens,
  completionTokens
}) {
  add(counters, `maia_generations_total{${labels({ outcome: success ? 'completed' : 'failed' })}}`);
  add(sums, 'maia_generation_duration_seconds_sum', durationMs / 1000);
  add(counters, 'maia_generation_duration_seconds_count');
  if (firstTokenMs !== null && firstTokenMs !== undefined) {
    add(sums, 'maia_generation_first_token_seconds_sum', firstTokenMs / 1000);
    add(counters, 'maia_generation_first_token_seconds_count');
  }
  if (success) {
    add(counters, 'maia_prompt_tokens_total', promptTokens || 0);
    add(counters, 'maia_completion_tokens_total', completionTokens || 0);
  }
}

export function metricsText({ activeGenerations = 0, queuedGenerations = 0 } = {}) {
  const lines = [
    '# HELP maia_http_requests_total Completed HTTP requests.',
    '# TYPE maia_http_requests_total counter',
    '# HELP maia_http_request_duration_seconds HTTP request duration.',
    '# TYPE maia_http_request_duration_seconds summary',
    '# HELP maia_generations_total Chat generation outcomes.',
    '# TYPE maia_generations_total counter',
    '# HELP maia_generation_duration_seconds Chat generation duration.',
    '# TYPE maia_generation_duration_seconds summary',
    '# HELP maia_generation_first_token_seconds Time to first streamed token.',
    '# TYPE maia_generation_first_token_seconds summary',
    '# HELP maia_prompt_tokens_total Upstream prompt tokens.',
    '# TYPE maia_prompt_tokens_total counter',
    '# HELP maia_completion_tokens_total Upstream completion tokens.',
    '# TYPE maia_completion_tokens_total counter',
    '# HELP maia_active_generations Active generation slots.',
    '# TYPE maia_active_generations gauge',
    `maia_active_generations ${activeGenerations}`,
    '# HELP maia_queued_generations Waiting generation requests.',
    '# TYPE maia_queued_generations gauge',
    `maia_queued_generations ${queuedGenerations}`
  ];
  for (const [name, value] of counters) lines.push(`${name} ${value}`);
  for (const [name, value] of sums) lines.push(`${name} ${value}`);
  return `${lines.join('\n')}\n`;
}

export function resetMetrics() {
  counters.clear();
  sums.clear();
}
