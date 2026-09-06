import { Router } from 'express';
import crypto from 'node:crypto';
import { chatCompletion } from '../providers/ollama.js';
import { config } from '../config.js';

export const chatRouter = Router();

function completionId() {
  return `chatcmpl-${crypto.randomUUID().replaceAll('-', '')}`;
}

function unixTime() {
  return Math.floor(Date.now() / 1000);
}

chatRouter.post('/', async (req, res, next) => {
  const body = req.body || {};

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return res.status(400).json({
      error: {
        message: '`messages` must be a non-empty array.',
        type: 'invalid_request_error'
      }
    });
  }

  const model = body.model || config.defaultModel;
  const id = completionId();
  const created = unixTime();

  if (body.stream === false) {
    try {
      const result = await chatCompletion({ ...body, model, stream: false });

      return res.json({
        id,
        object: 'chat.completion',
        created,
        model: result.model,
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: result.content
          },
          finish_reason: result.doneReason
        }],
        usage: {
          prompt_tokens: result.promptEvalCount,
          completion_tokens: result.evalCount,
          total_tokens: result.promptEvalCount + result.evalCount
        }
      });
    } catch (error) {
      return next(error);
    }
  }

  const controller = new AbortController();
  req.on('close', () => controller.abort());

  res.status(200);
  res.set({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.flushHeaders();

  let sentRole = false;

  try {
    await chatCompletion(
      { ...body, model, stream: true },
      {
        signal: controller.signal,
        onChunk: chunk => {
          const payload = {
            id,
            object: 'chat.completion.chunk',
            created,
            model: chunk.model || model,
            choices: [{
              index: 0,
              delta: sentRole
                ? { content: chunk.content }
                : { role: 'assistant', content: chunk.content },
              finish_reason: null
            }]
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
      choices: [{
        index: 0,
        delta: {},
        finish_reason: 'stop'
      }]
    };

    res.write(`data: ${JSON.stringify(finalPayload)}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (error) {
    if (!controller.signal.aborted) {
      const payload = {
        error: {
          message: error.message,
          type: 'upstream_error'
        }
      };
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
    }
  }
});
