import assert from 'node:assert/strict';
import test from 'node:test';

import {
  branchConversation,
  clearConversation,
  exportConversationMarkdown,
  exportHistory,
  generateConversationTitle,
  importHistory,
  renameConversation,
  restoreClearedConversation,
  searchConversations
} from '../public/js/conversations.js';

function conversation() {
  return {
    id: 'chat-1',
    title: 'New chat',
    messages: [
      { role: 'user', content: 'Hello', status: 'completed' },
      { role: 'assistant', content: 'Hi', error: { code: 'ignored' } }
    ]
  };
}

test('renameConversation normalizes a valid title', () => {
  const item = conversation();
  assert.equal(renameConversation(item, '  A  useful \n title  '), true);
  assert.equal(item.title, 'A useful title');
  assert.equal(renameConversation(item, '   '), false);
});

test('generateConversationTitle creates a concise title from the first prompt line', () => {
  assert.equal(generateConversationTitle('  # Explain\nwith examples'), 'Explain');
  assert.equal(generateConversationTitle('a'.repeat(60)), `${'a'.repeat(55)}...`);
});

test('searchConversations finds normalized title, message, and attachment content', () => {
  const first = conversation();
  first.title = 'Planejamento mensal';
  first.messages[0].attachments = [{ name: 'notes.txt', content: 'Orcamento' }];
  const second = { ...conversation(), id: 'chat-2', title: 'Other', messages: [] };

  assert.deepEqual(searchConversations([first, second], 'planejamento'), [first]);
  assert.deepEqual(searchConversations([first, second], 'orçamento'), [first]);
  assert.deepEqual(searchConversations([first, second], 'hello'), [first]);
});

test('branchConversation preserves the original history with a new model branch', () => {
  const source = conversation();
  source.model = 'qwen2.5:3b';
  const branch = branchConversation(source, 'qwen2.5-coder:3b', {
    id: 'branch-1',
    now: 100
  });

  assert.equal(branch.parentId, source.id);
  assert.equal(branch.model, 'qwen2.5-coder:3b');
  assert.equal(branch.title, 'New chat (qwen2.5-coder:3b)');
  assert.deepEqual(branch.messages, source.messages);
  assert.notEqual(branch.messages, source.messages);
  assert.equal(source.model, 'qwen2.5:3b');
});

test('clearConversation can restore messages without discarding newly added ones', () => {
  const item = conversation();
  const snapshot = clearConversation(item);
  item.messages.push({ role: 'user', content: 'Newer message' });

  restoreClearedConversation(item, snapshot);

  assert.equal(item.title, 'New chat');
  assert.deepEqual(
    item.messages.map((message) => message.content),
    ['Hello', 'Hi', 'Newer message']
  );
});

test('exportConversationMarkdown exports readable source text and attachments', () => {
  const item = conversation();
  item.messages[0].attachments = [{ name: 'notes.txt', content: 'Reference' }];

  const markdown = exportConversationMarkdown(item);

  assert.match(markdown, /^# New chat/m);
  assert.match(markdown, /## You\n\nHello/);
  assert.match(markdown, /### Attachment: notes\.txt\n\nReference/);
});

test('exportHistory produces a versioned portable document without transient state', () => {
  const exported = JSON.parse(exportHistory([conversation()]));

  assert.equal(exported.version, 1);
  assert.equal(exported.conversations[0].messages[0].status, undefined);
  assert.equal(exported.conversations[0].messages[1].error, undefined);
});

test('importHistory accepts versioned conversation exports and rejects other JSON', () => {
  const imported = importHistory(exportHistory([conversation()]));
  assert.equal(imported[0].id, 'chat-1');
  assert.throws(() => importHistory('{"version":2,"conversations":[]}'), /not a Maia Chat/);
});
