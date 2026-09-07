import DOMPurify from 'dompurify';
import hljs from 'highlight.js';
import { marked } from 'marked';

const sanitizeOptions = {
  ALLOWED_TAGS: [
    'a',
    'blockquote',
    'br',
    'code',
    'del',
    'details',
    'div',
    'em',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'hr',
    'li',
    'ol',
    'p',
    'pre',
    'strong',
    'span',
    'summary',
    'table',
    'tbody',
    'td',
    'th',
    'thead',
    'tr',
    'ul'
  ],
  ALLOWED_ATTR: ['align', 'class', 'data-language', 'href', 'open', 'start', 'title']
};

function normalizeMarkdown(source, { expandReasoning }) {
  const normalized = source
    .replace(/\\(?=\n)/g, '')
    .replace(/\\(?=#{1,6}\s)/g, '')
    .replace(/^(\d+)\\\.\s/gm, '$1. ')
    .replace(
      /<think>\n?([\s\S]*?)<\/think>\n?/g,
      (_match, thinkText) =>
        `<details class="thinking"><summary>Reasoning</summary><div class="thinking-text">${thinkText.trim()}</div></details>\n`
    )
    .replace(
      /<think>\n?([\s\S]*)$/g,
      (_match, thinkText) =>
        `<details class="thinking"${expandReasoning ? ' open' : ''}><summary>Thinking...</summary><div class="thinking-text">${thinkText.trim()}</div></details>`
    );
  const fences = normalized.match(/```/g) || [];
  return fences.length % 2 === 0 ? normalized : `${normalized}\n\`\`\``;
}

export function createMarkdownRenderer(purifier) {
  const renderer = new marked.Renderer();
  renderer.code = ({ text, lang }) => {
    const language = hljs.getLanguage(lang) ? lang : 'plaintext';
    const code =
      language === 'plaintext'
        ? hljs.highlightAuto(text).value
        : hljs.highlight(text, { language, ignoreIllegals: true }).value;
    return `<pre><code class="hljs language-${language}">${code}</code></pre>\n`;
  };

  return (source = '', options = {}) =>
    purifier.sanitize(
      marked.parse(normalizeMarkdown(source, options), {
        async: false,
        gfm: true,
        renderer
      }),
      sanitizeOptions
    );
}

export const renderMarkdown = createMarkdownRenderer(DOMPurify);
