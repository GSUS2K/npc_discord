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
      const detail = error instanceof Error ? { message: error.message, name: error.name } : error;
      logger.warn(
        { provider: provider.name, error: detail },
        'AI provider failed; trying fallback',
      );
    }
  }
  // Keep the bot useful when an API key is missing, exhausted, or temporarily down.
  // A single canned sentence made every user receive the same confusing response.
  const input = messages.filter((message) => message.role === 'user').at(-1)?.content ?? '';
  const lower = input.toLowerCase();
  if (/\b(who are you|who r u|what are you)\b/.test(lower))
    return 'I’m NPC — the server’s own memory-keeping bot. My AI provider is temporarily offline, but I’m still here.';
  if (/\b(hi|hello|hey)\b/.test(lower.trim()))
    return 'hey. I’m NPC. The archive is online, though my clever brain is temporarily buffering.';
  const options = [
    'I caught that, but my language engine is temporarily offline. Try again shortly.',
    'The archive heard you; the reply engine is taking a short coffee break. Try again in a moment.',
    'I’m here, but the AI provider is unavailable right now. Your message was still archived.',
  ];
  const hash = [...input].reduce((sum, character) => sum + character.charCodeAt(0), 0);
  return options[hash % options.length]!;
}
