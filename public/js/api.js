export async function getConfig() {
  const response = await fetch('/api/config');
  if (!response.ok) throw new Error('Could not load configuration.');
  return response.json();
}

export async function getHealth() {
  const response = await fetch('/api/health');
  return {
    ok: response.ok,
    data: await response.json()
  };
}

export async function getModels() {
  const response = await fetch('/v1/models');
  if (!response.ok) throw new Error('Could not load models.');
  const data = await response.json();
  return data.data || [];
}

export async function streamChat({ model, messages, signal, onToken }) {
  const response = await fetch('/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages,
      stream: true
    }),
    signal
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Chat request failed (${response.status}): ${detail}`);
  }

  if (!response.body) throw new Error('Streaming is not supported by this browser.');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split('\n\n');
    buffer = events.pop() || '';

    for (const event of events) {
      const line = event
        .split('\n')
        .find(item => item.startsWith('data: '));

      if (!line) continue;
      const payload = line.slice(6).trim();

      if (payload === '[DONE]') return;

      const data = JSON.parse(payload);
      if (data.error) throw new Error(data.error.message);

      const token = data.choices?.[0]?.delta?.content;
      if (token) onToken(token);
    }
  }
}
