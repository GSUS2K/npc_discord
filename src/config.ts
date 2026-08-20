import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  DISCORD_TOKEN: z.string().min(1),
  DISCORD_CLIENT_ID: z.string().min(1),
  DISCORD_GUILD_ID: z.string().optional(),
  GROQ_API_KEY: z.string().optional(),
  GROQ_MODEL: z.string().default('llama-3.3-70b-versatile'),
  OPENROUTER_API_KEY: z.string().optional(),
  OPENROUTER_MODEL: z.string().default('meta-llama/llama-3.3-70b-instruct:free'),
  DATABASE_PATH: z.string().default('./data/npc.sqlite'),
  DASHBOARD_PORT: z.coerce.number().int().positive().default(3000),
  DASHBOARD_SECURE_COOKIES: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  DASHBOARD_PASSWORD: z.string().min(12),
  SESSION_SECRET: z.string().min(16),
  PUBLIC_BASE_URL: z.string().url().default('http://localhost:3000'),
  GOSSIP_CHANNEL_ID: z.string().optional(),
  TIMEZONE: z.string().default('Asia/Kolkata'),
  LOG_LEVEL: z.string().default('info'),
  NPC_SPONTANEOUS_CHANCE: z.coerce.number().min(0).max(0.1).default(0.004),
  SOLITUDE_CHANNEL_ID: z.string().default('1482086962348429404'),
});

export const config = schema.parse(process.env);
