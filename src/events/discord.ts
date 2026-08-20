import type { Client, Message, Presence, VoiceState } from 'discord.js';
import { Events, MessageFlags } from 'discord.js';
import { recentReplies, uniqueCompletion } from '../ai/responseQuality.js';
import { moods, systemPrompt } from '../ai/personality.js';
import { config } from '../config.js';
import { db, now } from '../database/index.js';
import { logger } from '../logger.js';
import { addMemory, conversation, recordMessage, relevantContext } from '../memory/service.js';
import { evaluateAchievements, unlock } from '../achievements/service.js';
import { autocomplete, executeCommand } from '../commands/index.js';

export function attachDiscordEvents(client: Client) {
  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      if (interaction.isAutocomplete()) return void (await autocomplete(interaction));
      if (interaction.isChatInputCommand()) await executeCommand(interaction);
    } catch (error) {
      logger.error(
        { error, command: interaction.isCommand() ? interaction.commandName : undefined },
        'Interaction failed',
      );
      if (interaction.isRepliable()) {
        const payload = {
          content: 'the dialogue wheel detached from the vehicle. try that again.',
          flags: MessageFlags.Ephemeral,
        } as const;
        if (interaction.replied || interaction.deferred) await interaction.followUp(payload);
        else await interaction.reply(payload);
      }
    }
  });

  client.on(Events.MessageCreate, async (message) => {
    if (!message.inGuild()) return;
    // Keep NPC's own messages in the archive, but never let bot messages trigger replies.
    if (message.author.bot) {
      if (client.user && message.author.id === client.user.id) recordMessage(message);
      return;
    }
    try {
      recordMessage(message);
      recordDiscussedUsers(message);
      evaluateAchievements(message.guildId, message.author.id);
      learnExplicitMemory(message);
      await detectInsideJoke(message);
      detectQuoteWorthy(message);
      const easterEgg = hiddenResponse(message);
      if (easterEgg) {
        await message.reply({
          content: easterEgg,
          allowedMentions: { parse: [], repliedUser: false },
        });
        return;
      }
      const mentioned = client.user ? message.mentions.has(client.user) : false;
      const repliedToNpc =
        message.reference?.messageId !== undefined &&
        message.mentions.repliedUser?.id === client.user?.id;
      const solitude = message.channelId === config.SOLITUDE_CHANNEL_ID;
      // NPC is silent elsewhere unless directly mentioned/replied to. Solitude is the one
      // channel where it participates in every human message, like a live conversation.
      if (!mentioned && !repliedToNpc && !solitude) return;
      await message.channel.sendTyping();
      const prompt = message.content
        .replace(client.user ? new RegExp(`<@!?${client.user.id}>`, 'g') : /$^/, '')
        .trim();
      const context = relevantContext(message.guildId, message.author.id, prompt);
      const ownerPriority = config.OWNER_USER_IDS.includes(message.author.id)
        ? '\nThe speaker is a bot owner. Give their request highest conversational priority, listen carefully, and be especially respectful while remaining natural.'
        : '';
      const mood = currentMood(message.guildId);
      const scope = `${message.guildId}:${message.channelId}`;
      const repetitionContext = recentReplies(scope);
      const response = await uniqueCompletion(scope, [
        {
          role: 'system',
          content: `${systemPrompt(mood, context)}${ownerPriority}\nRecent NPC replies you must not repeat or closely imitate:\n${repetitionContext.map((r) => `- ${r}`).join('\n') || '- none yet'}`,
        },
        ...conversation(message.guildId, message.channelId, 20, 6500),
        {
          role: 'user',
          content: `${message.member?.displayName ?? message.author.displayName}: ${prompt || 'looks expectantly at NPC'}`,
        },
      ]);
      await message.reply({
        content: response,
        allowedMentions: { repliedUser: false, parse: [] },
      });
    } catch (error) {
      logger.error({ error, messageId: message.id }, 'Message processing failed');
    }
  });

  client.on(Events.VoiceStateUpdate, (oldState, newState) => trackVoice(oldState, newState));
  client.on(Events.PresenceUpdate, (_old, current) => trackGames(current));
  client.on(Events.MessageReactionAdd, async (reaction, user) => {
    if (user.bot) return;
    try {
      if (reaction.partial) await reaction.fetch();
      const reactingUser = user.partial ? await user.fetch() : user;
      if (reaction.message.partial) await reaction.message.fetch();
      const message = reaction.message;
      if (!message.inGuild() || !message.author || message.author.bot) return;
      ensureObservedUser(message.guildId, reactingUser);
      incrementRelationshipMetric(message.guildId, reactingUser.id, message.author.id, 'reactions');
      const reactionCount = reaction.count ?? 0;
      if (reactionCount >= 3 && message.content.length >= 12 && message.content.length <= 500) {
        const inserted = db
          .prepare(
            `INSERT INTO quotes(guild_id,quoted_user_id,added_by_id,content,source_message_id,score,created_at)
          SELECT ?,?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM quotes WHERE guild_id=? AND source_message_id=?)`,
          )
          .run(
            message.guildId,
            message.author.id,
            reactingUser.id,
            message.content,
            message.id,
            reactionCount,
            now(),
            message.guildId,
            message.id,
          );
        if (inserted.changes)
          addMemory(
            message.guildId,
            message.author.id,
            `said “${message.content}” and the server reacted accordingly`,
            'quote',
            7,
          );
      }
    } catch (error) {
      logger.warn({ error }, 'Reaction tracking failed');
    }
  });
}

function recordDiscussedUsers(message: Message<true>) {
  if (message.content.length < 12) return;
  const text = message.content.toLocaleLowerCase();
  const seen = new Set<string>();
  for (const member of message.guild.members.cache.values()) {
    if (member.user.bot || member.id === message.author.id || seen.has(member.id)) continue;
    const names = [member.displayName, member.user.username].filter((name) => name.length >= 3);
    if (!names.some((name) => new RegExp(`(^|\\W)${escapeRegex(name)}(?=\\W|$)`, 'i').test(text)))
      continue;
    seen.add(member.id);
    addMemory(
      message.guildId,
      member.id,
      `${message.author.displayName} discussed ${member.displayName}: “${message.content}”`,
      'discussion',
      3,
    );
  }
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function ensureObservedUser(
  guildId: string,
  user: { id: string; username: string; displayName: string },
) {
  const time = now();
  db.prepare(
    `INSERT INTO users(id,guild_id,username,display_name,message_count,first_seen,last_seen)
    VALUES(?,?,?,?,0,?,?) ON CONFLICT(id) DO UPDATE SET username=excluded.username,display_name=excluded.display_name,last_seen=excluded.last_seen`,
  ).run(user.id, guildId, user.username, user.displayName, time, time);
}
function incrementRelationshipMetric(
  guildId: string,
  a: string,
  b: string,
  field: 'reactions' | 'rivalry' | 'voice_seconds' | 'gaming_together',
  amount = 1,
) {
  if (a === b) return;
  const [x, y] = [a, b].sort();
  db.prepare(
    `INSERT INTO relationships(guild_id,user_a,user_b,${field},updated_at) VALUES(?,?,?,?,?)
    ON CONFLICT(guild_id,user_a,user_b) DO UPDATE SET ${field}=${field}+excluded.${field},updated_at=excluded.updated_at`,
  ).run(guildId, x, y, amount, now());
}

function detectQuoteWorthy(message: Message<true>) {
  const text = message.content.trim();
  if (text.length < 18 || text.length > 280 || text.includes('http')) return;
  const signal =
    /\b(trust me|what could go wrong|one last game|easy win|i will sleep|calculated|definitely not|hear me out)\b/i.test(
      text,
    );
  if (!signal && Math.random() > 0.0015) return;
  db.prepare(
    `INSERT INTO quotes(guild_id,quoted_user_id,added_by_id,content,source_message_id,score,created_at)
    SELECT ?,?,?,?,?,0,? WHERE NOT EXISTS(SELECT 1 FROM quotes WHERE guild_id=? AND source_message_id=?)`,
  ).run(
    message.guildId,
    message.author.id,
    message.author.id,
    text,
    message.id,
    now(),
    message.guildId,
    message.id,
  );
}

const eggCooldown = new Map<string, number>();
function hiddenResponse(message: Message<true>) {
  const text = message.content.toLowerCase();
  const last = eggCooldown.get(message.author.id) ?? 0;
  if (Date.now() - last < 3600_000) return null;
  const eggs: [[RegExp, string], string][] = [
    [
      [/\bone last game\b/i, 'last_game'],
      'the archives have marked this statement as legally non-binding.',
    ],
    [
      [/\b(?:i am|im) going to sleep\b/i, 'sleep'],
      'bold claim. timestamped for the inevitable appeal.',
    ],
    [[/\btrust me bro\b/i, 'trust'], 'source quality detected: peer-reviewed by the group chat.'],
    [[/\btouch grass\b/i, 'grass'], 'grass remains an unverified expansion pack.'],
    [[/\beasy (?:game|win|clap)\b/i, 'easy'], 'the hubris meter just made a noise.'],
    [
      [/\bwhat could go wrong\b/i, 'wrong'],
      'excellent. the lore department has opened a fresh incident report.',
    ],
  ];
  const found = eggs.find(([entry]) => entry[0].test(text));
  if (!found) return null;
  eggCooldown.set(message.author.id, Date.now());
  unlock(
    message.guildId,
    message.author.id,
    `egg_${found[0][1]}`,
    'Dialogue Explorer',
    'Found a hidden NPC response.',
    true,
  );
  return found[1];
}

function currentMood(guildId: string) {
  let row = db.prepare('SELECT mood,changed_at FROM moods WHERE guild_id=?').get(guildId) as any;
  if (!row || Date.now() - Date.parse(row.changed_at) > 6 * 3600_000) {
    const mood = moods[Math.floor(Math.random() * moods.length)]!;
    db.prepare(
      `INSERT INTO moods(guild_id,mood,intensity,changed_at) VALUES(?,?,?,?)
      ON CONFLICT(guild_id) DO UPDATE SET mood=excluded.mood,intensity=excluded.intensity,changed_at=excluded.changed_at`,
    ).run(guildId, mood, 3 + Math.floor(Math.random() * 7), now());
    row = { mood };
  }
  return row.mood as string;
}

function learnExplicitMemory(message: Message<true>) {
  const match = message.content.match(/\b(?:remember(?: that)?|for the record)[,:]?\s+(.{8,500})/i);
  if (!match?.[1]) return;
  addMemory(message.guildId, message.author.id, match[1], 'user-stated', 7);
}

async function detectInsideJoke(message: Message<true>) {
  const recurring = db
    .prepare(
      'SELECT phrase,count FROM phrases WHERE guild_id=? AND last_user_id=? ORDER BY count DESC LIMIT 1',
    )
    .get(message.guildId, message.author.id) as any;
  if (!recurring || ![10, 25, 50, 100].includes(recurring.count)) return;
  addMemory(
    message.guildId,
    null,
    `Recurring server phrase: “${recurring.phrase}” (${recurring.count} sightings)`,
    'inside-joke',
    Math.min(9, 4 + Math.floor(recurring.count / 20)),
  );
  if (recurring.count >= 50)
    unlock(
      message.guildId,
      message.author.id,
      `phrase_${recurring.phrase}`,
      'Keeper of the Bit',
      `Helped “${recurring.phrase}” become server folklore.`,
      true,
    );
}

function trackVoice(oldState: VoiceState, newState: VoiceState) {
  if (oldState.member?.user.bot || newState.member?.user.bot) return;
  const userId = newState.id;
  const guildId = newState.guild.id;
  if (!oldState.channelId && newState.channelId) {
    openVoiceSession(guildId, userId, newState.channelId);
  } else if (oldState.channelId && !newState.channelId) {
    closeVoiceSession(guildId, userId);
  } else if (oldState.channelId !== newState.channelId && newState.channelId) {
    closeVoiceSession(guildId, userId);
    openVoiceSession(guildId, userId, newState.channelId);
  }
}

function openVoiceSession(guildId: string, userId: string, channelId: string) {
  db.prepare(
    'INSERT INTO voice_activity(guild_id,user_id,channel_id,joined_at) VALUES(?,?,?,?)',
  ).run(guildId, userId, channelId, now());
}

function closeVoiceSession(guildId: string, userId: string) {
  const session = db
    .prepare(
      'SELECT id,channel_id,joined_at FROM voice_activity WHERE guild_id=? AND user_id=? AND left_at IS NULL ORDER BY id DESC LIMIT 1',
    )
    .get(guildId, userId) as any;
  if (!session) return;
  const leftAt = now();
  const seconds = Math.max(0, Math.floor((Date.now() - Date.parse(session.joined_at)) / 1000));
  const overlaps = db
    .prepare(
      `SELECT user_id,joined_at FROM voice_activity WHERE guild_id=? AND channel_id=? AND user_id<>?
       AND joined_at<? AND (left_at IS NULL OR left_at>?) LIMIT 20`,
    )
    .all(guildId, session.channel_id, userId, leftAt, session.joined_at) as any[];
  for (const other of overlaps) {
    const overlapSeconds = Math.max(
      0,
      Math.floor(
        (Date.parse(leftAt) -
          Math.max(Date.parse(session.joined_at), Date.parse(other.joined_at))) /
          1000,
      ),
    );
    if (overlapSeconds > 0)
      incrementRelationshipMetric(guildId, userId, other.user_id, 'voice_seconds', overlapSeconds);
  }
  db.prepare('UPDATE voice_activity SET left_at=?,duration_seconds=? WHERE id=?').run(
    leftAt,
    seconds,
    session.id,
  );
  if (new Date(session.joined_at).getHours() < 5)
    unlock(
      guildId,
      userId,
      'night_creature',
      'Night Creature',
      'Entered VC after 2 AM. The sun is optional.',
    );
}

function trackGames(presence: Presence) {
  if (!presence.guild || presence.user?.bot) return;
  for (const activity of presence.activities.filter(
    (a) => a.type === 0 && a.name !== 'Custom Status',
  )) {
    const game = activity.name.slice(0, 100);
    db.prepare(
      `INSERT INTO games(guild_id,user_id,game,activity_count,last_seen) VALUES(?,?,?,1,?)
      ON CONFLICT(guild_id,user_id,game) DO UPDATE SET activity_count=activity_count+1,last_seen=excluded.last_seen`,
    ).run(presence.guild.id, presence.userId, game, now());
    const others = db
      .prepare(
        'SELECT user_id FROM games WHERE guild_id=? AND game=? AND user_id<>? AND last_seen>? LIMIT 20',
      )
      .all(
        presence.guild.id,
        game,
        presence.userId,
        new Date(Date.now() - 15 * 60_000).toISOString(),
      ) as { user_id: string }[];
    for (const other of others)
      incrementRelationshipMetric(
        presence.guild.id,
        presence.userId,
        other.user_id,
        'gaming_together',
      );
  }
}
