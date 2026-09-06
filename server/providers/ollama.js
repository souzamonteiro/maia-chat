import { config } from '../config.js';

function withTimeout(signal) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.ollamaTimeoutMs);

  if (signal) {
    if (signal.aborted) controller.abort();
    signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  return {
    signal: controller.signal,
    clear: () => clearTimeout(timeout)
  };
}

export async function listModels() {
  const timed = withTimeout();

  try {
    const response = await fetch(`${config.ollamaUrl}/api/tags`, {
      signal: timed.signal
    });

    if (!response.ok) {
      throw new Error(`Ollama returned HTTP ${response.status}`);
    }

    const data = await response.json();
    return (data.models || []).map(model => ({
      id: model.name,
      object: 'model',
      created: model.modified_at
        ? Math.floor(new Date(model.modified_at).getTime() / 1000)
        : 0,
      owned_by: 'ollama'
    }));
  } finally {
    timed.clear();
  }
}

export async function chatCompletion(body, { signal, onChunk } = {}) {
  const timed = withTimeout(signal);

  const ollamaBody = {
    model: body.model || config.defaultModel,
    messages: body.messages || [],
    stream: body.stream !== false
  };

  if (body.temperature !== undefined ||
      body.top_p !== undefined ||
      body.max_tokens !== undefined) {
    ollamaBody.options = {};
    if (body.temperature !== undefined) ollamaBody.options.temperature = body.temperature;
    if (body.top_p !== undefined) ollamaBody.options.top_p = body.top_p;
    if (body.max_tokens !== undefined) ollamaBody.options.num_predict = body.max_tokens;
  }

  try {
    const response = await fetch(`${config.ollamaUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ollamaBody),
      signal: timed.signal
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Ollama returned HTTP ${response.status}: ${detail}`);
    }

    if (!ollamaBody.stream) {
      const data = await response.json();
      return {
        model: data.model || ollamaBody.model,
        content: data.message?.content || '',
        promptEvalCount: data.prompt_eval_count || 0,
        evalCount: data.eval_count || 0,
        doneReason: data.done_reason || 'stop'
      };
    }

    if (!response.body) {
      throw new Error('Ollama response has no body.');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let finalData = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;
        const data = JSON.parse(line);

        if (data.message?.content) {
          onChunk?.({
            model: data.model || ollamaBody.model,
            content: data.message.content,
            done: false
          });
        }

        if (data.done) {
          finalData = data;
        }
      }
    }

    return {
      model: finalData?.model || ollamaBody.model,
      content: '',
      promptEvalCount: finalData?.prompt_eval_count || 0,
      evalCount: finalData?.eval_count || 0,
      doneReason: finalData?.done_reason || 'stop'
    };
  } finally {
    timed.clear();
  }
}

export async function health() {
  const timed = withTimeout();

  try {
    const response = await fetch(`${config.ollamaUrl}/api/tags`, {
      signal: timed.signal
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    timed.clear();
  }
}
