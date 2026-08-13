import { REST } from '@discordjs/rest';
import { Routes } from 'discord-api-types/v10';
import { commandData } from './commands/index.js';
import { config } from './config.js';

const rest = new REST({ version: '10' }).setToken(config.DISCORD_TOKEN);
const route = config.DISCORD_GUILD_ID
  ? Routes.applicationGuildCommands(config.DISCORD_CLIENT_ID, config.DISCORD_GUILD_ID)
  : Routes.applicationCommands(config.DISCORD_CLIENT_ID);
await rest.put(route, { body: commandData.map((command) => command.toJSON()) });
console.log(
  `Registered ${commandData.length} NPC commands ${config.DISCORD_GUILD_ID ? 'to the test guild' : 'globally'}.`,
);
