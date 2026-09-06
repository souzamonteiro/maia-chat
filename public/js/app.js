import { getConfig, getHealth, getModels, streamChat } from './api.js';
import {
  getActiveId,
  loadConversations,
  saveConversations,
  setActiveId
} from './storage.js';
import { renderMarkdown } from './markdown.js';

const elements = {
  chat: document.querySelector('#chat'),
  welcome: document.querySelector('#welcome'),
  composer: document.querySelector('#composer'),
  prompt: document.querySelector('#prompt'),
  sendButton: document.querySelector('#sendButton'),
  stopButton: document.querySelector('#stopButton'),
  newChatButton: document.querySelector('#newChatButton'),
  clearButton: document.querySelector('#clearButton'),
  conversationList: document.querySelector('#conversationList'),
  modelSelect: document.querySelector('#modelSelect'),
  modelBadge: document.querySelector('#modelBadge'),
  statusDot: document.querySelector('#statusDot'),
  statusText: document.querySelector('#statusText'),
  sidebar: document.querySelector('#sidebar'),
  menuButton: document.querySelector('#menuButton')
};

let conversations = loadConversations();
let activeId = getActiveId();
let currentController = null;
let appConfig = {
  name: 'Maia',
  defaultModel: ''
};

function createConversation() {
  const conversation = {
    id: crypto.randomUUID(),
    title: 'New chat',
    model: elements.modelSelect.value || appConfig.defaultModel,
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
  return conversations.find(item => item.id === activeId) || null;
}

function persist() {
  saveConversations(conversations);
  setActiveId(activeId);
}

function titleFrom(text) {
  return text.trim().replace(/\s+/g, ' ').slice(0, 48) || 'New chat';
}

function messageElement(message) {
  const article = document.createElement('article');
  article.className = `message ${message.role}`;

  const role = document.createElement('div');
  role.className = 'message-role';
  role.textContent = message.role === 'assistant' ? 'M' : 'Y';

  const content = document.createElement('div');
  content.className = 'message-content';
  content.innerHTML = renderMarkdown(message.content);

  article.append(role, content);
  return { article, content };
}

function renderConversationList() {
  elements.conversationList.replaceChildren();

  for (const conversation of conversations) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `conversation-item${conversation.id === activeId ? ' active' : ''}`;
    button.textContent = conversation.title;
    button.title = conversation.title;
    button.addEventListener('click', () => {
      activeId = conversation.id;
      persist();
      render();
      elements.sidebar.classList.remove('open');
    });
    elements.conversationList.append(button);
  }
}

function renderMessages() {
  const conversation = activeConversation();

  elements.chat.replaceChildren();

  if (!conversation || conversation.messages.length === 0) {
    elements.chat.append(elements.welcome);
    return;
  }

  for (const message of conversation.messages) {
    const { article } = messageElement(message);
    elements.chat.append(article);
  }

  requestAnimationFrame(() => {
    elements.chat.scrollTop = elements.chat.scrollHeight;
  });
}

function render() {
  renderConversationList();
  renderMessages();

  const conversation = activeConversation();
  if (conversation?.model) elements.modelSelect.value = conversation.model;
  elements.modelBadge.textContent = elements.modelSelect.value || appConfig.defaultModel || 'Local AI';
}

function autoResize() {
  elements.prompt.style.height = 'auto';
  elements.prompt.style.height = `${Math.min(elements.prompt.scrollHeight, 220)}px`;
}

function setGenerating(generating) {
  elements.sendButton.disabled = generating;
  elements.stopButton.classList.toggle('hidden', !generating);
}

async function sendMessage(text) {
  const clean = text.trim();
  if (!clean || currentController) return;

  let conversation = activeConversation();
  if (!conversation) conversation = createConversation();

  conversation.model = elements.modelSelect.value || appConfig.defaultModel;
  conversation.messages.push({ role: 'user', content: clean });

  if (conversation.messages.length === 1) {
    conversation.title = titleFrom(clean);
  }

  const assistantMessage = { role: 'assistant', content: '' };
  conversation.messages.push(assistantMessage);
  conversation.updatedAt = Date.now();

  persist();
  render();

  const rendered = [...elements.chat.querySelectorAll('.message-content')].at(-1);

  currentController = new AbortController();
  setGenerating(true);

  try {
    await streamChat({
      model: conversation.model,
      messages: conversation.messages.slice(0, -1),
      signal: currentController.signal,
      onToken(token) {
        assistantMessage.content += token;
        if (rendered) rendered.innerHTML = renderMarkdown(assistantMessage.content);
        elements.chat.scrollTop = elements.chat.scrollHeight;
      }
    });
  } catch (error) {
    if (error.name !== 'AbortError') {
      assistantMessage.content += `\n\n[Error: ${error.message}]`;
      if (rendered) rendered.innerHTML = renderMarkdown(assistantMessage.content);
    }
  } finally {
    currentController = null;
    conversation.updatedAt = Date.now();
    persist();
    setGenerating(false);
    renderConversationList();
  }
}

async function initialize() {
  try {
    appConfig = await getConfig();
    document.title = appConfig.name;
  } catch {}

  try {
    const models = await getModels();

    elements.modelSelect.replaceChildren();

    for (const model of models) {
      const option = document.createElement('option');
      option.value = model.id;
      option.textContent = model.id;
      elements.modelSelect.append(option);
    }

    if (models.length === 0 && appConfig.defaultModel) {
      const option = document.createElement('option');
      option.value = appConfig.defaultModel;
      option.textContent = appConfig.defaultModel;
      elements.modelSelect.append(option);
    }

    if (appConfig.defaultModel) {
      elements.modelSelect.value = appConfig.defaultModel;
    }
  } catch {
    if (appConfig.defaultModel) {
      elements.modelSelect.innerHTML = `<option value="${appConfig.defaultModel}">${appConfig.defaultModel}</option>`;
    }
  }

  try {
    const status = await getHealth();
    elements.statusDot.classList.add(status.ok ? 'ok' : 'bad');
    elements.statusText.textContent = status.ok ? 'Ollama online' : 'Ollama unavailable';
  } catch {
    elements.statusDot.classList.add('bad');
    elements.statusText.textContent = 'Server unavailable';
  }

  if (!activeConversation() && conversations.length > 0) {
    activeId = conversations[0].id;
    persist();
  }

  render();
}

elements.composer.addEventListener('submit', event => {
  event.preventDefault();
  const text = elements.prompt.value;
  elements.prompt.value = '';
  autoResize();
  sendMessage(text);
});

elements.prompt.addEventListener('input', autoResize);

elements.prompt.addEventListener('keydown', event => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    elements.composer.requestSubmit();
  }
});

elements.stopButton.addEventListener('click', () => currentController?.abort());

elements.newChatButton.addEventListener('click', () => {
  createConversation();
  elements.prompt.focus();
  elements.sidebar.classList.remove('open');
});

elements.clearButton.addEventListener('click', () => {
  const conversation = activeConversation();
  if (!conversation) return;

  conversation.messages = [];
  conversation.title = 'New chat';
  conversation.updatedAt = Date.now();
  persist();
  render();
});

elements.modelSelect.addEventListener('change', () => {
  const conversation = activeConversation();
  if (conversation) {
    conversation.model = elements.modelSelect.value;
    persist();
  }
  elements.modelBadge.textContent = elements.modelSelect.value;
});

elements.menuButton.addEventListener('click', () => {
  elements.sidebar.classList.toggle('open');
});

initialize();
