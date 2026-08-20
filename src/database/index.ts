import Database from 'better-sqlite3';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';

mkdirSync(dirname(config.DATABASE_PATH), { recursive: true });
export const db = new Database(config.DATABASE_PATH);
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');
db.pragma('foreign_keys = ON');
const here = dirname(fileURLToPath(import.meta.url));
const adjacentSchema = join(here, 'schema.sql');
const schemaPath = existsSync(adjacentSchema)
  ? adjacentSchema
  : join(process.cwd(), 'src', 'database', 'schema.sql');
db.exec(readFileSync(schemaPath, 'utf8'));
const relationshipColumns = db.prepare('PRAGMA table_info(relationships)').all() as {
  name: string;
}[];
for (const column of ['reactions', 'gaming_together']) {
  if (!relationshipColumns.some((existing) => existing.name === column))
    db.exec(`ALTER TABLE relationships ADD COLUMN ${column} INTEGER NOT NULL DEFAULT 0`);
}
const userStateColumns = db.prepare('PRAGMA table_info(user_state)').all() as { name: string }[];
if (!userStateColumns.some((column) => column.name === 'reply_style'))
  db.exec("ALTER TABLE user_state ADD COLUMN reply_style TEXT NOT NULL DEFAULT 'normal'");

export const now = () => new Date().toISOString();
export const json = <T>(value: string, fallback: T): T => {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};
