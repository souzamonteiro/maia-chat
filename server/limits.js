import { config } from './config.js';
import { GenerationQueueError, RequestLimitError } from './errors.js';

let activeGenerations = 0;
const generationQueue = [];
const activeByClient = new Map();

function clientKey(clientId) {
  return clientId || 'anonymous';
}

function canAcquire(clientId) {
  return (
    activeGenerations < config.maxConcurrentGenerations &&
    (activeByClient.get(clientId) || 0) < config.maxConcurrentGenerationsPerClient
  );
}

function activate(clientId) {
  activeGenerations += 1;
  activeByClient.set(clientId, (activeByClient.get(clientId) || 0) + 1);
}

function dispatchQueue() {
  const index = generationQueue.findIndex((entry) => canAcquire(entry.clientId));
  if (index < 0) return;
  const [entry] = generationQueue.splice(index, 1);
  activate(entry.clientId);
  entry.resolve();
}

export function validateRequestLimits(body) {
  if (body.messages.length > config.maxMessages) {
    throw new RequestLimitError(`A request can include at most ${config.maxMessages} messages.`);
  }
  if (body.max_tokens !== undefined && body.max_tokens > config.maxOutputTokens) {
    throw new RequestLimitError(
      `\`max_tokens\` cannot exceed the configured ${config.maxOutputTokens}-token output limit.`
    );
  }
}

export function acquireGeneration(clientId) {
  const client = clientKey(clientId);
  if (generationQueue.length === 0 && canAcquire(client)) {
    activate(client);
    return Promise.resolve();
  }
  if (generationQueue.length >= config.maxQueuedGenerations) {
    return Promise.reject(
      new GenerationQueueError(
        'generation_queue_full',
        'Maia is busy. The generation queue is full; please retry shortly.'
      )
    );
  }

  return new Promise((resolve, reject) => {
    const entry = {
      clientId: client,
      resolve: () => {
        clearTimeout(entry.timeout);
        resolve();
      },
      timeout: setTimeout(() => {
        const index = generationQueue.indexOf(entry);
        if (index >= 0) generationQueue.splice(index, 1);
        reject(
          new GenerationQueueError(
            'generation_queue_timeout',
            'Maia is still busy. Please retry shortly.'
          )
        );
      }, config.generationQueueTimeoutMs)
    };
    generationQueue.push(entry);
  });
}

export function releaseGeneration(clientId) {
  const client = clientKey(clientId);
  activeGenerations = Math.max(0, activeGenerations - 1);
  const active = Math.max(0, (activeByClient.get(client) || 0) - 1);
  if (active === 0) activeByClient.delete(client);
  else activeByClient.set(client, active);
  dispatchQueue();
}

export function resetGenerationLimits() {
  activeGenerations = 0;
  activeByClient.clear();
  for (const entry of generationQueue) clearTimeout(entry.timeout);
  generationQueue.length = 0;
}

export function generationStats() {
  return { activeGenerations, queuedGenerations: generationQueue.length };
}
