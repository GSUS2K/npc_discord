import { db, now } from '../database/index.js';

const definitions = [
  {
    key: 'first_words',
    name: 'Spawn Point',
    description: 'Sent a first recorded message.',
    test: (m: number) => m >= 1,
  },
  {
    key: 'serial_yapper',
    name: 'Serial Yapper',
    description: 'Sent 500 messages.',
    test: (m: number) => m >= 500,
  },
  {
    key: 'main_character',
    name: 'Main Character Syndrome',
    description: 'Sent 2,000 messages.',
    test: (m: number) => m >= 2000,
  },
] as const;

export function evaluateAchievements(guildId: string, userId: string): string[] {
  const user = db
    .prepare('SELECT message_count FROM users WHERE guild_id=? AND id=?')
    .get(guildId, userId) as { message_count: number } | undefined;
  if (!user) return [];
  const unlocked: string[] = [];
  for (const achievement of definitions) {
    if (!achievement.test(user.message_count)) continue;
    const result = db
      .prepare(
        `INSERT OR IGNORE INTO achievements(guild_id,user_id,key,name,description,unlocked_at)
      VALUES(?,?,?,?,?,?)`,
      )
      .run(guildId, userId, achievement.key, achievement.name, achievement.description, now());
    if (result.changes) unlocked.push(achievement.name);
  }
  return unlocked;
}

export function unlock(
  guildId: string,
  userId: string,
  key: string,
  name: string,
  description: string,
  secret = false,
) {
  return (
    db
      .prepare(
        `INSERT OR IGNORE INTO achievements(guild_id,user_id,key,name,description,unlocked_at,secret)
    VALUES(?,?,?,?,?,?,?)`,
      )
      .run(guildId, userId, key, name, description, now(), Number(secret)).changes > 0
  );
}
