import type { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';

export interface Command {
  data: SlashCommandBuilder;
  execute(interaction: ChatInputCommandInteraction): Promise<void>;
}

export interface MemoryRow {
  id: number;
  content: string;
  category: string;
  importance: number;
  created_at: string;
}
