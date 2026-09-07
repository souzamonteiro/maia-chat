const EXPORT_VERSION = 1;

function normalized(value = '') {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase();
}

function cleanMessage(message) {
  const savedMessage = { ...message };
  delete savedMessage.error;
  delete savedMessage.status;
  return savedMessage;
}

export function renameConversation(conversation, title) {
  const cleanTitle = title.trim().replace(/\s+/g, ' ').slice(0, 80);
  if (!cleanTitle) return false;
  conversation.title = cleanTitle;
  conversation.updatedAt = Date.now();
  return true;
}

export function generateConversationTitle(text) {
  const firstLine = text.trim().split(/\r?\n/)[0].replace(/\s+/g, ' ');
  const title = firstLine.replace(/^[#>*\-\d.\s]+/, '').trim();
  if (!title) return 'New chat';
  return title.length > 56 ? `${title.slice(0, 55).trimEnd()}...` : title;
}

export function searchConversations(conversations, query) {
  const needle = normalized(query.trim());
  if (!needle) return conversations;

  return conversations.filter((conversation) => {
    const haystack = [
      conversation.title,
      ...conversation.messages.flatMap((message) => [
        message.content,
        ...(message.attachments || []).flatMap((attachment) => [
          attachment.name,
          attachment.content
        ])
      ])
    ].join('\n');
    return normalized(haystack).includes(needle);
  });
}

export function branchConversation(conversation, model, { id, now = Date.now() }) {
  return {
    ...structuredClone(conversation),
    id,
    title: `${conversation.title} (${model})`,
    model,
    parentId: conversation.id,
    createdAt: now,
    updatedAt: now,
    branchedAt: now
  };
}

export function clearConversation(conversation) {
  const snapshot = {
    messages: conversation.messages,
    title: conversation.title
  };
  conversation.messages = [];
  conversation.title = 'New chat';
  conversation.updatedAt = Date.now();
  return snapshot;
}

export function restoreClearedConversation(conversation, snapshot) {
  conversation.messages = [...snapshot.messages, ...conversation.messages];
  if (conversation.title === 'New chat') conversation.title = snapshot.title;
  conversation.updatedAt = Date.now();
}

export function exportConversationMarkdown(conversation) {
  const sections = [`# ${conversation.title}`, ''];
  for (const message of conversation.messages) {
    const heading = message.role === 'assistant' ? 'Maia' : 'You';
    sections.push(`## ${heading}`, '', message.content || '', '');
    for (const attachment of message.attachments || []) {
      sections.push(`### Attachment: ${attachment.name}`, '', attachment.content, '');
    }
  }
  return sections.join('\n').trimEnd() + '\n';
}

export function exportHistory(conversations) {
  return JSON.stringify(
    {
      version: EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      conversations: conversations.map((conversation) => ({
        ...conversation,
        messages: conversation.messages.map(cleanMessage)
      }))
    },
    null,
    2
  );
}

export function importHistory(source) {
  const data = JSON.parse(source);
  if (data?.version !== EXPORT_VERSION || !Array.isArray(data.conversations)) {
    throw new Error('This file is not a Maia Chat history export.');
  }
  return data.conversations.filter(
    (conversation) =>
      typeof conversation?.id === 'string' &&
      typeof conversation?.title === 'string' &&
      Array.isArray(conversation?.messages)
  );
}
