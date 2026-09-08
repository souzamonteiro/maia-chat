import assert from 'node:assert/strict';
import test from 'node:test';

import {
  attachmentError,
  messagePromptContent,
  parseDocument,
  retrievalPromptContent,
  retrieveDocumentChunks,
  MAX_DOCUMENT_CHUNK_CHARS,
  MAX_ATTACHMENT_BYTES,
  MAX_DOCUMENT_BYTES
} from '../public/js/attachments.js';

test('attachmentError enforces supported formats and explicit size limits', () => {
  assert.equal(attachmentError({ name: 'notes.txt', size: 12 }, []), '');
  assert.equal(attachmentError({ name: 'program.cpp', size: 12 }, []), '');
  assert.equal(attachmentError({ name: 'assistant.maiascript', size: 12 }, []), '');
  assert.equal(attachmentError({ name: 'Dockerfile', size: 12 }, []), '');
  assert.equal(attachmentError({ name: 'report.pdf', size: 12 }, []), '');
  assert.match(attachmentError({ name: 'report.exe', size: 12 }, []), /Only text/);
  assert.match(
    attachmentError({ name: 'large.txt', size: MAX_ATTACHMENT_BYTES + 1 }, []),
    /512 KiB/
  );
  assert.match(attachmentError({ name: 'large.pdf', size: MAX_DOCUMENT_BYTES + 1 }, []), /10 MiB/);
});

test('messagePromptContent clearly delimits attachment reference material', () => {
  const content = messagePromptContent({
    content: 'Summarize this.',
    attachments: [{ name: 'notes.md', content: '# Notes' }]
  });

  assert.match(content, /Summarize this/);
  assert.match(content, /\[Attached file: notes\.md \| chunk 1\/1\]/);
  assert.match(content, /Treat this as user-provided reference material/);
  assert.match(content, /\[End attached file: notes\.md \| chunk 1\/1\]/);
});

test('parseDocument normalizes JSON and segments Markdown at semantic boundaries', () => {
  const parsed = parseDocument('notes.json', '{"title":"Plan","items":["first","second"]}\r\n');
  assert.equal(
    parsed.content,
    '{\n  "title": "Plan",\n  "items": [\n    "first",\n    "second"\n  ]\n}'
  );
  assert.deepEqual(parsed.chunks, [parsed.content]);

  const markdown = parseDocument('notes.md', '# First\n\nOne.\n\n# Second\n\nTwo.');
  assert.deepEqual(markdown.chunks, ['# First\n\nOne.\n\n# Second\n\nTwo.']);
});

test('parseDocument splits an oversized section and prompt content preserves chunks', () => {
  const content = 'a'.repeat(MAX_DOCUMENT_CHUNK_CHARS + 10);
  const parsed = parseDocument('large.txt', content);

  assert.equal(parsed.chunks.length, 2);
  assert.equal(parsed.chunks.join(''), content);

  const prompt = messagePromptContent({
    content: 'Summarize this.',
    attachments: [{ name: 'large.txt', ...parsed }]
  });
  assert.match(prompt, /chunk 1\/2/);
  assert.match(prompt, /chunk 2\/2/);
});

test('retrieveDocumentChunks ranks matching chunks and keeps a directly attached document', () => {
  const messages = [
    {
      role: 'user',
      content: 'Earlier question',
      attachments: [{ name: 'roadmap.md', content: '# Roadmap\n\nThe release target is Tuesday.' }]
    },
    {
      role: 'user',
      content: 'What is the release target?',
      attachments: [{ name: 'brief.txt', content: 'The project owner is Maia.' }]
    }
  ];

  const sources = retrieveDocumentChunks(messages[1].content, messages);
  assert.deepEqual(
    sources.map((source) => source.name),
    ['roadmap.md', 'brief.txt']
  );
  assert.match(
    retrievalPromptContent(messages[1], messages),
    /\[Retrieved source: roadmap\.md, chunk 1\/1\]/
  );
});
