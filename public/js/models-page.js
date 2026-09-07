import { getModels } from './api.js';
import { modelInfoRows } from './model-info.js';

const status = document.querySelector('#modelPageStatus');
const list = document.querySelector('#modelInfoList');

function modelCard(model) {
  const article = document.createElement('article');
  article.className = 'model-info-card';
  const title = document.createElement('h2');
  title.textContent = model.display_name || model.id;
  const details = document.createElement('dl');
  for (const [term, value] of modelInfoRows(model)) {
    const dt = document.createElement('dt');
    dt.textContent = term;
    const dd = document.createElement('dd');
    dd.textContent = value;
    details.append(dt, dd);
  }
  article.append(title, details);
  return article;
}

try {
  const models = await getModels();
  list.replaceChildren(...models.map(modelCard));
  status.textContent = models.length
    ? `${models.length} models available.`
    : 'No models are installed.';
} catch {
  status.textContent = 'Model information is unavailable. Check the Maia server and Ollama.';
}
