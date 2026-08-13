import type { Message, User } from 'discord.js';
import { db, now } from '../database/index.js';
import type { MemoryRow } from '../types.js';

const tokens = (text: string) => text.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [];
const stopPhrases = new Set([
  'the',
  'and',
  'for',
  'that',
  'this',
  'with',
  'you',
  'are',
  'was',
  'were',
  'have',
  'has',
  'had',
  'not',
  'but',
  'just',
  'like',
  'from',
]);

export function recordMessage(message: Message<true>) {
  const time = now();
  db.prepare(
    `INSERT INTO users(id,guild_id,username,display_name,nickname,message_count,first_seen,last_seen)
    VALUES(?,?,?,?,?,1,?,?) ON CONFLICT(id) DO UPDATE SET username=excluded.username,
    display_name=excluded.display_name,nickname=excluded.nickname,message_count=message_count+1,last_seen=excluded.last_seen`,
  ).run(
    message.author.id,
    message.guildId,
    message.author.username,
    message.member?.displayName ?? message.author.displayName,
    message.member?.nickname ?? null,
    time,
    time,
  );
  db.prepare(
    `INSERT OR IGNORE INTO messages(id,guild_id,channel_id,user_id,content,reply_to_user_id,created_at)
    VALUES(?,?,?,?,?,?,?)`,
  ).run(
    message.id,
    message.guildId,
    message.channelId,
    message.author.id,
    message.content.slice(0, 2000),
    message.mentions.repliedUser?.id ?? null,
    time,
  );
  db.prepare(
    `INSERT INTO reputation(guild_id,user_id,activity,updated_at) VALUES(?,?,1,?)
    ON CONFLICT(guild_id,user_id) DO UPDATE SET activity=activity+1,updated_at=excluded.updated_at`,
  ).run(message.guildId, message.author.id, time);
  db.prepare('UPDATE users SET favorite_channel_id=? WHERE id=?').run(
    message.channelId,
    message.author.id,
  );

  for (const phrase of extractPhrases(message.content)) {
    db.prepare(
      `INSERT INTO phrases(guild_id,phrase,count,first_user_id,last_user_id,last_seen) VALUES(?,?,1,?,?,?)
      ON CONFLICT(guild_id,phrase) DO UPDATE SET count=count+1,last_user_id=excluded.last_user_id,last_seen=excluded.last_seen`,
    ).run(message.guildId, phrase, message.author.id, message.author.id, time);
  }
  for (const mentioned of message.mentions.users.values()) {
    ensureObservedUser(message.guildId, mentioned);
    updateRelationship(message.guildId, message.author.id, mentioned.id, 'mentions');
  }
  if (message.mentions.repliedUser) {
    ensureObservedUser(message.guildId, message.mentions.repliedUser);
    updateRelationship(
      message.guildId,
      message.author.id,
      message.mentions.repliedUser.id,
      'replies',
    );
  }
  if (isPlayfulBanter(message.content)) {
    for (const mentioned of message.mentions.users.values())
      updateRelationship(message.guildId, message.author.id, mentioned.id, 'rivalry');
    if (message.mentions.repliedUser)
      updateRelationship(
        message.guildId,
        message.author.id,
        message.mentions.repliedUser.id,
        'rivalry',
      );
  }
  const nearby = db
    .prepare(
      `SELECT DISTINCT user_id FROM messages WHERE guild_id=? AND channel_id=?
    AND user_id<>? AND created_at>? LIMIT 12`,
    )
    .all(
      message.guildId,
      message.channelId,
      message.author.id,
      new Date(Date.now() - 5 * 60_000).toISOString(),
    ) as { user_id: string }[];
  for (const user of nearby)
    updateRelationship(message.guildId, message.author.id, user.user_id, 'messages_together');
}

function ensureObservedUser(guildId: string, user: User) {
  const time = now();
  db.prepare(
    `INSERT INTO users(id,guild_id,username,display_name,message_count,first_seen,last_seen)
    VALUES(?,?,?,?,0,?,?) ON CONFLICT(id) DO UPDATE SET username=excluded.username,display_name=excluded.display_name,last_seen=excluded.last_seen`,
  ).run(user.id, guildId, user.username, user.displayName, time, time);
}

function extractPhrases(content: string): string[] {
  const clean = content
    .toLowerCase()
    .replace(/<[^>]+>|https?:\/\/\S+|[^a-z0-9\s']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (clean.length < 4 || clean.length > 80) return [];
  const words = clean.split(' ');
  const found = new Set<string>();
  if (words.length <= 8 && isUsefulPhrase(words)) found.add(clean);
  for (let size = 2; size <= Math.min(4, words.length); size++) {
    for (let index = 0; index <= words.length - size; index++)
      if (isUsefulPhrase(words.slice(index, index + size)))
        found.add(words.slice(index, index + size).join(' '));
  }
  return [...found].slice(0, 12);
}

function isUsefulPhrase(words: string[]) {
  const meaningful = words.filter((word) => !stopPhrases.has(word));
  return meaningful.length >= Math.min(2, words.length) && meaningful.join('').length >= 5;
}

function isPlayfulBanter(content: string) {
  return /\b(noob|bot|washed|skill issue|diff|throwing|threw|fraud|carried|ratio|cope|clown|trash)\b/i.test(
    content,
  );
}

function updateRelationship(
  guildId: string,
  a: string,
  b: string,
  field: 'mentions' | 'replies' | 'messages_together' | 'rivalry',
) {
  if (a === b) return;
  const [userA, userB] = [a, b].sort();
  db.prepare(
    `INSERT INTO relationships(guild_id,user_a,user_b,${field},updated_at) VALUES(?,?,?,1,?)
    ON CONFLICT(guild_id,user_a,user_b) DO UPDATE SET ${field}=${field}+1,updated_at=excluded.updated_at`,
  ).run(guildId, userA, userB, now());
}

export function addMemory(
  guildId: string,
  userId: string | null,
  content: string,
  category = 'observation',
  importance = 5,
) {
  db.prepare(
    'INSERT INTO memories(guild_id,user_id,content,category,importance,created_at) VALUES(?,?,?,?,?,?)',
  ).run(
    guildId,
    userId,
    content.slice(0, 1000),
    category,
    Math.max(1, Math.min(10, importance)),
    now(),
  );
}

export function relevantContext(guildId: string, userId: string, query: string): string {
  const memories = db
    .prepare(
      `SELECT id,content,category,importance,created_at FROM memories
    WHERE guild_id=? AND (user_id=? OR user_id IS NULL) ORDER BY importance DESC, created_at DESC LIMIT 60`,
    )
    .all(guildId, userId) as MemoryRow[];
  const terms = new Set(tokens(query));
  const ranked = memories
    .map((memory) => {
      const ageDays = Math.max(0, (Date.now() - Date.parse(memory.created_at)) / 86400_000);
      const recency = Math.max(0, 4 - Math.log2(ageDays + 1));
      const category = ['lore', 'inside-joke', 'quote'].includes(memory.category) ? 2 : 0;
      return {
        memory,
        score:
          memory.importance * 1.5 +
          recency +
          category +
          tokens(memory.content).filter((t) => terms.has(t)).length * 4,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map(({ memory }) => memory);
  if (ranked.length) {
    const ids = ranked.map((m) => m.id);
    db.prepare(
      `UPDATE memories SET recall_count=recall_count+1,last_recalled_at=? WHERE id IN (${ids.map(() => '?').join(',')})`,
    ).run(now(), ...ids);
  }
  const lore = db
    .prepare(
      'SELECT content FROM lore WHERE guild_id=? ORDER BY score DESC,importance DESC,created_at DESC LIMIT 5',
    )
    .all(guildId) as { content: string }[];
  const user = db
    .prepare('SELECT display_name,nickname,message_count,common_phrases FROM users WHERE id=?')
    .get(userId) as any;
  const phrases = db
    .prepare(
      `SELECT phrase,count FROM phrases WHERE guild_id=? AND
    (first_user_id=? OR last_user_id=?) ORDER BY count DESC LIMIT 5`,
    )
    .all(guildId, userId, userId) as any[];
  const games = db
    .prepare(
      'SELECT game,activity_count FROM games WHERE guild_id=? AND user_id=? ORDER BY activity_count DESC LIMIT 4',
    )
    .all(guildId, userId) as any[];
  const relations = db
    .prepare(
      `SELECT user_a,user_b,mentions,replies,voice_seconds FROM relationships
    WHERE guild_id=? AND (user_a=? OR user_b=?) ORDER BY mentions+replies+voice_seconds/600 DESC LIMIT 3`,
    )
    .all(guildId, userId, userId) as any[];
  return [
    user
      ? `Speaker: ${user.nickname ?? user.display_name}; messages observed: ${user.message_count}`
      : '',
    phrases.length
      ? `Their recurring language: ${phrases.map((p) => `“${p.phrase}” (${p.count}x)`).join(', ')}`
      : '',
    games.length
      ? `Games observed: ${games.map((g) => `${g.game} (${g.activity_count} sightings)`).join(', ')}`
      : '',
    relations.length
      ? `Closest connections: ${relations.map((r) => `${r.user_a === userId ? r.user_b : r.user_a} (${r.mentions + r.replies} chat interactions, ${Math.round(r.voice_seconds / 60)} shared VC minutes)`).join('; ')}`
      : '',
    ranked.length ? `Relevant memories:\n${ranked.map((m) => `- ${m.content}`).join('\n')}` : '',
    lore.length ? `Server lore:\n${lore.map((l) => `- ${l.content}`).join('\n')}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export function conversation(
  guildId: string,
  channelId: string,
  limit = 20,
  characterBudget = 6500,
) {
  const rows = (
    db
      .prepare(
        `SELECT m.content,u.display_name FROM messages m LEFT JOIN users u ON u.id=m.user_id
    WHERE m.guild_id=? AND m.channel_id=? ORDER BY m.created_at DESC LIMIT ?`,
      )
      .all(guildId, channelId, limit) as any[]
  ).reverse();
  const selected: any[] = [];
  let used = 0;
  for (let index = rows.length - 1; index >= 0; index--) {
    const row = rows[index];
    const size = String(row.content).length;
    if (selected.length && used + size > characterBudget) break;
    selected.unshift(row);
    used += size;
  }
  return selected.map((row) => ({
    role: 'user' as const,
    content: `${row.display_name ?? 'someone'}: ${row.content}`,
  }));
}
