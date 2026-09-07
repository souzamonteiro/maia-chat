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

async function mockApi(page) {
  await page.route('**/api/config', (route) =>
    route.fulfill({ json: { name: 'Maia', version: '0.1.0', defaultModel: 'qwen2.5:3b' } })
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
