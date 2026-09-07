import { config } from '../config.js';
import {
  AppError,
  ModelDisabledError,
  ModelNotInstalledError,
  NoModelsInstalledError,
  OllamaUnavailableError,
  UpstreamResponseError
} from '../errors.js';
import { validateTools } from '../tools.js';

function headers() {
  return {
    'Content-Type': 'application/json',
    ...(config.openaiCompatibleToken
      ? { Authorization: `Bearer ${config.openaiCompatibleToken}` }
      : {})
  };
}

function displayName(id) {
  return id.replace(/[:_-]/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}

async function request(path, options = {}) {
  try {
    const response = await fetch(`${config.openaiCompatibleUrl}${path}`, {
      ...options,
      headers: { ...headers(), ...options.headers }
    });
    if (!response.ok) throw new UpstreamResponseError(response.status, await response.text());
    return response;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new OllamaUnavailableError('Could not connect to the inference provider.', {
      cause: error
    });
  }
}

export async function listModels() {
  const response = await request('/v1/models');
  const data = await response.json();
  return (data.data || [])
    .filter((model) => !config.modelBlacklist.includes(model.id))
    .map((model) => ({
      id: model.id,
      object: 'model',
      created: model.created || 0,
      owned_by: model.owned_by || 'openai-compatible',
      provider: 'OpenAI-compatible',
      display_name: displayName(model.id),
      parameter_size: null,
      context_window: config.defaultContextWindow,
      capabilities: ['chat', 'streaming'],
      generation_defaults: config.modelSettings[model.id]?.generation || null,
      status: model.id === config.defaultModel ? 'default' : 'installed'
    }));
}

async function resolveModel(model) {
  let targetModel = model || config.defaultModel;
  if (config.modelBlacklist.includes(targetModel)) throw new ModelDisabledError(targetModel);
  const models = await listModels();
  if (models.length === 0) throw new NoModelsInstalledError();
  if (!models.some((item) => item.id === targetModel)) {
    if (model) throw new ModelNotInstalledError(targetModel);
    targetModel = models[0].id;
  }
  return targetModel;
}

function completionBody(body, model) {
  const settings = config.modelSettings[model] || {};
  const systemPrompt = settings.systemPrompt ?? config.systemPrompt;
  const generation = { ...settings.generation };
  for (const key of ['temperature', 'top_p', 'max_tokens']) {
    if (body[key] !== undefined) generation[key] = body[key];
  }
  const tools = validateTools(body.tools);
  return {
    model,
    messages: [
      ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
      ...(body.messages || [])
    ],
    stream: body.stream !== false,
    ...(Object.keys(generation).length > 0 ? generation : {}),
    ...(tools.length > 0 ? { tools } : {})
  };
}

function result(data, model) {
  const choice = data.choices?.[0] || {};
  const message = choice.message || {};
  return {
    model: data.model || model,
    content: message.content || '',
    ...(message.tool_calls ? { toolCalls: message.tool_calls } : {}),
    promptEvalCount: data.usage?.prompt_tokens || 0,
    evalCount: data.usage?.completion_tokens || 0,
    doneReason: choice.finish_reason || 'stop'
  };
}

export async function chatCompletion(body, { signal, onChunk } = {}) {
  const model = await resolveModel(body.model);
  const response = await request('/v1/chat/completions', {
    method: 'POST',
    body: JSON.stringify(completionBody(body, model)),
    signal
  });
  if (body.stream === false) return result(await response.json(), model);
  if (!response.body) throw new UpstreamResponseError(502, 'Provider response has no body.');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finishReason = 'stop';
  let toolCalls;
  let usage = {};
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (!line.startsWith('data:')) continue;
      const source = line.slice(5).trim();
      if (!source || source === '[DONE]') continue;
      const data = JSON.parse(source);
      const choice = data.choices?.[0] || {};
      if (choice.delta?.content)
        onChunk?.({ model: data.model || model, content: choice.delta.content });
      if (choice.delta?.tool_calls) toolCalls = choice.delta.tool_calls;
      if (choice.finish_reason) finishReason = choice.finish_reason;
      if (data.usage) usage = data.usage;
    }
  }
  return {
    model,
    content: '',
    ...(toolCalls ? { toolCalls } : {}),
    promptEvalCount: usage.prompt_tokens || 0,
    evalCount: usage.completion_tokens || 0,
    doneReason: finishReason
  };
}

export async function createEmbeddings({ model, input }) {
  const targetModel = await resolveModel(model);
  const response = await request('/v1/embeddings', {
    method: 'POST',
    body: JSON.stringify({ model: targetModel, input })
  });
  const data = await response.json();
  return {
    model: data.model || targetModel,
    embeddings: (data.data || []).map((item) => item.embedding)
  };
}

export async function listRunningModelIds() {
  return new Set();
}

export async function warmModel() {}
