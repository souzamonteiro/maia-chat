import { config } from './config.js';
import { InvalidToolDefinitionError, ToolNotAllowedError } from './errors.js';

export function validateTools(tools) {
  if (tools === undefined) return [];
  if (
    !Array.isArray(tools) ||
    tools.some(
      (tool) =>
        tool?.type !== 'function' ||
        typeof tool.function?.name !== 'string' ||
        !tool.function.name.trim()
    )
  ) {
    throw new InvalidToolDefinitionError();
  }

  for (const tool of tools) {
    if (!config.toolAllowlist.includes(tool.function.name)) {
      throw new ToolNotAllowedError(tool.function.name);
    }
  }
  return tools;
}
