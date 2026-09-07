export function createElement(tagName, { className, text, attributes = {} } = {}) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  for (const [name, value] of Object.entries(attributes)) {
    element.setAttribute(name, String(value));
  }
  return element;
}

export function createButton({ className, label, disabled = false, ariaLabel, onClick }) {
  const button = createElement('button', { className, text: label });
  button.type = 'button';
  button.disabled = disabled;
  if (ariaLabel) button.setAttribute('aria-label', ariaLabel);
  if (onClick) button.addEventListener('click', onClick);
  return button;
}

export function createRecoveryNotice({ state, title, detail, actions }) {
  const notice = createElement('div', { className: `message-recovery ${state}` });
  const text = createElement('div', { className: 'message-error' });
  const heading = createElement('strong', { text: title });
  const description = createElement('span', { text: detail });
  const actionList = createElement('div', { className: 'message-actions' });

  text.append(heading, description);
  actionList.append(...actions);
  notice.append(text, actionList);
  return notice;
}
