import { config } from '../config.js';
import * as openaiCompatible from './openai-compatible.js';
import { validateTools } from '../tools.js';
import {
  AppError,
  ModelDisabledError,
  ModelNotInstalledError,
  NoModelsInstalledError,
  OllamaUnavailableError,
  UpstreamResponseError,
  UpstreamTimeoutError
} from '../errors.js';

function withTimeout(signal) {
  const controller = new AbortController();
  let timeout;

  const reset = () => {
    clearTimeout(timeout);
    timeout = setTimeout(
      () => controller.abort(new UpstreamTimeoutError()),
      config.ollamaTimeoutMs
    );
  };

  reset();

  if (signal) {
    if (signal.aborted) controller.abort();
    signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  return {
    signal: controller.signal,
    reset,
    clear: () => clearTimeout(timeout)
  };
}

function displayName(id) {
  return id.replace(/[:_-]/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}

function parameterSize(model) {
  return (
    model.details?.parameter_size ||
    model.name.match(/:(\d+(?:\.\d+)?b)/i)?.[1]?.toUpperCase() ||
    null
  );
}

export async function listModels() {
  if (config.inferenceProvider === 'openai-compatible') return openaiCompatible.listModels();
  const timed = withTimeout();

  try {
    const response = await fetch(`${config.ollamaUrl}/api/tags`, {
      signal: timed.signal
    });

    if (!response.ok) throw new UpstreamResponseError(response.status);

    const data = await response.json();
    return (data.models || [])
      .filter((model) => !config.modelBlacklist.includes(model.name))
      .map((model) => ({
        id: model.name,
        object: 'model',
        created: model.modified_at ? Math.floor(new Date(model.modified_at).getTime() / 1000) : 0,
        owned_by: 'ollama',
        provider: 'Ollama',
        display_name: displayName(model.name),
        parameter_size: parameterSize(model),
        context_window: config.defaultContextWindow,
        capabilities: ['chat', 'streaming'],
        generation_defaults: config.modelSettings[model.name]?.generation || null,
        status: model.name === config.defaultModel ? 'default' : 'installed'
      }));
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new OllamaUnavailableError('Could not connect to Ollama.', { cause: error });
  } finally {
    timed.clear();
  }
}

export async function listRunningModelIds() {
  if (config.inferenceProvider === 'openai-compatible')
    return openaiCompatible.listRunningModelIds();
  const timed = withTimeout();
  try {
    const response = await fetch(`${config.ollamaUrl}/api/ps`, { signal: timed.signal });
    if (!response.ok) return new Set();
    const data = await response.json();
    return new Set((data.models || []).map((model) => model.name).filter(Boolean));
  } catch {
    return new Set();
  } finally {
    timed.clear();
  }
}

export async function warmModel(model = config.defaultModel) {
  if (config.inferenceProvider === 'openai-compatible') return openaiCompatible.warmModel(model);
  const timed = withTimeout();
  try {
    const response = await fetch(`${config.ollamaUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt: '',
        stream: false,
        keep_alive: '10m',
        options: { num_predict: 0 }
      }),
      signal: timed.signal
    });
    if (!response.ok) throw new UpstreamResponseError(response.status);
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new OllamaUnavailableError('Could not warm up the default model.', { cause: error });
  } finally {
    timed.clear();
  }
}

async function resolveModel(model) {
  let targetModel = model || config.defaultModel;
  if (config.modelBlacklist.includes(targetModel)) {
    throw new ModelDisabledError(targetModel);
  }
  const models = await listModels();

  if (models.length === 0) throw new NoModelsInstalledError();
  if (!models.some((item) => item.id === targetModel)) {
    if (model) throw new ModelNotInstalledError(targetModel);
    targetModel = models[0].id;
  }
  return targetModel;
}

export async function createEmbeddings({ model, input }) {
  if (config.inferenceProvider === 'openai-compatible') {
    return openaiCompatible.createEmbeddings({ model, input });
  }
  const targetModel = await resolveModel(model);
  const timed = withTimeout();

  try {
    const response = await fetch(`${config.ollamaUrl}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: targetModel, input }),
      signal: timed.signal
    });
    if (!response.ok) throw new UpstreamResponseError(response.status, await response.text());

    const data = await response.json();
    if (!Array.isArray(data.embeddings)) {
      throw new UpstreamResponseError(response.status, 'Ollama returned no embeddings.');
    }
    return { model: data.model || targetModel, embeddings: data.embeddings };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new OllamaUnavailableError('Could not connect to Ollama.', { cause: error });
  } finally {
    timed.clear();
  }
}

export async function chatCompletion(body, { signal, onChunk } = {}) {
  if (config.inferenceProvider === 'openai-compatible') {
    return openaiCompatible.chatCompletion(body, { signal, onChunk });
  }
  const targetModel = await resolveModel(body.model);
  const tools = validateTools(body.tools);

  const timed = withTimeout(signal);
  const messages = body.messages || [];
  const settings = config.modelSettings[targetModel] || {};
  const systemPrompt = settings.systemPrompt ?? config.systemPrompt;
  const systemMessages = systemPrompt ? [{ role: 'system', content: systemPrompt }] : [];

  const ollamaBody = {
    model: targetModel,
    messages: [...systemMessages, ...messages],
    stream: body.stream !== false
  };
  if (tools.length > 0) ollamaBody.tools = tools;

  const generation = { ...settings.generation };
  if (body.temperature !== undefined) generation.temperature = body.temperature;
  if (body.top_p !== undefined) generation.top_p = body.top_p;
  if (body.max_tokens !== undefined) generation.max_tokens = body.max_tokens;
  if (Object.keys(generation).length > 0) {
    ollamaBody.options = {};
    if (generation.temperature !== undefined)
      ollamaBody.options.temperature = generation.temperature;
    if (generation.top_p !== undefined) ollamaBody.options.top_p = generation.top_p;
    if (generation.max_tokens !== undefined) ollamaBody.options.num_predict = generation.max_tokens;
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
      throw new UpstreamResponseError(response.status, detail);
    }

    if (!ollamaBody.stream) {
      const data = await response.json();
      let content = data.message?.content || '';
      if (data.message?.thinking) {
        content = `<think>\n${data.message.thinking}\n</think>\n\n${content}`;
      }
      return {
        model: data.model || ollamaBody.model,
        content,
        ...(data.message?.tool_calls ? { toolCalls: data.message.tool_calls } : {}),
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
    let inThinking = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      // The timeout protects against a stalled Ollama connection. A model that
      // is actively streaming may legitimately take longer than the timeout.
      timed.reset();
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;
        const data = JSON.parse(line);

        const content = data.message?.content || '';
        const thinking = data.message?.thinking || '';

        if (thinking) {
          if (!inThinking) {
            inThinking = true;
            onChunk?.({
              model: data.model || ollamaBody.model,
              content: '<think>\n' + thinking,
              done: false
            });
          } else {
            onChunk?.({
              model: data.model || ollamaBody.model,
              content: thinking,
              done: false
            });
          }
        } else if (content) {
          if (inThinking) {
            inThinking = false;
            onChunk?.({
              model: data.model || ollamaBody.model,
              content: '\n</think>\n\n' + content,
              done: false
            });
          } else {
            onChunk?.({
              model: data.model || ollamaBody.model,
              content,
              done: false
            });
          }
        }

        if (data.done) {
          if (inThinking) {
            inThinking = false;
            onChunk?.({
              model: data.model || ollamaBody.model,
              content: '\n</think>\n\n',
              done: false
            });
          }
          finalData = data;
        }
      }
    }

    buffer += decoder.decode();
    if (buffer.trim()) {
      const data = JSON.parse(buffer);
      const content = data.message?.content || '';
      const thinking = data.message?.thinking || '';

      if (thinking) {
        onChunk?.({
          model: data.model || ollamaBody.model,
          content: `${inThinking ? '' : '<think>\n'}${thinking}`,
          done: false
        });
        inThinking = true;
      } else if (content) {
        onChunk?.({
          model: data.model || ollamaBody.model,
          content: `${inThinking ? '\n</think>\n\n' : ''}${content}`,
          done: false
        });
        inThinking = false;
      }

      if (data.done) finalData = data;
    }

    if (inThinking) {
      onChunk?.({
        model: finalData?.model || ollamaBody.model,
        content: '\n</think>\n\n',
        done: false
      });
    }

    return {
      model: finalData?.model || ollamaBody.model,
      content: '',
      ...(finalData?.message?.tool_calls ? { toolCalls: finalData.message.tool_calls } : {}),
      promptEvalCount: finalData?.prompt_eval_count || 0,
      evalCount: finalData?.eval_count || 0,
      doneReason: finalData?.done_reason || 'stop'
    };
  } finally {
    timed.clear();
  }
}

export async function health() {
  if (config.inferenceProvider === 'openai-compatible') {
    try {
      await openaiCompatible.listModels();
      return true;
    } catch {
      return false;
    }
  }
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
