import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';

import { createButton, createRecoveryNotice, createRagSources } from '../public/js/ui.js';

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

test('RAG sources render as plain text, with locations and no injected markup', () => {
  withDocument(() => {
    const translate = (key, params) =>
      key === 'ragSources'
        ? 'Fontes fornecidas ao modelo'
        : key === 'ragLines'
          ? `linhas ${params.start}–${params.end}`
          : `trecho ${params.number}`;
    const section = createRagSources(
      [
        { filename: '<img src=x onerror=alert(1)>', startLine: 3, endLine: 9 },
        { filename: 'manual.md', chunk: 2 },
        null
      ],
      translate
    );
    assert.match(section.textContent, /linhas 3–9/);
    assert.match(section.textContent, /manual.md — trecho 2/);
    assert.equal(section.querySelector('img'), null);
    assert.equal(section.querySelectorAll('li').length, 2);
    assert.equal(createRagSources([], translate), null);
    assert.equal(createRagSources(undefined, translate), null);
  });
});
