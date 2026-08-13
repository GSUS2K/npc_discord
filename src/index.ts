import { Client, Events, GatewayIntentBits, Partials } from 'discord.js';
import { config } from './config.js';
import './database/index.js';
import { startDashboard } from './dashboard/index.js';
import { attachDiscordEvents } from './events/discord.js';
import { logger } from './logger.js';
import { startScheduler } from './scheduler.js';

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
  startScheduler(client);
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
