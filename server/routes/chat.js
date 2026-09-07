import { Router } from 'express';
import crypto from 'node:crypto';
import { chatCompletion } from '../providers/ollama.js';
import { config } from '../config.js';
import { ContextOverflowError, errorPayload, ModelDisabledError } from '../errors.js';
import { estimateInputTokens } from '../context.js';
import { validateGenerationSettings } from '../generation.js';
import { validateTools } from '../tools.js';
import { acquireGeneration, releaseGeneration, validateRequestLimits } from '../limits.js';
import { isDraining, registerStream, unregisterStream } from '../lifecycle.js';
import { enforceRateLimit } from '../rate-limit.js';
import { log } from '../observability.js';
import { recordGeneration } from '../metrics.js';

export const chatRouter = Router();

function completionId() {
  return `chatcmpl-${crypto.randomUUID().replaceAll('-', '')}`;
}

function unixTime() {
  return Math.floor(Date.now() / 1000);
}

chatRouter.post('/', async (req, res, next) => {
  const body = req.body || {};

  if (isDraining()) {
    return res.status(503).json({
      error: {
        message: 'The server is shutting down. Please retry shortly.',
        type: 'service_unavailable_error',
        code: 'server_shutting_down'
      }
    });
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return res.status(400).json({
      error: {
        message: '`messages` must be a non-empty array.',
        type: 'invalid_request_error'
      }
    });
  }

  validateGenerationSettings(body);
  validateRequestLimits(body);
  validateTools(body.tools);
  try {
    enforceRateLimit({ ip: req.ip, keyId: req.apiKeyId });
  } catch (error) {
    if (error.retryAfterMs) res.set('Retry-After', String(Math.ceil(error.retryAfterMs / 1000)));
    return next(error);
  }

  const inputTokens = estimateInputTokens(body.messages);
  if (inputTokens >= config.defaultContextWindow) {
    return next(new ContextOverflowError(inputTokens, config.defaultContextWindow));
  }

  const model = body.model || config.defaultModel;
  if (config.modelBlacklist.includes(model)) {
    return next(new ModelDisabledError(model));
  }
  const clientId = req.apiKeyId || req.ip;
  const id = completionId();
  const created = unixTime();
  const requestStartedAt = Date.now();

  if (body.stream === false) {
    try {
      await acquireGeneration(clientId);
    } catch (error) {
      res.set('Retry-After', '5');
      return next(error);
    }
    try {
      const result = await chatCompletion({ ...body, stream: false });

      recordGeneration({
        success: true,
        durationMs: Date.now() - requestStartedAt,
        promptTokens: result.promptEvalCount,
        completionTokens: result.evalCount
      });

      log('generation_completed', {
        requestId: req.requestId,
        completionId: id,
        model: result.model,
        streamed: false,
        durationMs: Date.now() - requestStartedAt,
        promptTokens: result.promptEvalCount,
        completionTokens: result.evalCount
      });

      return res.json({
        id,
        object: 'chat.completion',
        created,
        model: result.model,
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: result.content,
              ...((result.toolCalls?.length || 0) > 0 ? { tool_calls: result.toolCalls } : {})
            },
            finish_reason: result.toolCalls?.length > 0 ? 'tool_calls' : result.doneReason
          }
        ],
        usage: {
          prompt_tokens: result.promptEvalCount,
          completion_tokens: result.evalCount,
          total_tokens: result.promptEvalCount + result.evalCount
        }
      });
    } catch (error) {
      recordGeneration({ success: false, durationMs: Date.now() - requestStartedAt });
      log('generation_failed', {
        requestId: req.requestId,
        completionId: id,
        streamed: false,
        durationMs: Date.now() - requestStartedAt,
        errorCode: error.code || 'internal_error'
      });
      return next(error);
    } finally {
      releaseGeneration(clientId);
    }
  }

  try {
    await acquireGeneration(clientId);
  } catch (error) {
    res.set('Retry-After', '5');
    return next(error);
  }
  const controller = new AbortController();
  if (!registerStream(controller)) {
    releaseGeneration(clientId);
    return res.status(503).json({
      error: {
        message: 'The server is shutting down. Please retry shortly.',
        type: 'service_unavailable_error',
        code: 'server_shutting_down'
      }
    });
  }
  res.on('close', () => {
    if (!res.writableEnded) controller.abort();
  });

  res.status(200);
  res.set({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.flushHeaders();

  let sentRole = false;
  const startedAt = Date.now();
  let firstTokenAt = null;

  try {
    const result = await chatCompletion(
      { ...body, stream: true },
      {
        signal: controller.signal,
        onChunk: (chunk) => {
          if (firstTokenAt === null && chunk.content) firstTokenAt = Date.now();
          const payload = {
            id,
            object: 'chat.completion.chunk',
            created,
            model: chunk.model || model,
            choices: [
              {
                index: 0,
                delta: sentRole
                  ? { content: chunk.content }
                  : { role: 'assistant', content: chunk.content },
                finish_reason: null
              }
            ]
          };

          sentRole = true;
          res.write(`data: ${JSON.stringify(payload)}\n\n`);
        }
      }
    );

    const finalPayload = {
      id,
      object: 'chat.completion.chunk',
      created,
      model,
      usage: {
        prompt_tokens: result.promptEvalCount,
        completion_tokens: result.evalCount,
        total_tokens: result.promptEvalCount + result.evalCount
      },
      elapsed_ms: Date.now() - startedAt,
      choices: [
        {
          index: 0,
          delta: result.toolCalls?.length > 0 ? { tool_calls: result.toolCalls } : {},
          finish_reason: result.toolCalls?.length > 0 ? 'tool_calls' : 'stop'
        }
      ]
    };

    res.write(`data: ${JSON.stringify(finalPayload)}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
    recordGeneration({
      success: true,
      durationMs: Date.now() - startedAt,
      firstTokenMs: firstTokenAt === null ? null : firstTokenAt - startedAt,
      promptTokens: result.promptEvalCount,
      completionTokens: result.evalCount
    });
    log('generation_completed', {
      requestId: req.requestId,
      completionId: id,
      model: result.model,
      streamed: true,
      firstTokenMs: firstTokenAt === null ? null : firstTokenAt - startedAt,
      durationMs: Date.now() - startedAt,
      promptTokens: result.promptEvalCount,
      completionTokens: result.evalCount
    });
  } catch (error) {
    if (!controller.signal.aborted) {
      const payload = errorPayload(error);
      res.write(`data: ${JSON.stringify(payload.body)}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
    }
    recordGeneration({
      success: false,
      durationMs: Date.now() - startedAt,
      firstTokenMs: firstTokenAt === null ? null : firstTokenAt - startedAt
    });
    log('generation_failed', {
      requestId: req.requestId,
      completionId: id,
      streamed: true,
      durationMs: Date.now() - startedAt,
      errorCode: controller.signal.aborted ? 'request_aborted' : error.code || 'internal_error'
    });
  } finally {
    unregisterStream(controller);
    releaseGeneration(clientId);
  }
});
