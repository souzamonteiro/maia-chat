function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function renderMarkdown(source = '') {
  const escaped = escapeHtml(source);

  const withCode = escaped.replace(
    /```([\w+-]*)\n?([\s\S]*?)```/g,
    (_match, lang, code) =>
      `<pre><code data-language="${lang || 'text'}">${code.trim()}</code></pre>`
  );

  return withCode
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');
}
