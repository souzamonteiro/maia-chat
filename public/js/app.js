import {
  extractDocument,
  getConfig,
  getHealth,
  getModels,
  searchWeb,
  ApiError,
  streamChat
} from './api.js?v=2';
import { conversationStorage } from './storage.js';
import { contextUsage } from './context.js';
import {
  attachmentError,
  messagePromptContent,
  parseDocument,
  requiresServerExtraction,
  retrievalPromptContent
} from './attachments.js?v=2';
import {
  addDocuments,
  createCollection,
  DEFAULT_COLLECTION_ID,
  ensureCollections,
  removeCollection,
  removeDocument
} from './collections.js';
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
} from './conversations.js';
import { renderMarkdown } from './markdown.js?v=2';
import { applyTranslations, translate } from './i18n.js?v=3';
import { createButton, createElement, createRecoveryNotice } from './ui.js?v=1';

const elements = {
  chat: document.querySelector('#chat'),
  appNotice: document.querySelector('#appNotice'),
  appNoticeText: document.querySelector('#appNoticeText'),
  retryConnectionButton: document.querySelector('#retryConnectionButton'),
  welcome: document.querySelector('#welcome'),
  composer: document.querySelector('#composer'),
  prompt: document.querySelector('#prompt'),
  sendButton: document.querySelector('#sendButton'),
  stopButton: document.querySelector('#stopButton'),
  newChatButton: document.querySelector('#newChatButton'),
  clearButton: document.querySelector('#clearButton'),
  conversationSearch: document.querySelector('#conversationSearch'),
  themeSelect: document.querySelector('#themeSelect'),
  languageSelect: document.querySelector('#languageSelect'),
  renameButton: document.querySelector('#renameButton'),
  deleteConversationButton: document.querySelector('#deleteConversationButton'),
  exportMarkdownButton: document.querySelector('#exportMarkdownButton'),
  exportHistoryButton: document.querySelector('#exportHistoryButton'),
  importHistoryInput: document.querySelector('#importHistoryInput'),
  undoNotice: document.querySelector('#undoNotice'),
  undoText: document.querySelector('#undoText'),
  undoDeleteButton: document.querySelector('#undoDeleteButton'),
  conversationList: document.querySelector('#conversationList'),
  modelSelect: document.querySelector('#modelSelect'),
  modelDetails: document.querySelector('#modelDetails'),
  modelBadge: document.querySelector('#modelBadge'),
  contextStatus: document.querySelector('#contextStatus'),
  attachmentInput: document.querySelector('#attachmentInput'),
  attachmentList: document.querySelector('#attachmentList'),
  attachmentError: document.querySelector('#attachmentError'),
  webSearch: document.querySelector('#webSearch'),
  webSearchQuery: document.querySelector('#webSearchQuery'),
  webSearchButton: document.querySelector('#webSearchButton'),
  webSearchResults: document.querySelector('#webSearchResults'),
  collectionSelect: document.querySelector('#collectionSelect'),
  newCollectionButton: document.querySelector('#newCollectionButton'),
  deleteCollectionButton: document.querySelector('#deleteCollectionButton'),
  collectionDocumentInput: document.querySelector('#collectionDocumentInput'),
  collectionDocumentList: document.querySelector('#collectionDocumentList'),
  temperatureInput: document.querySelector('#temperatureInput'),
  topPInput: document.querySelector('#topPInput'),
  maxTokensInput: document.querySelector('#maxTokensInput'),
  expandReasoningInput: document.querySelector('#expandReasoningInput'),
  statusDot: document.querySelector('#statusDot'),
  statusText: document.querySelector('#statusText'),
  appVersion: document.querySelector('#appVersion'),
  sidebar: document.querySelector('#sidebar'),
  sidebarBackdrop: document.querySelector('#sidebarBackdrop'),
  menuButton: document.querySelector('#menuButton')
};

let conversations = [];
let activeId = null;
let currentController = null;
let modelMetadata = new Map();
let pendingAttachments = [];
let pendingWebSources = [];
let collections = [];
let selectedCollectionId = DEFAULT_COLLECTION_ID;
let conversationQuery = '';
let undoTimeout = null;
let undoAction = null;
let expandReasoning = false;
let theme = 'system';
let locale = 'en';
let preferredModel = '';
let serviceAvailable = false;
const defaultGenerationSettings = {
  temperature: 0.7,
  top_p: 0.9,
  max_tokens: 2048
};
let appConfig = {
  name: 'Maia',
  version: '',
  defaultModel: ''
};

function createConversation() {
  const model = elements.modelSelect.value || appConfig.defaultModel;
  const conversation = {
    id: crypto.randomUUID(),
    title: 'New chat',
    model,
    generation: modelGenerationDefaults(model),
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  conversations.unshift(conversation);
  activeId = conversation.id;
  persist();
  render();
  return conversation;
}

function activeConversation() {
  return conversations.find((item) => item.id === activeId) || null;
}

function activeCollection() {
  return collections.find((collection) => collection.id === selectedCollectionId) || collections[0];
}

function persist() {
  conversationStorage
    .save({
      conversations,
      activeId,
      collections,
      preferences: { theme, expandReasoning, locale, preferredModel, selectedCollectionId }
    })
    .catch(() => {
      setStatus('bad', 'Could not save local history');
    });
}

function showUndo(message, action) {
  undoAction = action;
  elements.undoText.textContent = message;
  elements.undoNotice.classList.remove('hidden');
  clearTimeout(undoTimeout);
  undoTimeout = setTimeout(() => {
    undoAction = null;
    elements.undoNotice.classList.add('hidden');
  }, 5000);
}

function applyTheme() {
  document.documentElement.dataset.theme = theme;
  elements.themeSelect.value = theme;
}

function applyLocale() {
  locale = applyTranslations(locale);
  elements.languageSelect.value = locale;
}

function t(key, values) {
  return translate(locale, key, values);
}

function generationSettings(conversation = activeConversation()) {
  return { ...defaultGenerationSettings, ...conversation?.generation };
}

function modelGenerationDefaults(model) {
  return {
    ...defaultGenerationSettings,
    ...modelMetadata.get(model)?.generation_defaults
  };
}

function renderGenerationSettings() {
  const settings = generationSettings();
  elements.temperatureInput.value = settings.temperature;
  elements.topPInput.value = settings.top_p;
  elements.maxTokensInput.value = settings.max_tokens;
  elements.expandReasoningInput.checked = expandReasoning;
}

function renderMessageContent(content, source) {
  content.innerHTML = renderMarkdown(source, { expandReasoning });
  for (const code of content.querySelectorAll('pre > code')) {
    const pre = code.parentElement;
    const copy = createButton({
      className: 'code-copy',
      label: t('copyCode'),
      onClick: async () => {
        try {
          await navigator.clipboard.writeText(code.textContent);
          copy.textContent = t('copied');
        } catch {
          elements.attachmentError.textContent = t('copyCodeFailed');
        }
      }
    });
    pre.prepend(copy);
  }
}

function renderModelDetails() {
  const model = modelMetadata.get(elements.modelSelect.value);
  if (!model) {
    elements.modelDetails.textContent = '';
    return;
  }
  const size = model.parameter_size ? ` · ${model.parameter_size}` : '';
  const labels = [
    model.status.includes('default') ? 'Default' : '',
    model.loaded ? 'Loaded' : ''
  ].filter(Boolean);
  const status = labels.length ? ` · ${labels.join(' · ')}` : '';
  elements.modelDetails.textContent = `${model.provider}${size} · ${model.context_window.toLocaleString()} tokens${status}`;
}

function renderAttachments() {
  elements.attachmentList.replaceChildren();
  for (const [index, attachment] of pendingAttachments.entries()) {
    const item = createElement('span', { className: 'attachment-item', text: attachment.name });
    const remove = createButton({
      className: 'attachment-remove',
      label: 'x',
      ariaLabel: `Remove ${attachment.name}`,
      onClick: () => {
        pendingAttachments.splice(index, 1);
        renderAttachments();
        renderContextUsage();
      }
    });
    item.append(remove);
    elements.attachmentList.append(item);
  }
}

function renderWebSearchResults(results = []) {
  elements.webSearchResults.replaceChildren();
  for (const source of results) {
    const item = createElement('label', { className: 'web-search-result' });
    const select = document.createElement('input');
    select.type = 'checkbox';
    select.checked = pendingWebSources.some((selected) => selected.url === source.url);
    select.addEventListener('change', () => {
      pendingWebSources = select.checked
        ? [...pendingWebSources, source]
        : pendingWebSources.filter((selected) => selected.url !== source.url);
    });
    const text = createElement('span');
    const link = createElement('a', {
      text: source.title,
      attributes: { href: source.url, target: '_blank', rel: 'noopener' }
    });
    const snippet = createElement('small', { text: source.snippet || source.engine || source.url });
    text.append(link, snippet);
    item.append(select, text);
    elements.webSearchResults.append(item);
  }
}

function renderCollections() {
  const collection = activeCollection();
  elements.collectionSelect.replaceChildren(
    ...collections.map((item) => {
      const option = document.createElement('option');
      option.value = item.id;
      option.textContent = item.name;
      return option;
    })
  );
  elements.collectionSelect.value = collection?.id || '';
  elements.deleteCollectionButton.disabled = !collection || collection.id === DEFAULT_COLLECTION_ID;
  elements.collectionDocumentList.replaceChildren();

  for (const document of collection?.documents || []) {
    const item = createElement('div', { className: 'collection-document' });
    const name = createElement('span', { text: document.name });
    const remove = createButton({
      className: 'attachment-remove',
      label: 'x',
      ariaLabel: t('removeDocument', { name: document.name }),
      onClick: () => {
        if (!confirm(t('removeDocumentConfirm', { name: document.name }))) return;
        removeDocument(collection, document.id);
        persist();
        renderCollections();
      }
    });
    item.append(name, remove);
    elements.collectionDocumentList.append(item);
  }
}

function actionButton(label, action) {
  return createButton({
    className: 'message-action',
    label,
    disabled: Boolean(currentController),
    onClick: action
  });
}

function download(filename, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

async function copyMessage(message) {
  try {
    await navigator.clipboard.writeText(message.content);
  } catch {
    elements.attachmentError.textContent = t('copyMessageFailed');
  }
}

function messageElement(message, conversation, index) {
  const article = document.createElement('article');
  article.className = `message ${message.role}`;
  article.dataset.messageIndex = index;
  article.setAttribute('aria-busy', String(message.status === 'generating'));

  const role = document.createElement('div');
  role.className = 'message-role';
  role.textContent = message.role === 'assistant' ? 'M' : 'Y';

  const content = document.createElement('div');
  content.className = 'message-content';
  if (message.role === 'assistant') {
    content.setAttribute('aria-live', 'polite');
    content.setAttribute('aria-relevant', 'text');
    content.setAttribute('aria-label', 'Maia response');
  }
  renderMessageContent(content, message.content);

  article.append(role, content);

  if (message.metrics) {
    const metrics = document.createElement('div');
    metrics.className = 'message-metrics';
    const { promptTokens, completionTokens, elapsedMs, tokensPerSecond } = message.metrics;
    metrics.textContent = `${promptTokens} prompt · ${completionTokens} completion · ${(elapsedMs / 1000).toFixed(1)}s · ${tokensPerSecond.toFixed(1)} tok/s`;
    content.append(metrics);
  }

  if (message.attachments?.length) {
    const attachments = document.createElement('div');
    attachments.className = 'message-attachments';
    for (const attachment of message.attachments) {
      const item = document.createElement('span');
      item.className = 'attachment-item';
      item.textContent = attachment.name;
      attachments.append(item);
    }
    content.prepend(attachments);
  }

  if (message.webSources?.length) {
    const sources = createElement('div', { className: 'message-attachments web-sources' });
    for (const source of message.webSources) {
      const link = createElement('a', {
        className: 'attachment-item',
        text: source.title,
        attributes: { href: source.url, target: '_blank', rel: 'noopener' }
      });
      sources.append(link);
    }
    content.prepend(sources);
  }

  const isLatest = index === conversation.messages.length - 1;
  const recoverable =
    message.role === 'assistant' &&
    isLatest &&
    (message.status === 'failed' || message.status === 'stopped');

  if (recoverable) {
    const actions = [actionButton(t('retry'), () => retryMessage(conversation.id, index))];
    if (message.content.trim()) {
      actions.push(actionButton(t('continue'), () => continueMessage(conversation.id, index)));
    }
    content.append(
      createRecoveryNotice({
        state: message.status,
        title: t(message.status === 'stopped' ? 'generationStopped' : 'responseInterrupted'),
        detail: message.error?.message || t('responseIncomplete'),
        actions
      })
    );
  }

  const actions = document.createElement('div');
  actions.className = 'message-actions message-actions-inline';
  actions.append(actionButton(t('copy'), () => copyMessage(message)));
  if (message.role === 'user') {
    actions.append(actionButton(t('editAndResend'), () => editMessage(conversation.id, index)));
  } else if (!recoverable) {
    actions.append(actionButton(t('regenerate'), () => regenerateMessage(conversation.id, index)));
  }
  actions.append(actionButton(t('delete'), () => deleteMessage(conversation.id, index)));
  content.append(actions);

  return { article, content };
}

function renderConversationList() {
  elements.conversationList.replaceChildren();

  const matches = searchConversations(conversations, conversationQuery);
  for (const conversation of matches) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `conversation-item${conversation.id === activeId ? ' active' : ''}`;
    button.textContent = conversation.title;
    button.title = conversation.title;
    button.addEventListener('click', () => {
      activeId = conversation.id;
      persist();
      render();
      closeSidebar();
    });
    elements.conversationList.append(button);
  }

  if (matches.length === 0 && conversationQuery) {
    const empty = document.createElement('p');
    empty.className = 'conversation-search-empty';
    empty.textContent = t('noMatches');
    elements.conversationList.append(empty);
  }
}

function renderMessages() {
  const conversation = activeConversation();

  elements.chat.replaceChildren();

  if (!conversation || conversation.messages.length === 0) {
    elements.chat.append(elements.welcome);
    return;
  }

  for (const [index, message] of conversation.messages.entries()) {
    const { article } = messageElement(message, conversation, index);
    elements.chat.append(article);
  }

  requestAnimationFrame(() => {
    elements.chat.scrollTop = elements.chat.scrollHeight;
  });
}

function render() {
  renderConversationList();
  renderMessages();
  renderCollections();

  const conversation = activeConversation();
  const options = [...elements.modelSelect.options].map((o) => o.value);

  if (conversation?.model && options.includes(conversation.model)) {
    elements.modelSelect.value = conversation.model;
  } else if (preferredModel && options.includes(preferredModel)) {
    elements.modelSelect.value = preferredModel;
  } else if (options.length > 0) {
    elements.modelSelect.value = options[0];
    if (conversation) {
      conversation.model = options[0];
      persist();
    }
  }

  elements.modelBadge.textContent =
    elements.modelSelect.value || appConfig.defaultModel || 'Local AI';
  renderModelDetails();
  renderContextUsage();
  renderGenerationSettings();
}

function renderContextUsage() {
  const conversation = activeConversation();
  const messages = [...(conversation?.messages || [])];
  const draft = elements.prompt.value.trim();
  if (draft || pendingAttachments.length) {
    messages.push({ role: 'user', content: draft, attachments: pendingAttachments });
  }

  const model = elements.modelSelect.value || appConfig.defaultModel;
  const usage = contextUsage(messages, modelMetadata.get(model)?.context_window);
  elements.contextStatus.textContent = `${usage.usedTokens.toLocaleString()} / ${usage.limit.toLocaleString()} tokens`;
  elements.contextStatus.classList.toggle('warning', usage.percentage >= 80);
  elements.contextStatus.classList.toggle('critical', usage.percentage >= 100);
}

function autoResize() {
  elements.prompt.style.height = 'auto';
  elements.prompt.style.height = `${Math.min(elements.prompt.scrollHeight, 220)}px`;
}

function setStatus(state, text) {
  serviceAvailable = state !== 'loading' && state !== 'bad';
  elements.statusDot.className = `status-dot ${state}`;
  elements.statusText.textContent = text;
  const visible = state === 'loading' || state === 'bad';
  elements.appNotice.classList.toggle('hidden', !visible);
  elements.retryConnectionButton.classList.toggle('hidden', state !== 'bad');
  elements.appNoticeText.textContent = text;
}

function setGenerating(generating) {
  elements.sendButton.disabled = generating || !serviceAvailable || !elements.modelSelect.value;
  elements.stopButton.classList.toggle('hidden', !generating);
}

function closeSidebar({ restoreFocus = false } = {}) {
  elements.sidebar.classList.remove('open');
  elements.sidebarBackdrop.classList.remove('visible');
  elements.menuButton.setAttribute('aria-expanded', 'false');
  if (restoreFocus) elements.menuButton.focus();
}

function toggleSidebar() {
  const open = elements.sidebar.classList.toggle('open');
  elements.sidebarBackdrop.classList.toggle('visible', open);
  elements.menuButton.setAttribute('aria-expanded', String(open));
}

async function generateResponse(conversation, assistantMessage, requestMessages) {
  if (currentController) return;

  assistantMessage.status = 'generating';
  delete assistantMessage.error;
  delete assistantMessage.finishReason;
  conversation.updatedAt = Date.now();
  persist();
  render();

  const messageIndex = conversation.messages.indexOf(assistantMessage);
  const rendered = elements.chat.querySelector(
    `[data-message-index="${messageIndex}"] .message-content`
  );

  currentController = new AbortController();
  const startedAt = performance.now();
  setGenerating(true);
  setStatus('generating', t('generatingResponse'));

  try {
    await streamChat({
      model: conversation.model,
      messages: requestMessages.map((message, index) => ({
        role: message.role,
        content:
          index === requestMessages.length - 1 && message.role === 'user'
            ? retrievalPromptContent(message, [
                ...requestMessages,
                { role: 'user', content: '', attachments: activeCollection()?.documents || [] }
              ])
            : messagePromptContent({ ...message, attachments: [] })
      })),
      settings: generationSettings(conversation),
      signal: currentController.signal,
      onToken(token) {
        assistantMessage.content += token;
        if (rendered) renderMessageContent(rendered, assistantMessage.content);
        elements.chat.scrollTop = elements.chat.scrollHeight;
      },
      onComplete({ usage, elapsedMs, finishReason }) {
        assistantMessage.finishReason = finishReason;
        const duration = elapsedMs ?? Math.round(performance.now() - startedAt);
        const completionTokens = usage?.completion_tokens ?? 0;
        assistantMessage.metrics = {
          promptTokens: usage?.prompt_tokens ?? 0,
          completionTokens,
          elapsedMs: duration,
          tokensPerSecond: duration > 0 ? completionTokens / (duration / 1000) : 0
        };
      }
    });
    if (assistantMessage.finishReason === 'length') {
      throw new ApiError(t('responseTokenLimit'), { code: 'output_token_limit' });
    }
    assistantMessage.status = 'completed';
  } catch (error) {
    const stopped = error.name === 'AbortError';
    assistantMessage.status = stopped ? 'stopped' : 'failed';
    assistantMessage.error = {
      message: stopped ? t('stoppedByUser') : error.message,
      code: stopped ? 'generation_stopped' : error.code || 'request_error'
    };
  } finally {
    currentController = null;
    conversation.updatedAt = Date.now();
    persist();
    setGenerating(false);
    if (assistantMessage.status === 'completed') {
      setStatus('ok', t('ollamaOnline', { count: 0, models: t('modelPlural') }));
    } else if (assistantMessage.status === 'stopped') {
      setStatus('stopped', t('generationStopped'));
    } else {
      setStatus('bad', t('generationFailed'));
    }
    render();
  }
}

async function sendMessage(text, attachments = pendingAttachments, webSources = pendingWebSources) {
  const clean = text.trim();
  if ((!clean && attachments.length === 0) || currentController) return;

  let conversation = activeConversation();
  if (!conversation) conversation = createConversation();

  conversation.model = elements.modelSelect.value || appConfig.defaultModel;
  conversation.messages.push({ role: 'user', content: clean, attachments, webSources });
  pendingAttachments = [];
  pendingWebSources = [];
  elements.webSearchQuery.value = '';
  renderWebSearchResults();
  elements.attachmentError.textContent = '';
  renderAttachments();

  if (conversation.messages.length === 1) conversation.title = generateConversationTitle(clean);

  const assistantMessage = { role: 'assistant', content: '', status: 'generating' };
  conversation.messages.push(assistantMessage);
  await generateResponse(conversation, assistantMessage, conversation.messages.slice(0, -1));
}

async function retryMessage(conversationId, messageIndex) {
  if (currentController) return;
  const conversation = conversations.find((item) => item.id === conversationId);
  const assistantMessage = conversation?.messages[messageIndex];
  if (!conversation || assistantMessage?.role !== 'assistant') return;

  assistantMessage.content = '';
  await generateResponse(
    conversation,
    assistantMessage,
    conversation.messages.slice(0, messageIndex)
  );
}

async function continueMessage(conversationId, messageIndex) {
  if (currentController) return;
  const conversation = conversations.find((item) => item.id === conversationId);
  const assistantMessage = conversation?.messages[messageIndex];
  if (!conversation || assistantMessage?.role !== 'assistant' || !assistantMessage.content.trim())
    return;

  const requestMessages = conversation.messages.slice(0, messageIndex + 1);
  requestMessages.push({
    role: 'user',
    content:
      'Continue exactly where the previous response stopped. Do not repeat completed content.'
  });
  await generateResponse(conversation, assistantMessage, requestMessages);
}

function deleteMessage(conversationId, messageIndex) {
  if (currentController) return;
  const conversation = conversations.find((item) => item.id === conversationId);
  if (!conversation || !confirm(t('deleteMessageConfirm'))) return;
  conversation.messages.splice(messageIndex, 1);
  conversation.updatedAt = Date.now();
  persist();
  render();
}

function editMessage(conversationId, messageIndex) {
  if (currentController) return;
  const conversation = conversations.find((item) => item.id === conversationId);
  const message = conversation?.messages[messageIndex];
  if (!message || message.role !== 'user') return;
  elements.prompt.value = message.content;
  pendingAttachments = message.attachments || [];
  conversation.messages.splice(messageIndex);
  conversation.updatedAt = Date.now();
  persist();
  renderAttachments();
  autoResize();
  render();
  elements.prompt.focus();
}

async function regenerateMessage(conversationId, messageIndex) {
  if (currentController) return;
  const conversation = conversations.find((item) => item.id === conversationId);
  const message = conversation?.messages[messageIndex];
  if (!message || message.role !== 'assistant') return;
  conversation.messages.splice(messageIndex + 1);
  message.content = '';
  await generateResponse(conversation, message, conversation.messages.slice(0, messageIndex));
}

async function initialize() {
  setStatus('loading', t('connecting'));
  try {
    const stored = await conversationStorage.load();
    conversations = stored.conversations;
    activeId = stored.activeId;
    collections = ensureCollections(stored.collections);
    theme = stored.preferences?.theme || 'system';
    expandReasoning = stored.preferences?.expandReasoning === true;
    locale = stored.preferences?.locale || navigator.language.slice(0, 2);
    preferredModel = stored.preferences?.preferredModel || '';
    selectedCollectionId = stored.preferences?.selectedCollectionId || DEFAULT_COLLECTION_ID;
  } catch {
    collections = ensureCollections();
    setStatus('bad', t('serverUnavailable'));
  }
  applyTheme();
  applyLocale();

  try {
    appConfig = await getConfig();
    document.title = appConfig.name;
    elements.appVersion.textContent = appConfig.version ? `Version ${appConfig.version}` : '';
    elements.webSearch.classList.toggle('hidden', !appConfig.webSearchEnabled);
  } catch {
    // Keep the built-in application name when configuration is unavailable.
  }

  let installedModels = [];

  try {
    setStatus('loading', t('loadingModels'));
    installedModels = await getModels();
    modelMetadata = new Map(installedModels.map((model) => [model.id, model]));

    elements.modelSelect.replaceChildren();

    if (installedModels.length === 0) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = t('noModels');
      option.disabled = true;
      option.selected = true;
      elements.modelSelect.append(option);
    } else {
      for (const model of installedModels) {
        const option = document.createElement('option');
        option.value = model.id;
        option.textContent = model.display_name || model.id;
        elements.modelSelect.append(option);
      }
    }

    const available = installedModels.map((m) => m.id);
    if (preferredModel && available.includes(preferredModel)) {
      elements.modelSelect.value = preferredModel;
    } else if (appConfig.defaultModel && available.includes(appConfig.defaultModel)) {
      elements.modelSelect.value = appConfig.defaultModel;
    } else if (available.length > 0) {
      elements.modelSelect.value = available[0];
    }
  } catch {
    if (appConfig.defaultModel) {
      const option = document.createElement('option');
      option.value = appConfig.defaultModel;
      option.textContent = appConfig.defaultModel;
      elements.modelSelect.replaceChildren(option);
    }
  }

  try {
    const status = await getHealth();
    if (status.ok && status.data?.ollama) {
      const count = status.data.modelsCount ?? installedModels.length;
      setStatus(
        'ok',
        t('ollamaOnline', { count, models: t(count === 1 ? 'modelSingular' : 'modelPlural') })
      );
    } else {
      setStatus('bad', t('ollamaUnavailable'));
    }
  } catch {
    setStatus('bad', t('serverUnavailable'));
  }

  if (!activeConversation() && conversations.length > 0) {
    activeId = conversations[0].id;
    persist();
  }
  if (!activeCollection()) selectedCollectionId = collections[0].id;

  render();
  setGenerating(false);
}

elements.composer.addEventListener('submit', (event) => {
  event.preventDefault();
  const text = elements.prompt.value;
  elements.prompt.value = '';
  autoResize();
  sendMessage(text, pendingAttachments);
});

elements.prompt.addEventListener('input', () => {
  autoResize();
  renderContextUsage();
});

elements.conversationSearch.addEventListener('input', () => {
  conversationQuery = elements.conversationSearch.value;
  renderConversationList();
});

elements.themeSelect.addEventListener('change', () => {
  theme = elements.themeSelect.value;
  persist();
  applyTheme();
});

elements.languageSelect.addEventListener('change', () => {
  locale = elements.languageSelect.value;
  persist();
  applyLocale();
  render();
});

elements.attachmentInput.addEventListener('change', async () => {
  for (const file of elements.attachmentInput.files) {
    const error = attachmentError(file, pendingAttachments);
    if (error) {
      elements.attachmentError.textContent = error;
      continue;
    }

    try {
      const parsed = requiresServerExtraction(file.name)
        ? await extractDocument(file)
        : parseDocument(file.name, await file.text());
      pendingAttachments.push({
        name: file.name,
        size: file.size,
        type: file.type || 'text/plain',
        ...parsed
      });
      elements.attachmentError.textContent = '';
    } catch {
      elements.attachmentError.textContent = t('fileReadFailed', { name: file.name });
    }
  }
  elements.attachmentInput.value = '';
  renderAttachments();
  renderContextUsage();
});

elements.webSearchButton.addEventListener('click', async () => {
  const query = elements.webSearchQuery.value.trim();
  if (!query) return;
  elements.webSearchButton.disabled = true;
  try {
    renderWebSearchResults(await searchWeb(query, locale));
  } catch (error) {
    elements.attachmentError.textContent = error.message;
  } finally {
    elements.webSearchButton.disabled = false;
  }
});

elements.collectionSelect.addEventListener('change', () => {
  selectedCollectionId = elements.collectionSelect.value;
  persist();
  renderCollections();
});

elements.newCollectionButton.addEventListener('click', () => {
  const name = prompt(t('collectionName'));
  if (name === null) return;
  const collection = createCollection(collections, name);
  if (!collection) {
    elements.attachmentError.textContent = t('collectionNameInvalid');
    return;
  }
  collections.push(collection);
  selectedCollectionId = collection.id;
  persist();
  renderCollections();
});

elements.deleteCollectionButton.addEventListener('click', () => {
  const collection = activeCollection();
  if (!collection || !confirm(t('deleteCollectionConfirm', { name: collection.name }))) return;
  if (!removeCollection(collections, collection.id)) return;
  selectedCollectionId = DEFAULT_COLLECTION_ID;
  persist();
  renderCollections();
});

elements.collectionDocumentInput.addEventListener('change', async () => {
  const collection = activeCollection();
  if (!collection) return;
  const documents = [];
  for (const file of elements.collectionDocumentInput.files) {
    const error = attachmentError(file, []);
    if (error) {
      elements.attachmentError.textContent = error;
      continue;
    }
    try {
      const parsed = requiresServerExtraction(file.name)
        ? await extractDocument(file)
        : parseDocument(file.name, await file.text());
      documents.push({
        id: crypto.randomUUID(),
        name: file.name,
        size: file.size,
        type: file.type || 'text/plain',
        ...parsed
      });
    } catch {
      elements.attachmentError.textContent = t('fileReadFailed', { name: file.name });
    }
  }
  if (documents.length > 0) {
    addDocuments(collection, documents);
    elements.attachmentError.textContent = '';
    persist();
    renderCollections();
  }
  elements.collectionDocumentInput.value = '';
});

elements.prompt.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    elements.composer.requestSubmit();
  }
});

elements.stopButton.addEventListener('click', () => currentController?.abort());
elements.retryConnectionButton.addEventListener('click', () => location.reload());

elements.newChatButton.addEventListener('click', () => {
  createConversation();
  elements.prompt.focus();
  closeSidebar();
});

elements.clearButton.addEventListener('click', () => {
  const conversation = activeConversation();
  if (!conversation || !conversation.messages.length || !confirm(t('clearConfirm'))) return;

  const snapshot = clearConversation(conversation);
  persist();
  render();
  showUndo(t('messagesCleared'), () => restoreClearedConversation(conversation, snapshot));
});

elements.renameButton.addEventListener('click', () => {
  const conversation = activeConversation();
  if (!conversation) return;
  const title = prompt(t('conversationName'), conversation.title);
  if (title === null || !renameConversation(conversation, title)) return;
  persist();
  render();
});

elements.deleteConversationButton.addEventListener('click', () => {
  const conversation = activeConversation();
  if (!conversation || !confirm(t('deleteConversationConfirm', { title: conversation.title })))
    return;
  const index = conversations.indexOf(conversation);
  conversations.splice(index, 1);
  activeId = conversations[0]?.id || null;
  persist();
  render();
  showUndo(t('conversationDeleted'), () => {
    conversations.splice(index, 0, conversation);
    activeId = conversation.id;
  });
});

elements.undoDeleteButton.addEventListener('click', () => {
  if (!undoAction) return;
  undoAction();
  undoAction = null;
  clearTimeout(undoTimeout);
  elements.undoNotice.classList.add('hidden');
  persist();
  render();
});

elements.exportMarkdownButton.addEventListener('click', () => {
  const conversation = activeConversation();
  if (!conversation) return;
  download(
    `${conversation.title || 'maia-chat'}.md`,
    exportConversationMarkdown(conversation),
    'text/markdown'
  );
});

elements.exportHistoryButton.addEventListener('click', () => {
  download('maia-chat-history.json', exportHistory(conversations), 'application/json');
});

elements.importHistoryInput.addEventListener('change', async () => {
  const [file] = elements.importHistoryInput.files;
  if (!file) return;
  try {
    const imported = importHistory(await file.text());
    const existing = new Set(conversations.map((conversation) => conversation.id));
    conversations.unshift(...imported.filter((conversation) => !existing.has(conversation.id)));
    activeId = conversations[0]?.id || null;
    persist();
    render();
  } catch (error) {
    elements.attachmentError.textContent = error.message;
  } finally {
    elements.importHistoryInput.value = '';
  }
});

elements.modelSelect.addEventListener('change', () => {
  const conversation = activeConversation();
  const selectedModel = elements.modelSelect.value;
  preferredModel = selectedModel;
  if (conversation?.messages.length && conversation.model !== selectedModel) {
    if (!confirm(t('modelBranchConfirm'))) {
      elements.modelSelect.value = conversation.model;
      return;
    }
    const branch = branchConversation(conversation, selectedModel, {
      id: crypto.randomUUID()
    });
    branch.generation = modelGenerationDefaults(selectedModel);
    conversations.unshift(branch);
    activeId = branch.id;
  } else if (conversation) {
    conversation.model = elements.modelSelect.value;
    conversation.generation = modelGenerationDefaults(selectedModel);
  }
  persist();
  render();
});

for (const [input, setting] of [
  [elements.temperatureInput, 'temperature'],
  [elements.topPInput, 'top_p'],
  [elements.maxTokensInput, 'max_tokens']
]) {
  input.addEventListener('change', () => {
    const conversation = activeConversation();
    if (!conversation || !input.validity.valid) return;
    conversation.generation = {
      ...generationSettings(conversation),
      [setting]: Number(input.value)
    };
    persist();
  });
}

elements.expandReasoningInput.addEventListener('change', () => {
  expandReasoning = elements.expandReasoningInput.checked;
  persist();
  renderMessages();
});

elements.menuButton.addEventListener('click', toggleSidebar);
elements.sidebarBackdrop.addEventListener('click', () => closeSidebar({ restoreFocus: true }));
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && elements.sidebar.classList.contains('open')) {
    closeSidebar({ restoreFocus: true });
  }
});

initialize();
