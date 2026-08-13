import cron from 'node-cron';
import type { Client, TextChannel } from 'discord.js';
import { config } from './config.js';
import { db, now } from './database/index.js';
import { logger } from './logger.js';

async function channel(client: Client, guildId: string) {
  const configured = db
    .prepare("SELECT value FROM settings WHERE guild_id=? AND key='gossip_channel_id'")
    .get(guildId) as any;
  const id = configured?.value || config.GOSSIP_CHANNEL_ID;
  if (!id) return null;
  return client.channels.fetch(id).catch(() => null) as Promise<TextChannel | null>;
}

export function startScheduler(client: Client) {
  cron.schedule(
    '0 10 * * *',
    async () => {
      for (const guild of client.guilds.cache.values()) {
        try {
          const target = await channel(client, guild.id);
          if (target?.isTextBased()) await target.send(dailyGossip(guild.id));
        } catch (error) {
          logger.error({ error, guildId: guild.id }, 'Daily gossip failed');
        }
      }
    },
    { timezone: config.TIMEZONE },
  );
  cron.schedule(
    '0 18 * * 0',
    async () => {
      for (const guild of client.guilds.cache.values()) {
        try {
          const target = await channel(client, guild.id);
          if (target?.isTextBased()) await target.send(newsletter(guild.id));
        } catch (error) {
          logger.error({ error, guildId: guild.id }, 'Newsletter failed');
        }
      }
    },
    { timezone: config.TIMEZONE },
  );
  cron.schedule('0 */6 * * *', () => randomizeEvents(client));
}

function dailyGossip(guildId: string) {
  const since = new Date(Date.now() - 86400_000).toISOString();
  const top = db
    .prepare(
      'SELECT u.display_name,COUNT(*) n FROM messages m JOIN users u ON u.id=m.user_id WHERE m.guild_id=? AND m.created_at>? GROUP BY m.user_id ORDER BY n DESC LIMIT 3',
    )
    .all(guildId, since) as any[];
  const phrase = db
    .prepare('SELECT phrase,count FROM phrases WHERE guild_id=? ORDER BY count DESC LIMIT 1')
    .get(guildId) as any;
  return `🗞️ **NPC Daily Gossip**\n${top.length ? `${top[0].display_name} produced ${top[0].n} messages. restraint was never considered.` : 'The server was quiet. Too quiet.'}${phrase ? `\n“${phrase.phrase}” has now been sighted ${phrase.count} times. linguists are concerned.` : ''}\nNobody is surprised.`;
}
function newsletter(guildId: string) {
  const since = new Date(Date.now() - 7 * 86400_000).toISOString();
  const lore = db
    .prepare(
      'SELECT content FROM lore WHERE guild_id=? AND created_at>? ORDER BY importance DESC LIMIT 3',
    )
    .all(guildId, since) as any[];
  const quote = db
    .prepare(
      'SELECT q.content,u.display_name FROM quotes q LEFT JOIN users u ON u.id=q.quoted_user_id WHERE q.guild_id=? AND q.created_at>? ORDER BY q.score DESC,RANDOM() LIMIT 1',
    )
    .get(guildId, since) as any;
  const mvp = db
    .prepare(
      'SELECT u.display_name,COUNT(*) n FROM messages m JOIN users u ON u.id=m.user_id WHERE m.guild_id=? AND m.created_at>? GROUP BY m.user_id ORDER BY n DESC LIMIT 1',
    )
    .get(guildId, since) as any;
  return `📰 **THE NPC CHRONICLE — Weekly Edition**\n\n**Biggest Moments**\n${lore.length ? lore.map((l) => `• ${l.content}`).join('\n') : '• historians found no paperwork'}\n\n**Quote Desk**\n${quote ? `“${quote.content}” — ${quote.display_name}` : 'the witnesses exercised their right to silence'}\n\n**MVP of the Week**\n${mvp ? `${mvp.display_name}, with ${mvp.n} documented transmissions.` : 'vacant pending signs of life'}\n\n*NPC accepts no liability for this journalism.*`;
}
function randomizeEvents(client: Client) {
  if (Math.random() > 0.25) return;
  const pool = [
    ['chaos', 'CHAOS HOUR', 'Normal decision-making has been temporarily disabled.'],
    ['lore', 'LORE BONUS', 'Fresh incidents are worth double imaginary historical value.'],
    ['goblin', 'GOBLIN MODE ACTIVATED', 'The council has abandoned dignity.'],
    ['xp', 'DOUBLE XP WEEKEND', 'Achievements now pay double in fake currency and real shame.'],
    ['quote', 'QUOTE DAY', 'Every sentence is applying for immortality. Choose words poorly.'],
    ['festival', 'LORE FESTIVAL', 'The archives are open and the historians are already tired.'],
  ];
  const event = pool[Math.floor(Math.random() * pool.length)]!;
  for (const guild of client.guilds.cache.values())
    db.prepare(
      'INSERT INTO events(guild_id,type,title,description,starts_at,ends_at) VALUES(?,?,?,?,?,?)',
    ).run(
      guild.id,
      event[0],
      event[1],
      event[2],
      now(),
      new Date(Date.now() + 3600_000).toISOString(),
    );
}
