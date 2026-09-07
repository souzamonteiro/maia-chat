import assert from 'node:assert/strict';
import test from 'node:test';
import createDOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';

import { createMarkdownRenderer } from '../public/js/markdown.js';

const window = new JSDOM('').window;
const renderMarkdown = createMarkdownRenderer(createDOMPurify(window));

test('renderMarkdown supports common Markdown and reasoning blocks', () => {
  const html = renderMarkdown(
    '# Heading\n\n- first\n- second\n\n> quoted\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\n```js\nconst answer = 42;\n```\n\n<think>Private reasoning</think>'
  );

  assert.match(html, /<h1>Heading<\/h1>/);
  assert.match(html, /<ul>/);
  assert.match(html, /<blockquote>/);
  assert.match(html, /<table>/);
  assert.match(html, /class="hljs language-js"/);
  assert.match(html, /<details class="thinking">/);
});

test('renderMarkdown removes unsafe generated HTML', () => {
  const html = renderMarkdown(
    '<script>alert(1)</script><img src=x onerror=alert(2)>[unsafe](javascript:alert(3))'
  );

  assert.doesNotMatch(html, /<script|onerror=/i);
  assert.doesNotMatch(html, /href="javascript:/i);
  assert.doesNotMatch(html, /<img/i);
});

test('renderMarkdown highlights known code and safely renders an incomplete fence', () => {
  const html = renderMarkdown('```js\nconst value = 1;');

  assert.match(html, /class="hljs language-js"/);
  assert.match(html, /hljs-keyword/);
  assert.match(html, /value =/);
});

test('renderMarkdown keeps reasoning collapsed unless explicitly expanded', () => {
  const source = '<think>Working through it';

  assert.doesNotMatch(renderMarkdown(source), /<details class="thinking" open>/);
  assert.match(
    renderMarkdown(source, { expandReasoning: true }),
    /<details class="thinking" open="">/
  );
});
