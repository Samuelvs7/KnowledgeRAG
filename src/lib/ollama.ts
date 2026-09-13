const OLLAMA_BASE_URL = 'http://localhost:11434';

export interface OllamaModel {
  name: string;
  size?: number;
}

export async function checkOllamaAvailable(timeoutMs = 2500): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`, { signal: controller.signal });
    window.clearTimeout(timeout);
    return res.ok;
  } catch {
    return false;
  }
}

export async function listOllamaModels(): Promise<OllamaModel[]> {
  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.models || []).map((m: { name: string; size?: number }) => ({ name: m.name, size: m.size }));
  } catch {
    return [];
  }
}

export async function streamOllamaChat(
  model: string,
  systemInstruction: string,
  prompt: string,
  onDelta: (text: string) => void,
): Promise<string> {
  const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemInstruction },
        { role: 'user', content: prompt },
      ],
      stream: true,
      options: { temperature: 0.2 },
    }),
  });

  if (!response.ok || !response.body) {
    throw new Error(`Ollama request failed (${response.status})`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const chunk = JSON.parse(line);
        const delta = chunk?.message?.content;
        if (delta) {
          full += delta;
          onDelta(delta);
        }
      } catch {
        // Ollama occasionally emits a partial/empty line at stream end — safe to skip.
      }
    }
  }

  return full;
}

export function ollamaInstallMessage(): string {
  const origin = window.location.origin;
  return (
    "I couldn't reach Ollama on this device. To chat using your own local model:\n\n" +
    '1. Install Ollama from https://ollama.com\n' +
    '2. Pull a model, e.g. `ollama pull llama3.2`\n' +
    `3. Let this site talk to it — set OLLAMA_ORIGINS=${origin} before starting Ollama, then restart it\n` +
    '4. Come back and try again'
  );
}
