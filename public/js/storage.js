const STORAGE_KEY = 'maia-chat:conversations:v1';
const ACTIVE_KEY = 'maia-chat:active:v1';

export function loadConversations() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

export function saveConversations(conversations) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
}

export function getActiveId() {
  return localStorage.getItem(ACTIVE_KEY);
}

export function setActiveId(id) {
  if (id) localStorage.setItem(ACTIVE_KEY, id);
  else localStorage.removeItem(ACTIVE_KEY);
}
