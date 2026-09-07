import { InvalidGenerationSettingsError } from './errors.js';

function numberSetting(value, name, { min, max, integer = false }) {
  if (value === undefined) return;
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < min ||
    value > max ||
    (integer && !Number.isInteger(value))
  ) {
    throw new InvalidGenerationSettingsError(name, min, max, integer);
  }
}

export function validateGenerationSettings(body) {
  numberSetting(body.temperature, 'temperature', { min: 0, max: 2 });
  numberSetting(body.top_p, 'top_p', { min: 0.01, max: 1 });
  numberSetting(body.max_tokens, 'max_tokens', { min: 1, max: 8192, integer: true });
}
