import { complete, type ChatMessage } from './providers.js';

interface CachedReply {
  text: string;
  normalized: string;
  at: number;
}
const recent = new Map<string, CachedReply[]>();
const TTL = 6 * 3600_000;
const normalize = (text: string) =>
  text
    .toLowerCase()
    .replace(/<@!?\d+>/g, '@user')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
const shingles = (text: string) => {
  const words = normalize(text).split(' ').filter(Boolean);
  return new Set(
    words.length < 3 ? words : words.slice(0, -2).map((_, i) => words.slice(i, i + 3).join(' ')),
  );
};
export function similarity(a: string, b: string) {
  const left = shingles(a),
    right = shingles(b);
  if (!left.size || !right.size) return 0;
  let overlap = 0;
  for (const value of left) if (right.has(value)) overlap++;
  return (2 * overlap) / (left.size + right.size);
}
function replies(scope: string) {
  const cutoff = Date.now() - TTL;
  const values = (recent.get(scope) ?? []).filter((entry) => entry.at > cutoff).slice(-20);
  recent.set(scope, values);
  return values;
}
export function recentReplies(scope: string) {
  return replies(scope)
    .slice(-8)
    .map((entry) => entry.text);
}
export async function uniqueCompletion(scope: string, messages: ChatMessage[]) {
  const history = replies(scope);
  let candidate = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    const correction: ChatMessage[] =
      attempt === 0
        ? []
        : [
            {
              role: 'system',
              content: `That draft was too similar to a recent NPC reply. Rewrite from a genuinely different angle, structure, and joke. Do not reuse its opening or punchline. Rejected draft: ${candidate}`,
            },
          ];
    candidate = await complete([...messages, ...correction]);
    if (
      !history.some(
        (entry) =>
          entry.normalized === normalize(candidate) || similarity(entry.text, candidate) >= 0.72,
      )
    )
      break;
  }
  const isProviderFallback =
    /language engine is temporarily offline|reply engine is taking|AI provider is unavailable/i.test(
      candidate,
    );
  if (history.some((entry) => entry.normalized === normalize(candidate)) && !isProviderFallback)
    candidate = `the dialogue loop tried to claim me again. anyway: ${candidate.slice(0, 1650)}`;
  history.push({ text: candidate, normalized: normalize(candidate), at: Date.now() });
  recent.set(scope, history.slice(-20));
  return candidate;
}
