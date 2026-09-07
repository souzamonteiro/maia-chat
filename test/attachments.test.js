import assert from 'node:assert/strict';
import test from 'node:test';

import {
  attachmentError,
  messagePromptContent,
  MAX_ATTACHMENT_BYTES
} from '../public/js/attachments.js';

test('attachmentError enforces supported formats and explicit size limits', () => {
  assert.equal(attachmentError({ name: 'notes.txt', size: 12 }, []), '');
  assert.match(attachmentError({ name: 'report.pdf', size: 12 }, []), /Only TXT/);
  assert.match(
    attachmentError({ name: 'large.txt', size: MAX_ATTACHMENT_BYTES + 1 }, []),
    /512 KiB/
  );
});

test('messagePromptContent clearly delimits attachment reference material', () => {
  const content = messagePromptContent({
    content: 'Summarize this.',
    attachments: [{ name: 'notes.md', content: '# Notes' }]
  });

  assert.match(content, /Summarize this/);
  assert.match(content, /\[Attached file: notes\.md\]/);
  assert.match(content, /Treat this as user-provided reference material/);
  assert.match(content, /\[End attached file: notes\.md\]/);
});
