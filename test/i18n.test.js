import assert from 'node:assert/strict';
import test from 'node:test';

import { translate } from '../public/js/i18n.js';

test('translate returns the selected language and falls back to English', () => {
  assert.equal(translate('pt', 'send'), 'Enviar');
  assert.equal(translate('pt', 'retry'), 'Tentar novamente');
  assert.equal(
    translate('es', 'ollamaOnline', { count: 2, models: 'modelos' }),
    'Ollama en línea (2 modelos)'
  );
  assert.equal(translate('es', 'clear'), 'Limpiar');
  assert.equal(translate('unknown', 'model'), 'Model');
});
