import {
  type AutocompleteInteraction,
  ChatInputCommandInteraction,
  ButtonInteraction,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  SlashCommandBuilder,
  type TextChannel,
  type User,
} from 'discord.js';
import { execFile } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { promisify } from 'node:util';
import { complete } from '../ai/providers.js';
import { config } from '../config.js';
import { db, now } from '../database/index.js';
import { addMemory } from '../memory/service.js';
import {
  defaultPreferences,
  getPreferences,
  savePreferences,
  type ReplyPreferences,
} from '../preferences.js';

const run = promisify(execFile);

const lore = new SlashCommandBuilder()
  .setName('lore')
  .setDescription('Open the server archives')
  .addSubcommand((s) =>
    s
      .setName('add')
      .setDescription('Preserve an incident forever')
      .addStringOption((o) =>
        o.setName('story').setDescription('What happened?').setRequired(true).setMaxLength(800),
      )
      .addStringOption((o) => o.setName('tags').setDescription('Comma-separated tags'))
      .addIntegerOption((o) =>
        o.setName('importance').setDescription('How historic?').setMinValue(1).setMaxValue(10),
      ),
  )
  .addSubcommand((s) => s.setName('random').setDescription('Unearth a random incident'))
  .addSubcommand((s) =>
    s
      .setName('search')
      .setDescription('Search the archives')
      .addStringOption((o) =>
        o.setName('query').setDescription('Name, phrase, or tag').setRequired(true),
      ),
  )
  .addSubcommand((s) => s.setName('top').setDescription('The most sacred texts'));

const quote = new SlashCommandBuilder()
  .setName('quote')
  .setDescription('Archive legendary dialogue')
  .addSubcommand((s) =>
    s
      .setName('add')
      .setDescription('Archive a quote')
      .addUserOption((o) => o.setName('user').setDescription('Who said it').setRequired(true))
      .addStringOption((o) =>
        o
          .setName('text')
          .setDescription('Their immortal words')
          .setRequired(true)
          .setMaxLength(500),
      ),
  )
  .addSubcommand((s) => s.setName('random').setDescription('Summon a random quote'))
  .addSubcommand((s) =>
    s
      .setName('user')
      .setDescription('Quote a specific person')
      .addUserOption((o) =>
        o.setName('member').setDescription('The alleged speaker').setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('search')
      .setDescription('Search legendary nonsense')
      .addStringOption((o) => o.setName('query').setDescription('Words to find').setRequired(true)),
  );

const tldr = new SlashCommandBuilder()
  .setName('tldr')
  .setDescription('Summarize recent server chaos')
  .addStringOption((o) =>
    o
      .setName('amount')
      .setDescription('How far back?')
      .addChoices(
        { name: '20 messages', value: '20' },
        { name: '50 messages', value: '50' },
        { name: '100 messages', value: '100' },
        { name: 'today', value: 'today' },
      ),
  );
const recap = new SlashCommandBuilder()
  .setName('recap')
  .setDescription('Catch up on a period')
  .addStringOption((o) =>
    o
      .setName('period')
      .setDescription('Period')
      .setRequired(true)
      .addChoices(
        { name: 'today', value: 'today' },
        { name: 'week', value: 'week' },
        { name: 'month', value: 'month' },
      ),
  );

const simpleCommands = [
  new SlashCommandBuilder().setName('randomquote').setDescription('Summon a random quote'),
  new SlashCommandBuilder()
    .setName('catchup')
    .setDescription('What changed since your last catchup?'),
  new SlashCommandBuilder()
    .setName('whatdidimiss')
    .setDescription('Alias for catchup, for the dramatically absent'),
  recap,
  tldr,
  new SlashCommandBuilder().setName('trending').setDescription('See the current server heat map'),
  new SlashCommandBuilder()
    .setName('npcjournal')
    .setDescription('NPC writes a diary entry about recent server events'),
  new SlashCommandBuilder()
    .setName('reputation')
    .setDescription('Inspect a community reputation')
    .addUserOption((o) => o.setName('user').setDescription('Member')),
  new SlashCommandBuilder()
    .setName('whois')
    .setDescription('Consult NPC records')
    .addUserOption((o) => o.setName('user').setDescription('Member').setRequired(true)),
  new SlashCommandBuilder()
    .setName('server-legends')
    .setDescription("See today's suspiciously scientific rankings"),
  new SlashCommandBuilder()
    .setName('friends')
    .setDescription('Find your statistically closest allies')
    .addUserOption((o) => o.setName('user').setDescription('Member')),
  new SlashCommandBuilder()
    .setName('rivals')
    .setDescription('Find your destined opposition')
    .addUserOption((o) => o.setName('user').setDescription('Member')),
  new SlashCommandBuilder()
    .setName('besties')
    .setDescription('Measure mutual suffering')
    .addUserOption((o) => o.setName('user').setDescription('First member').setRequired(true))
    .addUserOption((o) => o.setName('other').setDescription('Second member').setRequired(true)),
  new SlashCommandBuilder()
    .setName('game-profile')
    .setDescription('Inspect a gaming profile')
    .addUserOption((o) => o.setName('user').setDescription('Member')),
  new SlashCommandBuilder().setName('game-stats').setDescription('See the server gaming census'),
  new SlashCommandBuilder()
    .setName('party')
    .setDescription('Find fellow sufferers')
    .addStringOption((o) =>
      o.setName('game').setDescription('Game').setRequired(true).setAutocomplete(true),
    ),
  new SlashCommandBuilder()
    .setName('vcstats')
    .setDescription('Inspect voice-channel habits')
    .addUserOption((o) => o.setName('user').setDescription('Member')),
  new SlashCommandBuilder().setName('voice-legends').setDescription('Rank the voice goblins'),
  new SlashCommandBuilder().setName('ancient-lore').setDescription('Unearth something old'),
  new SlashCommandBuilder().setName('onthisday').setDescription('Consult today in server history'),
  new SlashCommandBuilder()
    .setName('patchnotes')
    .setDescription('Read deeply legitimate balance changes'),
  new SlashCommandBuilder().setName('quest').setDescription("See today's community quest"),
  new SlashCommandBuilder()
    .setName('achievements')
    .setDescription('Inspect unlocked achievements')
    .addUserOption((o) => o.setName('user').setDescription('Member')),
  new SlashCommandBuilder()
    .setName('analyze')
    .setDescription('Submit a clip or meme to the council')
    .addAttachmentOption((o) =>
      o.setName('file').setDescription('Clip, image, or meme').setRequired(true),
    ),
  new SlashCommandBuilder()
    .setName('npc-duel')
    .setDescription('NPC judges a debate between two users')
    .addUserOption((o) => o.setName('user').setDescription('First debater').setRequired(true))
    .addUserOption((o) => o.setName('other').setDescription('Second debater').setRequired(true)),
  new SlashCommandBuilder().setName('lore-recap').setDescription('Previously on this server...'),
  new SlashCommandBuilder().setName('server-mood').setDescription('Read the current server mood'),
  new SlashCommandBuilder()
    .setName('fortune')
    .setDescription('Generate an evidence-based prediction')
    .addUserOption((o) => o.setName('user').setDescription('Whose fate?')),
  new SlashCommandBuilder()
    .setName('quote-battle')
    .setDescription('Put two archived quotes head-to-head'),
  new SlashCommandBuilder()
    .setName('npc-memory')
    .setDescription('Ask what NPC remembers about someone')
    .addUserOption((o) => o.setName('user').setDescription('Member')),
  new SlashCommandBuilder()
    .setName('case-file')
    .setDescription('Create a funny evidence-based investigation')
    .addUserOption((o) => o.setName('user').setDescription('Suspect')),
  new SlashCommandBuilder().setName('awards').setDescription('Show opt-in server awards'),
  new SlashCommandBuilder()
    .setName('relationship')
    .setDescription("Inspect two users' interaction history")
    .addUserOption((o) => o.setName('user').setDescription('First member').setRequired(true))
    .addUserOption((o) => o.setName('other').setDescription('Second member').setRequired(true)),
  new SlashCommandBuilder()
    .setName('pull')
    .setDescription('Owner: pull and build the latest bot code'),
  new SlashCommandBuilder().setName('restart').setDescription('Owner: restart NPC on the server'),
  new SlashCommandBuilder()
    .setName('stop')
    .setDescription('Owner: pause NPC replies while keeping it online'),
  new SlashCommandBuilder().setName('start').setDescription('Owner: resume NPC replies'),
  new SlashCommandBuilder()
    .setName('clear-user')
    .setDescription('Owner: delete all NPC records for one user')
    .addUserOption((o) => o.setName('user').setDescription('User to erase').setRequired(true))
    .addStringOption((o) =>
      o.setName('confirm').setDescription('Type DELETE_USER').setRequired(true),
    ),
  new SlashCommandBuilder()
    .setName('clear-all')
    .setDescription('Owner: wipe all NPC records and start fresh')
    .addStringOption((o) =>
      o.setName('confirm').setDescription('Type DELETE_ALL').setRequired(true),
    ),
  new SlashCommandBuilder()
    .setName('online')
    .setDescription('See who is online and what they are doing'),
  new SlashCommandBuilder()
    .setName('activity')
    .setDescription("Inspect a member's live and recent activity")
    .addUserOption((o) => o.setName('user').setDescription('Member')),
  new SlashCommandBuilder()
    .setName('activity-stats')
    .setDescription('See server-wide game, music, and activity statistics'),
  new SlashCommandBuilder()
    .setName('status')
    .setDescription('Check whether NPC is healthy and online'),
  new SlashCommandBuilder()
    .setName('info')
    .setDescription('Show NPC hosting, AI, database, and server information'),
  new SlashCommandBuilder()
    .setName('npc-thread')
    .setDescription('Create an NPC discussion thread for selected members')
    .addStringOption((o) =>
      o
        .setName('topic')
        .setDescription('What the thread is about')
        .setRequired(true)
        .setMaxLength(80),
    )
    .addUserOption((o) => o.setName('user').setDescription('Invite a member'))
    .addUserOption((o) => o.setName('other').setDescription('Invite another member')),
  new SlashCommandBuilder()
    .setName('stats')
    .setDescription('Browse your server statistics by period and category')
    .addStringOption((o) =>
      o
        .setName('period')
        .setDescription('Time range')
        .addChoices(
          { name: 'This week', value: 'week' },
          { name: 'This month', value: 'month' },
          { name: 'All time', value: 'all' },
        ),
    )
    .addStringOption((o) =>
      o
        .setName('category')
        .setDescription('What to inspect')
        .addChoices(
          { name: 'Everything', value: 'all' },
          { name: 'Messages', value: 'messages' },
          { name: 'Games', value: 'games' },
          { name: 'Music', value: 'music' },
          { name: 'Voice', value: 'voice' },
        ),
    ),
  new SlashCommandBuilder()
    .setName('preferences')
    .setDescription('Customize how NPC replies to you')
    .addSubcommand((s) =>
      s
        .setName('set')
        .setDescription('Change one preference')
        .addStringOption((o) =>
          o
            .setName('setting')
            .setDescription('Preference')
            .setRequired(true)
            .addChoices(
              { name: 'length', value: 'length' },
              { name: 'format', value: 'format' },
              { name: 'humor', value: 'humor' },
              { name: 'roast', value: 'roast' },
              { name: 'emojis', value: 'emojis' },
              { name: 'language', value: 'language' },
              { name: 'tracking', value: 'tracking' },
            ),
        )
        .addStringOption((o) => o.setName('value').setDescription('Value').setRequired(true)),
    )
    .addSubcommand((s) => s.setName('view').setDescription('View your current preferences'))
    .addSubcommand((s) => s.setName('reset').setDescription('Restore all default preferences')),
  new SlashCommandBuilder()
    .setName('privacy')
    .setDescription('See or change NPC tracking for you')
    .addStringOption((o) =>
      o
        .setName('tracking')
        .setDescription('Whether NPC archives your new activity')
        .addChoices({ name: 'On', value: 'on' }, { name: 'Off', value: 'off' }),
    ),
];

export const commandData = [lore, quote, ...simpleCommands];

const bullet = '-';
const bar = (value: number) =>
  `${'#'.repeat(Math.round(value / 10))}${'.'.repeat(10 - Math.round(value / 10))} ${value}%`;
const nameOf = (guildId: string, id: string) =>
  (db.prepare('SELECT display_name FROM users WHERE guild_id=? AND id=?').get(guildId, id) as any)
    ?.display_name ?? `<@${id}>`;
const relationship = (guildId: string, a: string, b: string) => {
  const [x, y] = [a, b].sort();
  return db
    .prepare('SELECT * FROM relationships WHERE guild_id=? AND user_a=? AND user_b=?')
    .get(guildId, x, y) as any;
};
function ensureUser(guildId: string, user: User) {
  const time = now();
  db.prepare(
    `INSERT INTO users(id,guild_id,username,display_name,message_count,first_seen,last_seen) VALUES(?,?,?,?,0,?,?)
  ON CONFLICT(id) DO UPDATE SET username=excluded.username,display_name=excluded.display_name`,
  ).run(user.id, guildId, user.username, user.displayName, time, time);
}

export async function executeCommand(i: ChatInputCommandInteraction) {
  if (!i.guildId)
    return void (await i.reply({
      content: 'server records only. the void has no lore.',
      flags: MessageFlags.Ephemeral,
    }));
  const guild = i.guildId;
  ensureUser(guild, i.user);
  const firstUser =
    i.options.getUser('user') ?? i.options.getUser('member') ?? i.options.getUser('other');
  if (firstUser) ensureUser(guild, firstUser);
  if (i.commandName === 'lore') return loreCommand(i, guild);
  if (i.commandName === 'quote') return quoteCommand(i, guild);
  if (i.commandName === 'randomquote') return void (await i.reply(randomQuote(guild)));
  const target = i.options.getUser('user') ?? i.user;
  switch (i.commandName) {
    case 'tldr':
      return summarizeCommand(i, guild);
    case 'catchup':
    case 'whatdidimiss':
      return catchup(i, guild);
    case 'recap':
      return recapCommand(i, guild, i.options.getString('period', true));
    case 'trending':
      return void (await i.reply(trending(guild)));
    case 'npcjournal':
      return journal(i, guild);
    case 'reputation':
      return void (await i.reply(reputation(guild, target)));
    case 'whois':
      return void (await i.reply(profile(guild, target)));
    case 'server-legends':
      return void (await i.reply(legendBoard(guild)));
    case 'friends':
      return void (await i.reply(relationList(guild, target.id, false)));
    case 'rivals':
      return void (await i.reply(relationList(guild, target.id, true)));
    case 'besties': {
      const a = i.options.getUser('user', true),
        b = i.options.getUser('other', true);
      ensureUser(guild, a);
      ensureUser(guild, b);
      const r = relationship(guild, a.id, b.id);
      const score = Math.min(
        99,
        20 +
          (r?.mentions ?? 0) * 2 +
          (r?.replies ?? 0) * 3 +
          (r?.messages_together ?? 0) +
          Math.floor((r?.voice_seconds ?? 0) / 1800) +
          (r?.gaming_together ?? 0) * 5,
      );
      return void (await i.reply(
        `**${a.displayName} + ${b.displayName}**\nFriendship Rating: ${bar(score)}\nMentions: ${r?.mentions ?? 0}\nReplies: ${r?.replies ?? 0}\nShared VC: ${Math.round((r?.voice_seconds ?? 0) / 60)} min\nMutual Suffering: ${score > 70 ? 'High' : score > 40 ? 'Developing nicely' : 'Needs more queueing'}`,
      ));
    }
    case 'game-profile':
      return void (await i.reply(gameProfile(guild, target.id)));
    case 'game-stats':
      return void (await i.reply(gameStats(guild)));
    case 'party':
      return party(i, guild);
    case 'vcstats':
      return void (await i.reply(vcStats(guild, target.id)));
    case 'voice-legends':
      return void (await i.reply(voiceLegends(guild)));
    case 'ancient-lore':
      return void (await i.reply(randomLore(guild, 'ORDER BY created_at ASC')));
    case 'onthisday':
      return void (await i.reply(onThisDay(guild)));
    case 'patchnotes':
      return void (await i.reply(patchNotes(guild)));
    case 'quest':
      return void (await i.reply(todayQuest(guild)));
    case 'achievements':
      return void (await i.reply(achievementList(guild, target.id)));
    case 'analyze':
      return analyze(i);
    case 'npc-duel':
      return npcDuel(i, guild);
    case 'lore-recap':
      return loreRecap(i, guild);
    case 'server-mood':
      return void (await i.reply(serverMood(guild)));
    case 'fortune':
      return void (await i.reply(fortune(guild, target)));
    case 'quote-battle':
      return void (await i.reply(quoteBattle(guild)));
    case 'npc-memory':
      return void (await i.reply(memoryCard(guild, target)));
    case 'case-file':
      return void (await i.reply(caseFile(guild, target)));
    case 'awards':
      return void (await i.reply(legendBoard(guild)));
    case 'relationship': {
      const a = i.options.getUser('user', true),
        b = i.options.getUser('other', true);
      ensureUser(guild, a);
      ensureUser(guild, b);
      return void (await i.reply(relationshipCard(guild, a, b)));
    }
    case 'pull':
      return deployCommand(i, 'pull');
    case 'restart':
      return deployCommand(i, 'restart');
    case 'stop':
      return toggleNpc(i, guild, true);
    case 'start':
      return toggleNpc(i, guild, false);
    case 'clear-user':
      return clearUserData(i, guild);
    case 'clear-all':
      return clearAllData(i);
    case 'online':
      return void (await i.reply(onlineActivity(guild)));
    case 'activity':
      return void (await i.reply(activityCard(guild, target)));
    case 'activity-stats':
      return void (await i.reply(activityStats(guild)));
    case 'status':
      return void (await i.reply(statusCard(guild)));
    case 'info':
      return void (await i.reply(infoCard(guild)));
    case 'npc-thread':
      return createNpcThread(i);
    case 'stats':
      return statsCommand(i, guild);
    case 'preferences':
      return preferencesCommand(i, guild);
    case 'privacy':
      return privacyCommand(i, guild);
  }
}

async function loreCommand(i: ChatInputCommandInteraction, guild: string) {
  const sub = i.options.getSubcommand();
  if (sub === 'add') {
    const story = i.options.getString('story', true);
    const tags = (i.options.getString('tags') ?? '')
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    const involved = [...story.matchAll(/<@!?(\d+)>/g)].map((m) => m[1]);
    db.prepare(
      'INSERT INTO lore(guild_id,author_id,content,users_involved,tags,importance,created_at) VALUES(?,?,?,?,?,?,?)',
    ).run(
      guild,
      i.user.id,
      story,
      JSON.stringify(involved),
      JSON.stringify(tags),
      i.options.getInteger('importance') ?? 5,
      now(),
    );
    addMemory(
      guild,
      null,
      `According to the archives: ${story}`,
      'lore',
      i.options.getInteger('importance') ?? 5,
    );
    return void (await i.reply('archived. future generations will judge everyone involved.'));
  }
  if (sub === 'random') return void (await i.reply(randomLore(guild, 'ORDER BY RANDOM()')));
  if (sub === 'top')
    return void (await i.reply(loreList(guild, 'ORDER BY score DESC, importance DESC LIMIT 8')));
  const q = `%${i.options.getString('query', true)}%`;
  const rows = db
    .prepare(
      'SELECT * FROM lore WHERE guild_id=? AND (content LIKE ? OR tags LIKE ?) ORDER BY importance DESC LIMIT 8',
    )
    .all(guild, q, q) as any[];
  return void (await i.reply(
    rows.length
      ? `**Archive Search**\n${rows.map((r) => `#${r.id} - ${r.content}`).join('\n')}`
      : 'the archives deny everything.',
  ));
}

async function quoteCommand(i: ChatInputCommandInteraction, guild: string) {
  const sub = i.options.getSubcommand();
  if (sub === 'add') {
    const user = i.options.getUser('user', true);
    ensureUser(guild, user);
    const content = i.options.getString('text', true);
    db.prepare(
      'INSERT INTO quotes(guild_id,quoted_user_id,added_by_id,content,created_at) VALUES(?,?,?,?,?)',
    ).run(guild, user.id, i.user.id, content, now());
    addMemory(guild, user.id, `said "${content}"`, 'quote', 7);
    return void (await i.reply(`"${content}"\n- **${user.displayName}**, archived forever`));
  }
  if (sub === 'search') {
    const q = `%${i.options.getString('query', true)}%`;
    const rows = db
      .prepare(
        'SELECT * FROM quotes WHERE guild_id=? AND content LIKE ? ORDER BY score DESC,created_at DESC LIMIT 8',
      )
      .all(guild, q) as any[];
    return void (await i.reply(
      rows.length
        ? `**Quote Search**\n${rows.map((r) => `"${r.content}" - ${nameOf(guild, r.quoted_user_id)}`).join('\n')}`
        : 'the quote vault produced nothing but dust.',
    ));
  }
  const user = sub === 'user' ? i.options.getUser('member', true) : null;
  return void (await i.reply(randomQuote(guild, user?.id)));
}

function randomQuote(guild: string, userId?: string) {
  const row = db
    .prepare(
      `SELECT * FROM quotes WHERE guild_id=? ${userId ? 'AND quoted_user_id=?' : ''} ORDER BY RANDOM() LIMIT 1`,
    )
    .get(guild, ...(userId ? [userId] : [])) as any;
  return row
    ? `"${row.content}"\n- **${nameOf(guild, row.quoted_user_id)}**`
    : 'the quote vault contains only dust and disappointment.';
}
function randomLore(guild: string, order: string) {
  const r = db.prepare(`SELECT * FROM lore WHERE guild_id=? ${order} LIMIT 1`).get(guild) as any;
  return r
    ? `**According to archive #${r.id}:**\n${r.content}`
    : 'the archives are suspiciously empty.';
}
function loreList(guild: string, order: string) {
  const rows = db.prepare(`SELECT * FROM lore WHERE guild_id=? ${order}`).all(guild) as any[];
  return rows.length
    ? `**Top Lore**\n${rows.map((r, n) => `${n + 1}. ${r.content}`).join('\n')}`
    : 'the archives are suspiciously empty.';
}
function reputation(guild: string, target: User) {
  const r = db
    .prepare('SELECT * FROM reputation WHERE guild_id=? AND user_id=?')
    .get(guild, target.id) as any;
  const total =
    (r?.positive ?? 0) * 3 + (r?.funny ?? 0) * 2 + (r?.activity ?? 0) + (r?.memorable ?? 0) * 4;
  return `**${target.displayName}'s Community Rating**\n${Math.min(10, 4 + Math.log10(total + 1) * 2).toFixed(1)}/10\nActivity: ${r?.activity ?? 0} | Funny crimes: ${r?.funny ?? 0} | Historic incidents: ${r?.memorable ?? 0}`;
}

function profile(guild: string, target: User) {
  const u = db
    .prepare('SELECT * FROM users WHERE guild_id=? AND id=?')
    .get(guild, target.id) as any;
  const mem = db
    .prepare(
      'SELECT content FROM memories WHERE guild_id=? AND user_id=? ORDER BY importance DESC LIMIT 4',
    )
    .all(guild, target.id) as any[];
  const games = db
    .prepare(
      'SELECT game,activity_count FROM games WHERE guild_id=? AND user_id=? ORDER BY activity_count DESC LIMIT 5',
    )
    .all(guild, target.id) as any[];
  const phrases = db
    .prepare(
      'SELECT phrase,count FROM phrases WHERE guild_id=? AND (first_user_id=? OR last_user_id=?) ORDER BY count DESC LIMIT 5',
    )
    .all(guild, target.id, target.id) as any[];
  const vc = db
    .prepare(
      'SELECT COALESCE(SUM(duration_seconds),0) seconds,COUNT(*) sessions FROM voice_activity WHERE guild_id=? AND user_id=?',
    )
    .get(guild, target.id) as any;
  const quoteCount = (
    db
      .prepare('SELECT COUNT(*) n FROM quotes WHERE guild_id=? AND quoted_user_id=?')
      .get(guild, target.id) as any
  ).n;
  const favoriteChannel = db
    .prepare(
      'SELECT channel_id,COUNT(*) n FROM messages WHERE guild_id=? AND user_id=? GROUP BY channel_id ORDER BY n DESC LIMIT 1',
    )
    .get(guild, target.id) as any;
  const hour = db
    .prepare(
      "SELECT strftime('%H',created_at) hour,COUNT(*) n FROM messages WHERE guild_id=? AND user_id=? GROUP BY hour ORDER BY n DESC LIMIT 1",
    )
    .get(guild, target.id) as any;
  const achievements = (
    db
      .prepare('SELECT COUNT(*) n FROM achievements WHERE guild_id=? AND user_id=?')
      .get(guild, target.id) as any
  ).n;
  const knownFor = mem.length
    ? mem.map((m) => `${bullet} ${m.content}`).join('\n')
    : favoriteChannel?.channel_id
      ? `${bullet} active in <#${favoriteChannel.channel_id}>`
      : `${bullet} no specific memories archived yet`;
  return `**${target.displayName}**\n\n**Known For:**\n${knownFor}\n\n**Messages Observed:** ${u?.message_count ?? 0}\n**Favorite Habitat:** ${favoriteChannel?.channel_id ? `<#${favoriteChannel.channel_id}> (${favoriteChannel.n} sightings)` : u?.favorite_channel_id ? `<#${u.favorite_channel_id}>` : 'unknown biome'}\n**Favorite Games:** ${games.length ? games.map((g) => g.game).join(', ') : 'not enough evidence'}\n**Common Phrases:** ${phrases.length ? phrases.map((p) => `"${p.phrase}"`).join(', ') : 'no repeated phrase detected'}\n**Active Hour:** ${hour ? `${hour.hour}:00 UTC` : 'unknown'}\n**VC Time:** ${(vc.seconds / 3600).toFixed(1)}h across ${vc.sessions} sessions\n**Quotes Archived:** ${quoteCount}\n**Achievements:** ${achievements}\n**Reputation:** ${Math.min(10, 4 + Math.log10((u?.message_count ?? 0) + quoteCount * 5 + achievements * 10 + 1) * 2).toFixed(1)}/10\n**Threat Level:** ${(u?.message_count ?? 0) > 1000 || vc.seconds > 36000 ? 'Elevated' : 'Moderate'}`;
}

function relationList(guild: string, id: string, rivals: boolean) {
  const rows = db
    .prepare(
      `SELECT * FROM relationships WHERE guild_id=? AND (user_a=? OR user_b=?) ORDER BY ${rivals ? 'rivalry+reactions' : 'mentions+replies+messages_together+voice_seconds/600+gaming_together*3'} DESC LIMIT 5`,
    )
    .all(guild, id, id) as any[];
  return `**${rivals ? 'Destined Opposition' : 'Closest Allies'} of ${nameOf(guild, id)}**\n${rows.length ? rows.map((r, n) => `${n + 1}. ${nameOf(guild, r.user_a === id ? r.user_b : r.user_a)} - ${r.mentions + r.replies + r.messages_together} incidents, ${Math.round(r.voice_seconds / 60)} VC min`).join('\n') : 'insufficient social evidence. go bother someone.'}`;
}
function gameProfile(guild: string, id: string) {
  const rows = db
    .prepare(
      'SELECT * FROM games WHERE guild_id=? AND user_id=? ORDER BY activity_count DESC LIMIT 8',
    )
    .all(guild, id) as any[];
  return `**${nameOf(guild, id)}'s Gaming Record**\n${rows.length ? rows.map((r) => `${bullet} ${r.game}: spotted ${r.activity_count} times`).join('\n') : 'no games detected. stealth gamer or grass toucher?'}`;
}
function gameStats(guild: string) {
  const rows = db
    .prepare(
      'SELECT game,SUM(activity_count) activity,COUNT(*) players FROM games WHERE guild_id=? GROUP BY game ORDER BY activity DESC LIMIT 10',
    )
    .all(guild) as any[];
  return `**Server Gaming Census**\n${rows.length ? rows.map((r, n) => `${n + 1}. ${r.game} - ${r.players} players, ${r.activity} sightings`).join('\n') : 'everyone has activity hidden. cowards.'}`;
}
async function party(i: ChatInputCommandInteraction, guild: string) {
  const game = i.options.getString('game', true);
  const rows = db
    .prepare(
      'SELECT user_id FROM games WHERE guild_id=? AND lower(game) LIKE lower(?) ORDER BY activity_count DESC LIMIT 10',
    )
    .all(guild, `%${game}%`) as any[];
  await i.reply(
    rows.length
      ? `**Party call: ${game}**\n${rows.map((r) => `<@${r.user_id}>`).join(' ')}\nassemble, make questionable decisions.`
      : `no known ${game} victims. pioneer the suffering yourself.`,
  );
}
function vcStats(guild: string, id: string) {
  const r = db
    .prepare(
      'SELECT COUNT(*) sessions,COALESCE(SUM(duration_seconds),0) seconds,MAX(duration_seconds) longest FROM voice_activity WHERE guild_id=? AND user_id=?',
    )
    .get(guild, id) as any;
  return `**${nameOf(guild, id)}'s VC Record**\nSessions: ${r.sessions}\nTotal: ${(r.seconds / 3600).toFixed(1)} hours\nLongest: ${Math.round((r.longest ?? 0) / 60)} minutes`;
}
function voiceLegends(guild: string) {
  const rows = db
    .prepare(
      'SELECT user_id,SUM(duration_seconds) seconds FROM voice_activity WHERE guild_id=? GROUP BY user_id ORDER BY seconds DESC LIMIT 10',
    )
    .all(guild) as any[];
  return `**Voice Goblin Rankings**\n${rows.length ? rows.map((r, n) => `${n + 1}. ${nameOf(guild, r.user_id)} - ${(r.seconds / 3600).toFixed(1)}h`).join('\n') : 'the voice channels remain mercifully undocumented.'}`;
}
function onThisDay(guild: string) {
  const md = new Date().toISOString().slice(5, 10);
  const r = db
    .prepare(
      'SELECT * FROM lore WHERE guild_id=? AND substr(created_at,6,5)=? ORDER BY created_at ASC LIMIT 1',
    )
    .get(guild, md) as any;
  return r
    ? `**On this day, ${r.created_at.slice(0, 4)}:**\n${r.content}\n\nthe prophecy remains relevant.`
    : 'nothing recorded on this day. suspicious.';
}
function patchNotes(guild: string) {
  const users = db
    .prepare('SELECT display_name FROM users WHERE guild_id=? ORDER BY RANDOM() LIMIT 4')
    .all(guild) as any[];
  const stats = ['confidence', 'sarcasm', 'sleep schedule', 'queue discipline'];
  return `**NPC Patch ${new Date().getMonth() + 1}.${new Date().getDate()}**\n${users.map((u, n) => `${bullet} ${u.display_name} ${stats[n % stats.length]} ${n % 2 ? 'increased' : 'reduced'} by ${7 + n * 6}%.`).join('\n') || `${bullet} Player balance unchanged due to lack of evidence.`}\n${bullet} Ranked suffering remains working as intended.`;
}
function todayQuest(guild: string) {
  const date = new Date().toLocaleDateString('en-CA');
  let q = db.prepare('SELECT * FROM quests WHERE guild_id=? AND date=?').get(guild, date) as any;
  if (!q) {
    const pool = [
      ['Cross-Party Play', 'Play something with a person you rarely queue with.'],
      ['Clip Tax', 'Share one clip worthy of public judgment.'],
      ['The Summoning', 'Get three people into VC at once.'],
      ['Local Comedian', 'Make the chat laugh without using a stolen meme.'],
    ];
    const selected = pool[Math.floor(Math.random() * pool.length)]!;
    db.prepare(
      'INSERT OR IGNORE INTO quests(guild_id,date,title,description,reward) VALUES(?,?,?,?,?)',
    ).run(guild, date, selected[0], selected[1], 'dubious honor + 50 imaginary XP');
    q = { title: selected[0], description: selected[1], reward: 'dubious honor + 50 imaginary XP' };
  }
  return `**Daily Quest: ${q.title}**\n${q.description}\n\nReward: ${q.reward}`;
}
function achievementList(guild: string, id: string) {
  const rows = db
    .prepare(
      'SELECT * FROM achievements WHERE guild_id=? AND user_id=? ORDER BY unlocked_at DESC LIMIT 15',
    )
    .all(guild, id) as any[];
  return `**${nameOf(guild, id)}'s Achievements**\n${rows.length ? rows.map((r) => `${bullet} **${r.name}** - ${r.description}`).join('\n') : 'nothing unlocked yet. the character arc begins now.'}`;
}
function legendBoard(guild: string) {
  const active = db
    .prepare(
      'SELECT display_name,message_count,id FROM users WHERE guild_id=? ORDER BY message_count DESC LIMIT 5',
    )
    .all(guild) as any[];
  const night = db
    .prepare(
      "SELECT u.display_name,COUNT(*) n FROM messages m JOIN users u ON u.id=m.user_id WHERE m.guild_id=? AND CAST(strftime('%H',m.created_at) AS INTEGER) BETWEEN 0 AND 5 GROUP BY m.user_id ORDER BY n DESC LIMIT 1",
    )
    .get(guild) as any;
  const loreMaster = db
    .prepare(
      'SELECT u.display_name,COUNT(*) n FROM lore l JOIN users u ON u.id=l.author_id WHERE l.guild_id=? GROUP BY author_id ORDER BY n DESC LIMIT 1',
    )
    .get(guild) as any;
  const hunter = db
    .prepare(
      'SELECT u.display_name,COUNT(*) n FROM achievements a JOIN users u ON u.id=a.user_id WHERE a.guild_id=? GROUP BY user_id ORDER BY n DESC LIMIT 1',
    )
    .get(guild) as any;
  return `**Server Legends**\n${active.map((u, n) => `${['Serial Yapper', 'Most Active', 'Most Chaotic', 'Lore Suspect', 'Touch Grass Contender'][n]} - **${u.display_name}**`).join('\n') || 'No legends yet. only mysterious silhouettes.'}${night ? `\nNight Owl - **${night.display_name}**` : ''}${loreMaster ? `\nLore Master - **${loreMaster.display_name}**` : ''}${hunter ? `\nAchievement Hunter - **${hunter.display_name}**` : ''}`;
}
async function analyze(i: ChatInputCommandInteraction) {
  const file = i.options.getAttachment('file', true);
  const seed = [...file.name].reduce((a, c) => a + c.charCodeAt(0), file.size) % 101;
  const image = file.contentType?.startsWith('image');
  await i.reply(
    image
      ? `**Meme Tribunal**\nMeme Rating: ${seed}/100\nBrain Damage Score: ${Math.min(100, seed + 17)}%\nBoomer Compatibility: ${100 - seed}%\nDiscord Worthiness: ${seed > 55 ? 'Certified' : 'Questionable'}`
      : `**Clip Review**\nSkill: ${seed}%\nLuck: ${100 - seed}%\nEnemy Team Mental Damage: ${seed > 65 ? 'Critical' : 'Recoverable'}\nVerdict: ${seed > 70 ? 'calculated, allegedly' : 'the replay department has concerns'}`,
  );
}

function messagesSince(guild: string, since: string, limit = 120) {
  return db
    .prepare(
      `SELECT m.content,m.user_id,m.reply_to_user_id,u.display_name,ru.display_name reply_to_display_name
      FROM messages m
      LEFT JOIN users u ON u.id=m.user_id AND u.guild_id=m.guild_id
      LEFT JOIN users ru ON ru.id=m.reply_to_user_id AND ru.guild_id=m.guild_id
      WHERE m.guild_id=? AND m.created_at>? ORDER BY m.created_at DESC LIMIT ?`,
    )
    .all(guild, since, limit)
    .reverse() as any[];
}
async function summarizeCommand(i: ChatInputCommandInteraction, guild: string) {
  await i.deferReply();
  const amount = i.options.getString('amount') ?? '50';
  const since =
    amount === 'today'
      ? new Date(new Date().setHours(0, 0, 0, 0)).toISOString()
      : '1970-01-01T00:00:00.000Z';
  const limit = amount === 'today' ? 150 : Number(amount);
  const rows =
    amount === 'today'
      ? messagesSince(guild, since, limit)
      : (db
          .prepare(
            `SELECT m.content,m.user_id,m.reply_to_user_id,u.display_name,ru.display_name reply_to_display_name
            FROM messages m
            LEFT JOIN users u ON u.id=m.user_id AND u.guild_id=m.guild_id
            LEFT JOIN users ru ON ru.id=m.reply_to_user_id AND ru.guild_id=m.guild_id
            WHERE m.guild_id=? AND m.channel_id=? ORDER BY m.created_at DESC LIMIT ?`,
          )
          .all(guild, i.channelId, limit)
          .reverse() as any[]);
  if (!rows.length) return void (await i.editReply('nothing to summarize. the void is concise.'));
  const social = summarizeInteractions(guild, rows);
  const text = rows
    .map((r) => {
      const reply = r.reply_to_display_name ? ` replying to ${r.reply_to_display_name}` : '';
      return `${r.display_name ?? `<@${r.user_id}>`}${reply}: ${humanizeMentions(guild, r.content)}`;
    })
    .join('\n')
    .slice(-9000);
  const out = await complete([
    {
      role: 'system',
      content:
        'Summarize only the supplied Discord transcript. Be concise, witty, and factual. Include sections: Main Topic, Summary, Key Participants, Important Decisions, Funniest Moment, Server Mood. Treat @names and reply labels as real social interactions. Mention who talked to, replied to, or called out whom when relevant. Do not invent events, motives, names, quotes, decisions, or “placeholder” activity. If something is unclear, say it is unclear. NPC lines are part of the transcript, not proof that an event happened outside it.',
    },
    { role: 'user', content: `${social}\n\nChat transcript:\n${text}` },
  ]);
  await i.editReply(out);
}
async function catchup(i: ChatInputCommandInteraction, guild: string) {
  const state = db
    .prepare('SELECT last_catchup_at FROM user_state WHERE guild_id=? AND user_id=?')
    .get(guild, i.user.id) as any;
  const since = state?.last_catchup_at ?? new Date(Date.now() - 24 * 3600_000).toISOString();
  db.prepare(
    `INSERT INTO user_state(guild_id,user_id,last_catchup_at) VALUES(?,?,?) ON CONFLICT(guild_id,user_id) DO UPDATE SET last_catchup_at=excluded.last_catchup_at`,
  ).run(guild, i.user.id, now());
  await recapFromSince(i, guild, since, 'While you were gone');
}
async function recapCommand(i: ChatInputCommandInteraction, guild: string, period: string) {
  const days = period === 'month' ? 30 : period === 'week' ? 7 : 1;
  await recapFromSince(
    i,
    guild,
    new Date(Date.now() - days * 86400_000).toISOString(),
    `Recap: ${period}`,
  );
}
async function recapFromSince(
  i: ChatInputCommandInteraction,
  guild: string,
  since: string,
  title: string,
) {
  const lore = (
    db
      .prepare('SELECT COUNT(*) n FROM lore WHERE guild_id=? AND created_at>?')
      .get(guild, since) as any
  ).n;
  const achievements = (
    db
      .prepare('SELECT COUNT(*) n FROM achievements WHERE guild_id=? AND unlocked_at>?')
      .get(guild, since) as any
  ).n;
  const quotes = (
    db
      .prepare('SELECT COUNT(*) n FROM quotes WHERE guild_id=? AND created_at>?')
      .get(guild, since) as any
  ).n;
  const active = db
    .prepare(
      'SELECT u.display_name,COUNT(*) n FROM messages m JOIN users u ON u.id=m.user_id WHERE m.guild_id=? AND m.created_at>? GROUP BY m.user_id ORDER BY n DESC LIMIT 3',
    )
    .all(guild, since) as any[];
  await i.reply(
    `**${title}**\n${bullet} ${lore} lore events occurred\n${bullet} ${achievements} achievements were earned\n${bullet} ${quotes} quotes were archived\n${active.length ? `${bullet} Top yappers: ${active.map((a) => `${a.display_name} (${a.n})`).join(', ')}` : `${bullet} Chat activity was suspiciously quiet`}\n${bullet} Nobody has been cleared of wrongdoing.`,
  );
}
function trending(guild: string) {
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const games = db
    .prepare(
      'SELECT game,SUM(activity_count) n FROM games WHERE guild_id=? GROUP BY game ORDER BY n DESC LIMIT 5',
    )
    .all(guild) as any[];
  const phrases = db
    .prepare(
      'SELECT phrase,count FROM phrases WHERE guild_id=? AND last_seen>? AND length(phrase)>5 ORDER BY count DESC LIMIT 8',
    )
    .all(guild, since) as any[];
  const users = db
    .prepare(
      'SELECT u.display_name,COUNT(*) n FROM messages m JOIN users u ON u.id=m.user_id WHERE m.guild_id=? AND m.created_at>? GROUP BY m.user_id ORDER BY n DESC LIMIT 5',
    )
    .all(guild, since) as any[];
  return `**Trending Right Now**\n**Games:** ${games.length ? games.map((g) => `${g.game} (${g.n})`).join(', ') : 'no game telemetry'}\n**Topics/Phrases:** ${phrases.length ? phrases.map((p) => `"${p.phrase}"`).join(', ') : 'the bit economy is slow'}\n**Active Users:** ${users.length ? users.map((u) => `${u.display_name} (${u.n})`).join(', ') : 'no witnesses'}\n**Hottest Conversation:** probably whatever everyone will deny later.`;
}
async function journal(i: ChatInputCommandInteraction, guild: string) {
  await i.deferReply();
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const rows = messagesSince(guild, since, 80);
  const lore = db
    .prepare(
      'SELECT content FROM lore WHERE guild_id=? AND created_at>? ORDER BY importance DESC LIMIT 5',
    )
    .all(guild, since) as any[];
  const prompt = `Recent chat:\n${rows
    .map((r) => {
      const reply = r.reply_to_display_name ? ` replying to ${r.reply_to_display_name}` : '';
      return `${r.display_name ?? `<@${r.user_id}>`}${reply}: ${humanizeMentions(guild, r.content)}`;
    })
    .join('\n')
    .slice(-7000)}\nLore:\n${lore.map((l) => l.content).join('\n')}`;
  const entry = await complete([
    {
      role: 'system',
      content:
        'Write a short NPC diary entry as a sleep-deprived witty Discord server resident. Reference real events only. Format starts with Dear Diary,',
    },
    { role: 'user', content: prompt || 'Quiet day.' },
  ]);
  db.prepare(
    'INSERT INTO npc_journal(guild_id,content,period_start,created_at) VALUES(?,?,?,?)',
  ).run(guild, entry, since, now());
  await i.editReply(entry);
}

function humanizeMentions(guild: string, content: string) {
  return content.replace(/<@!?(\d+)>/g, (_match, id: string) => {
    const name = nameOf(guild, id);
    return name.startsWith('<@') ? name : `@${name}`;
  });
}

function summarizeInteractions(guild: string, rows: any[]) {
  const participants = new Map<string, string>();
  const mentions: string[] = [];
  const replies: string[] = [];
  for (const row of rows) {
    const speaker = row.display_name ?? `<@${row.user_id}>`;
    participants.set(row.user_id, speaker);
    for (const match of String(row.content).matchAll(/<@!?(\d+)>/g)) {
      const target = nameOf(guild, match[1]!);
      mentions.push(`${speaker} mentioned ${target}`);
      participants.set(match[1]!, target);
    }
    if (row.reply_to_user_id) {
      const target = row.reply_to_display_name ?? nameOf(guild, row.reply_to_user_id);
      replies.push(`${speaker} replied to ${target}`);
      participants.set(row.reply_to_user_id, target);
    }
  }
  const relationshipRows = db
    .prepare(
      `SELECT * FROM relationships WHERE guild_id=?
      ORDER BY mentions+replies+messages_together+reactions+gaming_together+rivalry+voice_seconds/600 DESC LIMIT 6`,
    )
    .all(guild) as any[];
  return [
    `Known participants: ${[...participants.values()].join(', ') || 'none'}`,
    mentions.length ? `Mentions detected: ${mentions.slice(-10).join('; ')}` : '',
    replies.length ? `Replies detected: ${replies.slice(-10).join('; ')}` : '',
    relationshipRows.length
      ? `Existing relationship context: ${relationshipRows
          .map(
            (r) =>
              `${nameOf(guild, r.user_a)} + ${nameOf(guild, r.user_b)}: ${r.mentions} mentions, ${r.replies} replies, ${r.messages_together} nearby chat, ${r.reactions} reactions, ${r.rivalry} rivalry signals`,
          )
          .join('; ')}`
      : '',
  ]
    .filter(Boolean)
    .join('\n');
}

async function npcDuel(i: ChatInputCommandInteraction, _guild: string) {
  const a = i.options.getUser('user', true);
  const b = i.options.getUser('other', true);
  const prompt = `Judge a playful, harmless Discord debate between ${a.displayName} and ${b.displayName}. No real accusation; give each a funny strength, a funny weakness, and a winner.`;
  await i.deferReply();
  await i.editReply(
    await complete([
      {
        role: 'system',
        content: 'You are NPC, a witty but kind server referee. Keep it under 180 words.',
      },
      { role: 'user', content: prompt },
    ]),
  );
}

async function loreRecap(i: ChatInputCommandInteraction, guild: string) {
  await i.deferReply();
  const rows = db
    .prepare('SELECT content FROM lore WHERE guild_id=? ORDER BY created_at DESC LIMIT 8')
    .all(guild) as any[];
  const recent = db
    .prepare('SELECT content FROM messages WHERE guild_id=? ORDER BY created_at DESC LIMIT 30')
    .all(guild) as any[];
  const out = await complete([
    {
      role: 'system',
      content:
        'Write a short Previously On recap using only supplied server records. Be specific and witty.',
    },
    {
      role: 'user',
      content: `Lore:\n${rows.map((r) => r.content).join('\n')}\nRecent incidents:\n${recent.map((r) => r.content).join('\n')}`,
    },
  ]);
  await i.editReply(out);
}

function serverMood(guild: string) {
  const stats = db
    .prepare(
      "SELECT COUNT(*) messages,COUNT(DISTINCT user_id) users FROM messages WHERE guild_id=? AND created_at>datetime('now','-24 hours')",
    )
    .get(guild) as any;
  const reactions = db
    .prepare('SELECT COALESCE(SUM(reactions),0) n FROM relationships WHERE guild_id=?')
    .get(guild) as any;
  const mood =
    stats.messages === 0
      ? 'quiet and suspicious'
      : stats.messages > 200
        ? 'feral and over-caffeinated'
        : stats.users > 5
          ? 'social with a hint of chaos'
          : 'small-group plotting';
  return `**Server Mood**\n${mood}\n\nMessages (24h): ${stats.messages}\nPeople active: ${stats.users}\nReaction signals archived: ${reactions.n}`;
}

function fortune(guild: string, target: User) {
  const u = db
    .prepare('SELECT message_count FROM users WHERE guild_id=? AND id=?')
    .get(guild, target.id) as any;
  const games = db
    .prepare(
      'SELECT game FROM games WHERE guild_id=? AND user_id=? ORDER BY activity_count DESC LIMIT 1',
    )
    .get(guild, target.id) as any;
  const lines = [
    `${target.displayName} will enter a voice channel “for five minutes” and emerge two hours later.`,
    `${target.displayName} will accidentally create the next piece of server lore.`,
    `${target.displayName} will say they are done gaming, then queue one more match.`,
  ];
  const pick = ((u?.message_count ?? 0) + (games ? games.game.length : 0)) % lines.length;
  return `**NPC Fortune for ${target.displayName}**\n${lines[pick]}\n\nEvidence: ${u?.message_count ?? 0} observed messages${games ? `; frequent game: ${games.game}` : ''}.`;
}

function quoteBattle(guild: string) {
  const rows = db
    .prepare(
      'SELECT q.content,u.display_name FROM quotes q LEFT JOIN users u ON u.id=q.quoted_user_id WHERE q.guild_id=? ORDER BY RANDOM() LIMIT 2',
    )
    .all(guild) as any[];
  return rows.length < 2
    ? 'not enough archived quotes for a battle. someone say something memorable.'
    : `**Quote Battle**\n🥊 **${rows[0].display_name}**: “${rows[0].content}”\nvs\n🥊 **${rows[1].display_name}**: “${rows[1].content}”\n\nReact to this message to vote. NPC will declare the winner when the server feels decisive.`;
}

function memoryCard(guild: string, target: User) {
  const rows = db
    .prepare(
      'SELECT content,category FROM memories WHERE guild_id=? AND user_id=? ORDER BY importance DESC LIMIT 8',
    )
    .all(guild, target.id) as any[];
  return `**NPC Memory Card: ${target.displayName}**\n${rows.length ? rows.map((r) => `${bullet} ${r.content} (${r.category})`).join('\n') : `${bullet} no reliable memories archived yet`}\n\nOnly observations from this server are included.`;
}

function caseFile(guild: string, target: User) {
  const u = db
    .prepare('SELECT message_count,last_seen FROM users WHERE guild_id=? AND id=?')
    .get(guild, target.id) as any;
  const quote = db
    .prepare(
      'SELECT content FROM quotes WHERE guild_id=? AND quoted_user_id=? ORDER BY score DESC LIMIT 1',
    )
    .get(guild, target.id) as any;
  const game = db
    .prepare(
      'SELECT game FROM games WHERE guild_id=? AND user_id=? ORDER BY activity_count DESC LIMIT 1',
    )
    .get(guild, target.id) as any;
  return `**CASE FILE: ${target.displayName}**\n**Status:** ${u ? 'under observation' : 'insufficient evidence'}\n**Transmissions:** ${u?.message_count ?? 0}\n**Last seen:** ${u?.last_seen ?? 'never'}\n**Preferred game:** ${game?.game ?? 'unknown'}\n**Most incriminating quote:** ${quote ? `“${quote.content}”` : 'none archived'}\n**Verdict:** ${u?.message_count > 100 ? 'habitual server presence' : 'still a minor suspect'}.`;
}

function relationshipCard(guild: string, a: User, b: User) {
  const r = relationship(guild, a.id, b.id);
  return `**${a.displayName} × ${b.displayName}**\nMentions: ${r?.mentions ?? 0}\nReplies: ${r?.replies ?? 0}\nNearby messages: ${r?.messages_together ?? 0}\nShared VC: ${Math.round((r?.voice_seconds ?? 0) / 60)} minutes\nRivalry signals: ${r?.rivalry ?? 0}\n**NPC verdict:** ${r ? (r.rivalry > r.mentions + r.replies ? 'friendly opposition' : 'conversation with potential') : 'no interaction evidence yet'}.`;
}

function formatDuration(seconds: number) {
  const minutes = Math.max(0, Math.floor(seconds / 60));
  return minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function onlineActivity(guild: string) {
  const rows = db
    .prepare(
      `SELECT p.user_id,u.display_name,p.status,p.activity_name,p.details,p.state,p.started_at,p.duration_seconds
    FROM presence_sessions p LEFT JOIN users u ON u.guild_id=p.guild_id AND u.id=p.user_id
    WHERE p.guild_id=? AND p.ended_at IS NULL AND p.last_seen>? ORDER BY p.status,p.activity_name`,
    )
    .all(guild, new Date(Date.now() - 10 * 60_000).toISOString()) as any[];
  const unique = new Map<string, any>();
  for (const row of rows) unique.set(`${row.user_id}:${row.activity_name}`, row);
  return `**Live Server Activity**\n${[...unique.values()].length ? [...unique.values()].map((r) => `${r.status === 'online' ? '🟢' : r.status === 'idle' ? '🌙' : '⛔'} **${r.display_name ?? nameOf(guild, r.user_id)}** — ${r.activity_name ? `${r.activity_name}${r.details ? ` · ${r.details}` : ''}${r.state ? ` (${r.state})` : ''} · ${formatDuration(r.duration_seconds)}` : 'online, no activity shared'}`).join('\n') : 'Nobody is sharing live activity right now.'}`;
}

function activityCard(guild: string, target: User) {
  const live = db
    .prepare(
      `SELECT * FROM presence_sessions WHERE guild_id=? AND user_id=? AND ended_at IS NULL ORDER BY last_seen DESC`,
    )
    .all(guild, target.id) as any[];
  const recent = db
    .prepare(
      `SELECT activity_name,activity_type,SUM(duration_seconds) seconds,COUNT(*) sessions,MAX(last_seen) last_seen FROM presence_sessions WHERE guild_id=? AND user_id=? GROUP BY activity_name,activity_type ORDER BY seconds DESC LIMIT 8`,
    )
    .all(guild, target.id) as any[];
  const music = db
    .prepare(
      `SELECT music_track,music_artist,MAX(last_seen) last_seen FROM presence_sessions WHERE guild_id=? AND user_id=? AND music_track IS NOT NULL ORDER BY last_seen DESC LIMIT 5`,
    )
    .all(guild, target.id) as any[];
  return `**${target.displayName}'s Activity**\n**Live:** ${live.length ? live.map((r) => `${r.activity_name ?? 'online'} (${formatDuration(r.duration_seconds)})`).join(', ') : 'not currently sharing activity'}\n**History:** ${recent.length ? recent.map((r) => `${r.activity_name ?? 'unknown'} — ${formatDuration(r.seconds)} across ${r.sessions} sessions`).join('\n') : 'no activity recorded yet'}\n**Music:** ${music.length ? music.map((m) => `${m.music_track}${m.music_artist ? ` — ${m.music_artist}` : ''}`).join('\n') : 'no Spotify activity exposed'}`;
}

function activityStats(guild: string) {
  const games = db
    .prepare(
      `SELECT activity_name name,SUM(duration_seconds) seconds,COUNT(DISTINCT user_id) users FROM presence_sessions WHERE guild_id=? AND activity_type=0 GROUP BY activity_name ORDER BY seconds DESC LIMIT 10`,
    )
    .all(guild) as any[];
  const music = db
    .prepare(
      `SELECT music_track track,music_artist artist,COUNT(DISTINCT user_id) listeners FROM presence_sessions WHERE guild_id=? AND music_track IS NOT NULL GROUP BY music_track,music_artist ORDER BY listeners DESC LIMIT 8`,
    )
    .all(guild) as any[];
  const statuses = db
    .prepare(
      `SELECT status,COUNT(DISTINCT user_id) users FROM presence_sessions WHERE guild_id=? AND ended_at IS NULL AND last_seen>? GROUP BY status`,
    )
    .all(guild, new Date(Date.now() - 10 * 60_000).toISOString()) as any[];
  return `**Server Activity Census**\n**Live statuses:** ${statuses.length ? statuses.map((s) => `${s.status}: ${s.users}`).join(' · ') : 'no live presence data'}\n\n**Games/apps by recorded time:** ${games.length ? games.map((g) => `${g.name} — ${formatDuration(g.seconds)} (${g.users} users)`).join('\n') : 'no games recorded'}\n\n**Music currently/recently exposed:** ${music.length ? music.map((m) => `${m.track}${m.artist ? ` — ${m.artist}` : ''} (${m.listeners} listeners)`).join('\n') : 'no music activity recorded'}`;
}

function statusCard(guild: string) {
  const mem = process.memoryUsage();
  const live = db
    .prepare(
      'SELECT COUNT(DISTINCT user_id) users FROM presence_sessions WHERE guild_id=? AND ended_at IS NULL AND last_seen>?',
    )
    .get(guild, new Date(Date.now() - 10 * 60_000).toISOString()) as any;
  return `**NPC Status**\n🟢 Online and responding\nUptime: ${formatDuration(Math.floor(process.uptime()))}\nMemory: ${(mem.rss / 1024 / 1024).toFixed(0)} MB RSS\nGuilds connected: ${process.env.DISCORD_GUILD_ID ? 1 : 'multiple/unknown'}\nLive activity records: ${live.users}`;
}

function infoCard(guild: string) {
  const tables = (
    db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='table'").get() as any
  ).n;
  const providers =
    [
      config.GROQ_API_KEY ? `Groq (${config.GROQ_MODEL})` : '',
      config.OPENROUTER_API_KEY ? `OpenRouter (${config.OPENROUTER_MODEL})` : '',
    ]
      .filter(Boolean)
      .join(' + ') || 'offline fallback';
  return `**NPC Information**\nHost: ${process.platform} / Node ${process.version}\nDatabase: SQLite (${tables} tables)\nAI providers: ${providers}\nConnected guilds: ${process.env.DISCORD_GUILD_ID ? 1 : 'multiple'}\nThis server: ${guild}\nCommands registered in this build: ${commandData.length}`;
}

async function createNpcThread(i: ChatInputCommandInteraction) {
  const channel = i.channel;
  if (!channel?.isTextBased() || !('threads' in channel))
    return void (await i.reply({
      content: 'this channel cannot host an NPC thread.',
      flags: MessageFlags.Ephemeral,
    }));
  const topic = i.options.getString('topic', true);
  const thread = await (channel as TextChannel).threads.create({
    name: `npc-${topic}`.slice(0, 100),
    autoArchiveDuration: 1440,
    reason: `NPC discussion created by ${i.user.tag}`,
  });
  const invites: User[] = [i.user];
  for (const user of [i.options.getUser('user'), i.options.getUser('other')])
    if (user && !invites.some((existing) => existing.id === user.id)) invites.push(user);
  for (const user of invites) await thread.members.add(user.id).catch(() => undefined);
  await thread.send(
    `NPC discussion opened by <@${i.user.id}>. Topic: **${topic}**\nEveryone in this thread can talk normally; I’ll follow the conversation here.`,
  );
  await i.reply({ content: `thread created: <#${thread.id}>`, flags: MessageFlags.Ephemeral });
}

type StatsPeriod = 'week' | 'month' | 'all';
type StatsCategory = 'all' | 'messages' | 'games' | 'music' | 'voice';
function periodBounds(period: StatsPeriod, offset: number) {
  if (period === 'all')
    return {
      start: '1970-01-01T00:00:00.000Z',
      end: new Date(Date.now() + 86400000).toISOString(),
      label: 'All time',
    };
  const end = new Date();
  if (period === 'week') {
    const day = end.getUTCDay() || 7;
    end.setUTCDate(end.getUTCDate() - day + 1 + (offset + 1) * 7);
  } else {
    end.setUTCDate(1);
    end.setUTCMonth(end.getUTCMonth() + offset + 1);
  }
  const start = new Date(end);
  if (period === 'week') start.setUTCDate(start.getUTCDate() - 7);
  else start.setUTCMonth(start.getUTCMonth() - 1);
  return {
    start: start.toISOString(),
    end: end.toISOString(),
    label:
      period === 'week'
        ? `${start.toISOString().slice(0, 10)} → ${new Date(end.getTime() - 1).toISOString().slice(0, 10)}`
        : `${start.toISOString().slice(0, 7)}`,
  };
}

function statsText(
  guild: string,
  userId: string,
  period: StatsPeriod,
  category: StatsCategory,
  offset = 0,
) {
  const bounds = periodBounds(period, offset);
  const messages = (
    db
      .prepare(
        'SELECT COUNT(*) n FROM messages WHERE guild_id=? AND user_id=? AND created_at>=? AND created_at<?',
      )
      .get(guild, userId, bounds.start, bounds.end) as any
  ).n;
  const voice = (
    db
      .prepare(
        'SELECT COALESCE(SUM(duration_seconds),0) seconds FROM voice_activity WHERE guild_id=? AND user_id=? AND joined_at>=? AND joined_at<?',
      )
      .get(guild, userId, bounds.start, bounds.end) as any
  ).seconds;
  const games = db
    .prepare(
      'SELECT activity_name game,COUNT(*) activity_count,SUM(duration_seconds) seconds FROM presence_sessions WHERE guild_id=? AND user_id=? AND activity_type=0 AND last_seen>=? AND last_seen<? GROUP BY activity_name ORDER BY seconds DESC LIMIT 5',
    )
    .all(guild, userId, bounds.start, bounds.end) as any[];
  const activity = db
    .prepare(
      'SELECT activity_name,SUM(duration_seconds) seconds FROM presence_sessions WHERE guild_id=? AND user_id=? AND last_seen>=? AND last_seen<? GROUP BY activity_name ORDER BY seconds DESC LIMIT 5',
    )
    .all(guild, userId, bounds.start, bounds.end) as any[];
  const music = db
    .prepare(
      'SELECT music_track,music_artist,SUM(duration_seconds) seconds FROM presence_sessions WHERE guild_id=? AND user_id=? AND music_track IS NOT NULL AND last_seen>=? AND last_seen<? GROUP BY music_track,music_artist ORDER BY seconds DESC LIMIT 5',
    )
    .all(guild, userId, bounds.start, bounds.end) as any[];
  const lines = [
    `**${nameOf(guild, userId)} — ${bounds.label} Stats**`,
    `Messages: ${messages}`,
    `Voice time: ${formatDuration(voice)}`,
  ];
  if (category === 'all' || category === 'games')
    lines.push(
      `**Games:** ${games.length ? games.map((g) => `${g.game} (${formatDuration(g.seconds)}, ${g.activity_count} updates)`).join(', ') : 'none recorded'}`,
    );
  if (category === 'all' || category === 'music')
    lines.push(
      `**Music:** ${music.length ? music.map((m) => `${m.music_track}${m.music_artist ? ` — ${m.music_artist}` : ''} (${formatDuration(m.seconds)})`).join(', ') : 'none exposed'}`,
    );
  if (category === 'all')
    lines.push(
      `**Activity time:** ${activity.length ? activity.map((a) => `${a.activity_name} (${formatDuration(a.seconds)})`).join(', ') : 'none recorded'}`,
    );
  if (category === 'all' || category === 'voice') lines.push(`**Voice:** ${formatDuration(voice)}`);
  const previous = period === 'all' ? null : periodBounds(period, offset - 1);
  if (previous) {
    const old = (
      db
        .prepare(
          'SELECT COUNT(*) n FROM messages WHERE guild_id=? AND user_id=? AND created_at>=? AND created_at<?',
        )
        .get(guild, userId, previous.start, previous.end) as any
    ).n;
    lines.push(
      `Compared with previous period: ${messages - old >= 0 ? '+' : ''}${messages - old} messages.`,
    );
  }
  return lines.join('\n');
}

async function statsCommand(i: ChatInputCommandInteraction, guild: string) {
  const period = (i.options.getString('period') ?? 'week') as StatsPeriod;
  const category = (i.options.getString('category') ?? 'all') as StatsCategory;
  await i.reply(statsText(guild, i.user.id, period, category));
  await i.editReply({
    content: statsText(guild, i.user.id, period, category),
    components: statsButtons(i.user.id, period, category, 0),
  });
}

function statsButtons(
  userId: string,
  period: StatsPeriod,
  category: StatsCategory,
  offset: number,
) {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`stats|${userId}|${period}|${category}|${offset - 1}`)
        .setLabel('← Older')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`stats|${userId}|${period}|${category}|${offset + 1}`)
        .setLabel('Newer →')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(offset >= 0),
    ),
  ];
}

export async function handleStatsButton(i: ButtonInteraction) {
  const [kind, userId, period, category, offsetText] = i.customId.split('|');
  if (kind !== 'stats' || userId !== i.user.id)
    return void (await i.reply({
      content: 'that stats panel belongs to someone else.',
      flags: MessageFlags.Ephemeral,
    }));
  await i.update({
    content: statsText(
      i.guildId!,
      userId,
      period as StatsPeriod,
      category as StatsCategory,
      Number(offsetText),
    ),
    components: statsButtons(
      userId,
      period as StatsPeriod,
      category as StatsCategory,
      Number(offsetText),
    ),
  });
}

async function preferencesCommand(i: ChatInputCommandInteraction, guild: string) {
  const sub = i.options.getSubcommand();
  if (sub === 'reset') {
    savePreferences(guild, i.user.id, { ...defaultPreferences });
    return void (await i.reply(
      'preferences reset. NPC is back to factory settings and has misplaced the manual.',
    ));
  }
  const current = getPreferences(guild, i.user.id);
  if (sub === 'view')
    return void (await i.reply(
      `**Your NPC Preferences**\n${Object.entries(current)
        .map(([key, value]) => `**${key}:** ${value}`)
        .join('\n')}`,
    ));
  const setting = i.options.getString('setting', true) as keyof ReplyPreferences;
  const value = i.options.getString('value', true).trim();
  const allowed: Record<string, string[]> = {
    length: ['short', 'normal', 'detailed'],
    format: ['single', 'multiple', 'bullets'],
    humor: ['serious', 'light', 'chaotic'],
    roast: ['off', 'playful', 'savage'],
    emojis: ['none', 'normal', 'lots'],
    language: [
      'English',
      'Hindi',
      'Tamil',
      'Telugu',
      'Malayalam',
      'Kannada',
      'Bengali',
      'Tagalog',
      'Chinese',
      'Taiwanese Mandarin',
      'Indonesian',
      'Portuguese',
      'Japanese',
      'Spanish',
      'French',
      'German',
      'Russian',
      'Korean',
      'Hinglish',
      'Tanglish',
      'Telgish',
      'Malayalam (Romanized)',
      'Kannada (Romanized)',
      'Bengali (Romanized)',
      'Tagalog (Romanized)',
      'Chinese (Pinyin)',
      'Taiwanese (Romanized)',
      'Indonesian (Romanized)',
      'Portuguese (Romanized)',
      'Japanese (Romaji)',
      'Spanish (Romanized)',
      'French (Romanized)',
      'German (Romanized)',
      'Russian (Romanized)',
      'Korean (Romanized)',
    ],
    tracking: ['on', 'off'],
  };
  if (!allowed[setting]?.includes(value))
    return void (await i.reply({
      content: `invalid value. Choose: ${allowed[setting]?.join(', ') ?? 'a listed setting'}.`,
      flags: MessageFlags.Ephemeral,
    }));
  savePreferences(guild, i.user.id, { ...current, [setting]: value } as ReplyPreferences);
  await i.reply(`saved **${setting}: ${value}**. NPC has updated your personal operating system.`);
}

async function privacyCommand(i: ChatInputCommandInteraction, guild: string) {
  const requested = i.options.getString('tracking');
  const preferences = getPreferences(guild, i.user.id);
  if (requested === 'on' || requested === 'off') {
    preferences.tracking = requested;
    savePreferences(guild, i.user.id, preferences);
  }
  await i.reply(
    `**NPC Privacy for ${i.user.displayName}**\nNew activity tracking: **${preferences.tracking}**\n\nWhen on, NPC may archive messages, memories, mentions, relationships, reactions, voice time, games, and shared music/activity. When off, new personal data is not archived. Existing records are not deleted.\n\nTracked scope: channels NPC can read, plus the solitude channel and NPC discussion threads.`,
  );
}

async function deployCommand(i: ChatInputCommandInteraction, action: 'pull' | 'restart') {
  if (!config.OWNER_USER_IDS.includes(i.user.id))
    return void (await i.reply({
      content: 'owner controls are sealed.',
      flags: MessageFlags.Ephemeral,
    }));
  await i.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    if (action === 'pull') {
      const pull = await run('git', ['pull', '--ff-only'], { cwd: process.cwd() });
      const build = await run('npm', ['run', 'build'], { cwd: process.cwd() });
      const register = await run('npm', ['run', 'register:prod'], { cwd: process.cwd() });
      return void (await i.editReply(
        `pull/build/register complete.\n\`\`\`\n${`${pull.stdout}${build.stdout}${register.stdout}`.slice(-1500)}\n\`\`\``,
      ));
    }
    writeFileSync(
      './data/restart-notice.json',
      JSON.stringify({ channelId: i.channelId, userId: i.user.id }),
    );
    await i.editReply(
      'restart requested. I will send a confirmation here when the process is back online.',
    );
    setTimeout(() => void run('pm2', ['restart', 'npc'], { cwd: process.cwd() }), 500);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await i.editReply(`deployment failed: ${message.slice(0, 1000)}`);
  }
}

async function toggleNpc(i: ChatInputCommandInteraction, guild: string, paused: boolean) {
  if (!config.OWNER_USER_IDS.includes(i.user.id))
    return void (await i.reply({
      content: 'owner controls are sealed.',
      flags: MessageFlags.Ephemeral,
    }));
  db.prepare(
    `INSERT INTO settings(guild_id,key,value,updated_at) VALUES(?,?,?,?)
    ON CONFLICT(guild_id,key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at`,
  ).run(guild, 'npc_paused', paused ? 'true' : 'false', now());
  await i.reply(
    `NPC replies are now **${paused ? 'paused' : 'active'}**. The process stays online, and owner commands still work.`,
  );
}

async function clearUserData(i: ChatInputCommandInteraction, guild: string) {
  if (!config.OWNER_USER_IDS.includes(i.user.id))
    return void (await i.reply({
      content: 'owner controls are sealed.',
      flags: MessageFlags.Ephemeral,
    }));
  if (i.options.getString('confirm', true) !== 'DELETE_USER')
    return void (await i.reply({
      content: 'Nothing deleted. Type DELETE_USER exactly to confirm.',
      flags: MessageFlags.Ephemeral,
    }));
  const target = i.options.getUser('user', true);
  db.transaction(() => {
    const id = target.id;
    for (const table of [
      'memories',
      'messages',
      'quotes',
      'achievements',
      'games',
      'voice_activity',
      'presence_sessions',
      'reputation',
      'user_state',
    ])
      db.prepare(`DELETE FROM ${table} WHERE guild_id=? AND user_id=?`).run(guild, id);
    db.prepare('DELETE FROM relationships WHERE guild_id=? AND (user_a=? OR user_b=?)').run(
      guild,
      id,
      id,
    );
    db.prepare('DELETE FROM phrases WHERE guild_id=? AND (first_user_id=? OR last_user_id=?)').run(
      guild,
      id,
      id,
    );
    db.prepare('DELETE FROM lore WHERE guild_id=? AND author_id=?').run(guild, id);
    db.prepare('DELETE FROM users WHERE guild_id=? AND id=?').run(guild, id);
  })();
  await i.reply(`🧹 Deleted NPC records for **${target.displayName}** in this server.`);
}

async function clearAllData(i: ChatInputCommandInteraction) {
  if (!config.OWNER_USER_IDS.includes(i.user.id))
    return void (await i.reply({
      content: 'owner controls are sealed.',
      flags: MessageFlags.Ephemeral,
    }));
  if (i.options.getString('confirm', true) !== 'DELETE_ALL')
    return void (await i.reply({
      content: 'Nothing deleted. Type DELETE_ALL exactly to confirm.',
      flags: MessageFlags.Ephemeral,
    }));
  db.transaction(() => {
    for (const table of [
      'messages',
      'memories',
      'quotes',
      'achievements',
      'games',
      'voice_activity',
      'presence_sessions',
      'relationships',
      'reputation',
      'phrases',
      'lore',
      'events',
      'moods',
      'quests',
      'npc_journal',
      'user_state',
      'settings',
      'users',
    ])
      db.prepare(`DELETE FROM ${table}`).run();
  })();
  await i.reply(
    '🧹 All NPC memories, activity, relationships, lore, and settings were deleted. Fresh archive, same bot.',
  );
}

export async function autocomplete(i: AutocompleteInteraction) {
  if (i.commandName !== 'party') return;
  const value = String(i.options.getFocused()).toLowerCase();
  const rows = db
    .prepare('SELECT DISTINCT game FROM games WHERE guild_id=? AND lower(game) LIKE ? LIMIT 20')
    .all(i.guildId, `%${value}%`) as any[];
  const fallback = [
    'Valorant',
    'League of Legends',
    'CS2',
    'Minecraft',
    'Elden Ring',
    'Story Games',
  ].filter((game) => game.toLowerCase().includes(value));
  await i.respond(
    [
      ...rows.map((r) => ({ name: r.game, value: r.game })),
      ...fallback.map((game) => ({ name: game, value: game })),
    ].slice(0, 25),
  );
}
