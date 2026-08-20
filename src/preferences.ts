import { db } from './database/index.js';

export type ReplyPreferences = {
  length: 'short' | 'normal' | 'detailed';
  format: 'single' | 'multiple' | 'bullets';
  humor: 'serious' | 'light' | 'chaotic';
  roast: 'off' | 'playful' | 'savage';
  emojis: 'none' | 'normal' | 'lots';
  language: string;
  tracking: 'on' | 'off';
};

export const defaultPreferences: ReplyPreferences = {
  length: 'normal',
  format: 'single',
  humor: 'light',
  roast: 'playful',
  emojis: 'normal',
  language: 'English',
  tracking: 'on',
};

export function getPreferences(guildId: string, userId: string): ReplyPreferences {
  const row = db
    .prepare('SELECT preferences FROM user_state WHERE guild_id=? AND user_id=?')
    .get(guildId, userId) as { preferences?: string } | undefined;
  try {
    return { ...defaultPreferences, ...(row?.preferences ? JSON.parse(row.preferences) : {}) };
  } catch {
    return { ...defaultPreferences };
  }
}

export function savePreferences(guildId: string, userId: string, preferences: ReplyPreferences) {
  db.prepare(
    `INSERT INTO user_state(guild_id,user_id,preferences) VALUES(?,?,?)
     ON CONFLICT(guild_id,user_id) DO UPDATE SET preferences=excluded.preferences`,
  ).run(guildId, userId, JSON.stringify(preferences));
}
