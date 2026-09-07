import assert from 'node:assert/strict';
import test from 'node:test';

import { modelInfoRows } from '../public/js/model-info.js';

test('modelInfoRows exposes public model details without prompt configuration', () => {
  const rows = modelInfoRows({
    id: 'qwen2.5:3b',
    provider: 'Ollama',
    parameter_size: '3B',
    context_window: 8192,
    capabilities: ['chat', 'streaming'],
    status: 'default_loaded',
    loaded: true,
    systemPrompt: 'private'
  });

  assert.deepEqual(rows, [
    ['Canonical ID', 'qwen2.5:3b'],
    ['Provider', 'Ollama'],
    ['Parameters', '3B'],
    ['Context window', `${(8192).toLocaleString()} tokens`],
    ['Capabilities', 'chat, streaming'],
    ['Status', 'Default · Loaded']
  ]);
  assert.doesNotMatch(JSON.stringify(rows), /private/);
});
