import { Client, Events, GatewayIntentBits, Partials } from 'discord.js';
import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { config } from './config.js';
import './database/index.js';
import { startDashboard } from './dashboard/index.js';
import { attachDiscordEvents, syncCurrentPresence } from './events/discord.js';
import { logger } from './logger.js';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildMessageReactions,
  ],
  partials: [Partials.Channel, Partials.Message, Partials.Reaction, Partials.User],
  allowedMentions: { parse: [], repliedUser: false },
});

attachDiscordEvents(client);
client.once(Events.ClientReady, (ready) => {
  logger.info(
    { user: ready.user.tag, guilds: ready.guilds.cache.size },
    'NPC has entered the server',
  );
  ready.user.setActivity('the server lore accumulate');
  syncCurrentPresence(client);
  const noticePath = './data/restart-notice.json';
  if (existsSync(noticePath)) {
    try {
      const notice = JSON.parse(readFileSync(noticePath, 'utf8')) as {
        channelId?: string;
        userId?: string;
      };
      if (notice.channelId)
        void client.channels.fetch(notice.channelId).then((channel) => {
          if (channel?.isTextBased() && 'send' in channel)
            void channel.send(
              `✅ <@${notice.userId ?? ready.user.id}> NPC restart complete. I’m back online and listening.`,
            );
        });
    } finally {
      unlinkSync(noticePath);
    }
  }
});

for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => {
    logger.info({ signal }, 'Shutting down');
    client.destroy();
    process.exit(0);
  });
process.on('unhandledRejection', (error) => logger.error({ error }, 'Unhandled rejection'));
process.on('uncaughtException', (error) => {
  logger.fatal({ error }, 'Uncaught exception');
  process.exit(1);
});

startDashboard();
await client.login(config.DISCORD_TOKEN);
