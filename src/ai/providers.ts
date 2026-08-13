import { config } from '../config.js';
import { logger } from '../logger.js';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}
interface Provider {
  name: string;
  available: boolean;
  complete(messages: ChatMessage[]): Promise<string>;
}

async function request(
  url: string,
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  headers = {},
) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}`, ...headers },
    body: JSON.stringify({ model, messages, temperature: 0.9, max_tokens: 500 }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok)
    throw new Error(`AI HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`);
  const body = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  const content = body.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error('AI returned an empty response');
  return content.slice(0, 1900);
}

const providers: Provider[] = [
  {
    name: 'groq',
    available: Boolean(config.GROQ_API_KEY),
    complete: (messages) =>
      request(
        'https://api.groq.com/openai/v1/chat/completions',
        config.GROQ_API_KEY!,
        config.GROQ_MODEL,
        messages,
      ),
  },
  {
    name: 'openrouter',
    available: Boolean(config.OPENROUTER_API_KEY),
    complete: (messages) =>
      request(
        'https://openrouter.ai/api/v1/chat/completions',
        config.OPENROUTER_API_KEY!,
        config.OPENROUTER_MODEL,
        messages,
        {
          'HTTP-Referer': config.PUBLIC_BASE_URL,
          'X-Title': 'NPC Discord Bot',
        },
      ),
  },
];

export async function complete(messages: ChatMessage[]): Promise<string> {
  for (const provider of providers.filter((item) => item.available)) {
    try {
      return await provider.complete(messages);
    } catch (error) {
      logger.warn({ provider: provider.name, error }, 'AI provider failed; trying fallback');
    }
  }
  return 'my dialogue tree just fell down the stairs. try me again in a minute.';
}
