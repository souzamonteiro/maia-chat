import { expect, test } from '@playwright/test';

const models = {
  object: 'list',
  data: [
    {
      id: 'qwen2.5:3b',
      display_name: 'Qwen 3B',
      provider: 'Ollama',
      parameter_size: '3B',
      context_window: 8192,
      generation_defaults: null,
      status: 'default',
      loaded: false,
      capabilities: ['chat', 'streaming']
    },
    {
      id: 'qwen2.5-coder:3b',
      display_name: 'Qwen Coder 3B',
      provider: 'Ollama',
      parameter_size: '3B',
      context_window: 8192,
      generation_defaults: { temperature: 0.2, top_p: 0.95, max_tokens: 256 },
      status: 'installed',
      loaded: false,
      capabilities: ['chat', 'streaming']
    }
  ]
};

async function mockApi(page, { webSearchEnabled = false } = {}) {
  await page.route('**/api/config', (route) =>
    route.fulfill({
      json: { name: 'Maia', version: '0.1.0', defaultModel: 'qwen2.5:3b', webSearchEnabled }
    })
  );
  await page.route('**/api/models', (route) => route.fulfill({ json: models }));
  await page.route('**/api/health', (route) =>
    route.fulfill({ json: { status: 'ok', ollama: true, modelsCount: 2 } })
  );
  await page.route('**/api/chat/completions', (route) =>
    route.fulfill({
      contentType: 'text/event-stream; charset=utf-8',
      body:
        'data: {"choices":[{"delta":{"role":"assistant","content":"Hello"},"finish_reason":null}]}\n\n' +
        'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":3,"completion_tokens":1,"total_tokens":4},"elapsed_ms":50}\n\n' +
        'data: [DONE]\n\n'
    })
  );
}

test('send, model branch, saved history, and mobile navigation work in the browser', async ({
  page
}) => {
  await mockApi(page);
  await page.goto('/');
  await expect(page.locator('#statusText')).toHaveText('Ollama online (2 models)');

  await page.locator('#prompt').fill('Write a greeting');
  await page.locator('#sendButton').click();
  await expect(page.locator('.message.assistant .message-content')).toContainText('Hello');
  await expect(page.locator('.conversation-item')).toHaveText('Write a greeting');

  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('#modelSelect').selectOption('qwen2.5-coder:3b');
  await expect(page.locator('.conversation-item')).toHaveCount(2);
  await expect(page.locator('.conversation-item.active')).toContainText('qwen2.5-coder:3b');

  await page.reload();
  await expect(page.locator('.conversation-item')).toHaveCount(2);
  await expect(page.locator('#modelSelect')).toHaveValue('qwen2.5-coder:3b');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#menuButton').click();
  await expect(page.locator('#sidebar')).toHaveClass(/open/);
  await page.keyboard.press('Escape');
  await expect(page.locator('#sidebar')).not.toHaveClass(/open/);
});

test('stop preserves the user prompt and offers recovery actions', async ({ page }) => {
  await mockApi(page);
  await page.route('**/api/chat/completions', () => new Promise(() => {}));
  await page.goto('/');
  await page.locator('#prompt').fill('Keep my prompt');
  await page.locator('#sendButton').click();
  await expect(page.locator('#stopButton')).toBeVisible();
  await page.locator('#stopButton').click();
  await expect(page.locator('.message-recovery').getByText('Generation stopped')).toBeVisible();
  await expect(
    page.locator('.message-recovery').getByRole('button', { name: 'Retry' })
  ).toBeVisible();
  await expect(page.locator('.message.user .message-content')).toContainText('Keep my prompt');
});

test('keyboard users can add a line, send a message, and stop generation', async ({ page }) => {
  await mockApi(page);
  await page.goto('/');

  await page.locator('#prompt').focus();
  await page.keyboard.type('First line');
  await page.keyboard.press('Shift+Enter');
  await page.keyboard.type('Second line');
  await expect(page.locator('#prompt')).toHaveValue('First line\nSecond line');

  await page.keyboard.press('Enter');
  await expect(page.locator('.message.assistant .message-content')).toContainText('Hello');

  await page.route('**/api/chat/completions', () => new Promise(() => {}));
  await page.locator('#prompt').focus();
  await page.keyboard.type('Stop with keyboard');
  await page.keyboard.press('Enter');
  await expect(page.locator('#stopButton')).toBeVisible();
  await page.locator('#stopButton').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.message-recovery').getByText('Generation stopped')).toBeVisible();
});

test('attached documents send retrieved chunks with citation instructions', async ({ page }) => {
  await mockApi(page);
  let requestBody;
  await page.route('**/api/chat/completions', (route) => {
    requestBody = route.request().postDataJSON();
    return route.fulfill({
      contentType: 'text/event-stream; charset=utf-8',
      body:
        'data: {"choices":[{"delta":{"role":"assistant","content":"Tuesday"},"finish_reason":null}]}\n\n' +
        'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n' +
        'data: [DONE]\n\n'
    });
  });
  await page.goto('/');
  await page.locator('#attachmentInput').setInputFiles({
    name: 'roadmap.md',
    mimeType: 'text/markdown',
    buffer: Buffer.from('# Roadmap\n\nThe release target is Tuesday.')
  });
  await page.locator('#prompt').fill('What is the release target?');
  await page.locator('#sendButton').click();

  await expect(page.locator('.message.assistant .message-content')).toContainText('Tuesday');
  const content = requestBody.messages.at(-1).content;
  expect(content).toContain('[Retrieved source: roadmap.md, chunk 1/1]');
  expect(content).toContain('Cite documents as [file name, chunk n/total]');
});

test('saved local collections persist and supply retrieved context', async ({ page }) => {
  await mockApi(page);
  let requestBody;
  await page.route('**/api/chat/completions', (route) => {
    requestBody = route.request().postDataJSON();
    return route.fulfill({
      contentType: 'text/event-stream; charset=utf-8',
      body:
        'data: {"choices":[{"delta":{"role":"assistant","content":"Tuesday"},"finish_reason":null}]}\n\n' +
        'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n' +
        'data: [DONE]\n\n'
    });
  });
  await page.goto('/');
  page.once('dialog', (dialog) => dialog.accept('Release notes'));
  await page.locator('#newCollectionButton').click();
  await expect(page.locator('#collectionSelect')).toHaveValue(/.+/);
  await page.locator('#collectionDocumentInput').setInputFiles({
    name: 'release.md',
    mimeType: 'text/markdown',
    buffer: Buffer.from('# Release\n\nThe launch date is Tuesday.')
  });
  await expect(page.locator('#collectionDocumentList')).toContainText('release.md');

  await page.reload();
  await expect(page.locator('#collectionDocumentList')).toContainText('release.md');
  await page.locator('#prompt').fill('What is the launch date?');
  await page.locator('#sendButton').click();
  await expect(page.locator('.message.assistant .message-content')).toContainText('Tuesday');
  expect(requestBody.messages.at(-1).content).toContain(
    '[Retrieved source: release.md, chunk 1/1]'
  );
});

test('web search selects a source and sends it as citable context', async ({ page }) => {
  await mockApi(page, { webSearchEnabled: true });
  let requestBody;
  await page.route('**/api/search**', (route) =>
    route.fulfill({
      json: {
        object: 'list',
        data: [
          {
            title: 'Maia release notes',
            url: 'https://example.test/releases',
            snippet: 'The release date is Tuesday.',
            engine: 'example'
          }
        ]
      }
    })
  );
  await page.route('**/api/chat/completions', (route) => {
    requestBody = route.request().postDataJSON();
    return route.fulfill({
      contentType: 'text/event-stream; charset=utf-8',
      body:
        'data: {"choices":[{"delta":{"role":"assistant","content":"Tuesday"},"finish_reason":null}]}\n\n' +
        'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n' +
        'data: [DONE]\n\n'
    });
  });
  await page.goto('/');
  await expect(page.locator('#webSearch')).toBeVisible();
  await page.locator('#webSearchQuery').fill('Maia release date');
  await page.locator('#webSearchButton').click();
  await page.locator('.web-search-result input[type="checkbox"]').check();
  await page.locator('#prompt').fill('When is the release date?');
  await page.locator('#sendButton').click();

  await expect(page.locator('.message.assistant .message-content')).toContainText('Tuesday');
  const content = requestBody.messages.at(-1).content;
  expect(content).toContain('[Web source: Maia release notes]');
  expect(content).toContain('URL: https://example.test/releases');
  expect(content).toContain('web sources as [Web source: title]');
  await expect(page.locator('.message.user .web-sources a')).toHaveAttribute(
    'href',
    'https://example.test/releases'
  );
});

test('failed streaming response preserves partial output and offers Retry', async ({ page }) => {
  await mockApi(page);
  await page.route('**/api/chat/completions', (route) =>
    route.fulfill({
      contentType: 'text/event-stream; charset=utf-8',
      body:
        'data: {"choices":[{"delta":{"content":"Partial answer"},"finish_reason":null}]}\n\n' +
        'data: {"error":{"message":"Ollama unavailable","type":"service_unavailable_error","code":"ollama_unavailable"}}\n\n'
    })
  );
  await page.goto('/');
  await page.locator('#languageSelect').selectOption('pt');
  await page.locator('#prompt').fill('Keep my prompt');
  await page.locator('#sendButton').click();
  await expect(page.getByText('Resposta interrompida')).toBeVisible();
  await expect(page.locator('.message.assistant .message-content')).toContainText('Partial answer');
  await expect(
    page.locator('.message-recovery').getByRole('button', { name: 'Tentar novamente' })
  ).toBeVisible();
  await expect(page.locator('.message.user .message-content')).toContainText('Keep my prompt');
});
