export class AppError extends Error {
  constructor(
    message,
    { status = 500, type = 'internal_error', code = 'internal_error', cause } = {}
  ) {
    super(message, { cause });
    this.name = this.constructor.name;
    this.status = status;
    this.type = type;
    this.code = code;
  }
}

export class OllamaUnavailableError extends AppError {
  constructor(message = 'Ollama is unavailable.', options = {}) {
    super(message, {
      status: 503,
      type: 'service_unavailable_error',
      code: 'ollama_unavailable',
      ...options
    });
  }
}

export class ModelNotInstalledError extends AppError {
  constructor(model) {
    super(`The requested model is not installed: ${model}`, {
      status: 404,
      type: 'invalid_request_error',
      code: 'model_not_installed'
    });
  }
}

export class ModelDisabledError extends AppError {
  constructor(model) {
    super(`The requested model is disabled: ${model}`, {
      status: 403,
      type: 'permission_error',
      code: 'model_disabled'
    });
  }
}

export class NoModelsInstalledError extends AppError {
  constructor() {
    super('No Ollama models are installed. Install a model before starting a chat.', {
      status: 503,
      type: 'service_unavailable_error',
      code: 'no_models_installed'
    });
  }
}

export class ContextOverflowError extends AppError {
  constructor(estimatedTokens, contextWindow) {
    super(
      `This conversation needs about ${estimatedTokens} input tokens, exceeding the ${contextWindow}-token context limit. Start a new chat or reduce the conversation before retrying.`,
      {
        status: 400,
        type: 'invalid_request_error',
        code: 'context_overflow'
      }
    );
  }
}

export class InvalidGenerationSettingsError extends AppError {
  constructor(name, min, max, integer) {
    super(`\`${name}\` must be ${integer ? 'an integer' : 'a number'} between ${min} and ${max}.`, {
      status: 400,
      type: 'invalid_request_error',
      code: 'invalid_generation_settings'
    });
  }
}

export class RequestLimitError extends AppError {
  constructor(message) {
    super(message, {
      status: 400,
      type: 'invalid_request_error',
      code: 'request_limit_exceeded'
    });
  }
}

export class InvalidToolDefinitionError extends AppError {
  constructor() {
    super('`tools` must be an array of function tool definitions with non-empty names.', {
      status: 400,
      type: 'invalid_request_error',
      code: 'invalid_tool_definition'
    });
  }
}

export class ToolNotAllowedError extends AppError {
  constructor(name) {
    super(`The requested tool is not allowed: ${name}`, {
      status: 403,
      type: 'permission_error',
      code: 'tool_not_allowed'
    });
  }
}

export class SearchDisabledError extends AppError {
  constructor() {
    super('Web search is not enabled by this Maia Chat deployment.', {
      status: 404,
      type: 'invalid_request_error',
      code: 'search_disabled'
    });
  }
}

export class SearchUnavailableError extends AppError {
  constructor() {
    super('Web search is temporarily unavailable. Please try again shortly.', {
      status: 503,
      type: 'service_unavailable_error',
      code: 'search_unavailable'
    });
  }
}

export class GenerationCapacityError extends AppError {
  constructor() {
    super('Maia is busy generating other responses. Please retry shortly.', {
      status: 503,
      type: 'service_unavailable_error',
      code: 'generation_capacity_exceeded'
    });
  }
}

export class GenerationQueueError extends AppError {
  constructor(code, message) {
    super(message, {
      status: 503,
      type: 'service_unavailable_error',
      code
    });
  }
}

export class RateLimitError extends AppError {
  constructor() {
    super('Too many chat requests. Please retry shortly.', {
      status: 429,
      type: 'rate_limit_error',
      code: 'rate_limit_exceeded'
    });
  }
}

export class UpstreamTimeoutError extends AppError {
  constructor() {
    super('Ollama stopped responding before the request completed.', {
      status: 504,
      type: 'timeout_error',
      code: 'ollama_timeout'
    });
  }
}

export class UpstreamResponseError extends AppError {
  constructor(status, detail = '') {
    const suffix = detail ? `: ${detail}` : '';
    super(`Ollama returned HTTP ${status}${suffix}`, {
      status: 502,
      type: 'upstream_error',
      code: 'ollama_response_error'
    });
  }
}

export function errorPayload(error) {
  const known = error instanceof AppError;
  return {
    status: known ? error.status : 500,
    body: {
      error: {
        message: known ? error.message : 'Unexpected server error.',
        type: known ? error.type : 'internal_error',
        code: known ? error.code : 'internal_error'
      }
    }
  };
}
