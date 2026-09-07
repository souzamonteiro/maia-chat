import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';

import { createButton, createRecoveryNotice } from '../public/js/ui.js';

function withDocument(run) {
  const { window } = new JSDOM('');
  const previousDocument = globalThis.document;
  globalThis.document = window.document;
  try {
    return run(window);
  } finally {
    globalThis.document = previousDocument;
    window.close();
  }
}

test('createButton creates a native accessible button and attaches its action', () => {
  withDocument((window) => {
    let clicked = false;
    const button = createButton({
      className: 'message-action',
      label: 'Retry',
      ariaLabel: 'Retry response',
      onClick: () => {
        clicked = true;
      }
    });

    button.click();

    assert.equal(button.tagName, 'BUTTON');
    assert.equal(button.type, 'button');
    assert.equal(button.className, 'message-action');
    assert.equal(button.textContent, 'Retry');
    assert.equal(button.getAttribute('aria-label'), 'Retry response');
    assert.equal(clicked, true);
    assert.equal(button.ownerDocument, window.document);
  });
});

test('createRecoveryNotice composes a semantic recovery state with supplied actions', () => {
  withDocument(() => {
    const retry = createButton({ className: 'message-action', label: 'Retry' });
    const notice = createRecoveryNotice({
      state: 'failed',
      title: 'Response interrupted',
      detail: 'Try again.',
      actions: [retry]
    });

    assert.equal(notice.className, 'message-recovery failed');
    assert.equal(notice.querySelector('strong').textContent, 'Response interrupted');
    assert.equal(notice.querySelector('.message-error span').textContent, 'Try again.');
    assert.equal(notice.querySelector('.message-actions button'), retry);
  });
});
