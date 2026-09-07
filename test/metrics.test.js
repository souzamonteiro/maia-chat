import assert from 'node:assert/strict';
import test from 'node:test';

import { metricsText, recordGeneration, recordRequest, resetMetrics } from '../server/metrics.js';

test.afterEach(() => resetMetrics());

test('metricsText emits Prometheus counters, durations, and capacity gauges', () => {
  recordRequest({ method: 'GET', path: '/ready', status: 200, durationMs: 25 });
  recordGeneration({
    success: true,
    durationMs: 1200,
    firstTokenMs: 200,
    promptTokens: 12,
    completionTokens: 8
  });

  const output = metricsText({ activeGenerations: 1, queuedGenerations: 2 });
  assert.match(output, /maia_http_requests_total\{method="GET",path="\/ready",status="200"\} 1/);
  assert.match(output, /maia_generation_first_token_seconds_sum 0\.2/);
  assert.match(output, /maia_prompt_tokens_total 12/);
  assert.match(output, /maia_active_generations 1/);
  assert.match(output, /maia_queued_generations 2/);
});
