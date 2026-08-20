PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, guild_id TEXT NOT NULL, username TEXT NOT NULL, display_name TEXT NOT NULL,
  nickname TEXT, message_count INTEGER NOT NULL DEFAULT 0, first_seen TEXT NOT NULL, last_seen TEXT NOT NULL,
  favorite_channel_id TEXT, common_phrases TEXT NOT NULL DEFAULT '[]', metadata TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_users_guild_activity ON users(guild_id, message_count DESC);

CREATE TABLE IF NOT EXISTS memories (
  id INTEGER PRIMARY KEY AUTOINCREMENT, guild_id TEXT NOT NULL, user_id TEXT, content TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'observation', importance INTEGER NOT NULL DEFAULT 5 CHECK(importance BETWEEN 1 AND 10),
  source_message_id TEXT, created_at TEXT NOT NULL, last_recalled_at TEXT, recall_count INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_memories_lookup ON memories(guild_id, user_id, importance DESC);

CREATE TABLE IF NOT EXISTS lore (
  id INTEGER PRIMARY KEY AUTOINCREMENT, guild_id TEXT NOT NULL, author_id TEXT NOT NULL, content TEXT NOT NULL,
  users_involved TEXT NOT NULL DEFAULT '[]', tags TEXT NOT NULL DEFAULT '[]', importance INTEGER NOT NULL DEFAULT 5,
  score INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_lore_guild_score ON lore(guild_id, score DESC, importance DESC);

CREATE TABLE IF NOT EXISTS achievements (
  id INTEGER PRIMARY KEY AUTOINCREMENT, guild_id TEXT NOT NULL, user_id TEXT NOT NULL, key TEXT NOT NULL,
  name TEXT NOT NULL, description TEXT NOT NULL, unlocked_at TEXT NOT NULL, secret INTEGER NOT NULL DEFAULT 0,
  UNIQUE(guild_id, user_id, key), FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS quotes (
  id INTEGER PRIMARY KEY AUTOINCREMENT, guild_id TEXT NOT NULL, quoted_user_id TEXT NOT NULL, added_by_id TEXT NOT NULL,
  content TEXT NOT NULL, source_message_id TEXT, score INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS relationships (
  guild_id TEXT NOT NULL, user_a TEXT NOT NULL, user_b TEXT NOT NULL, mentions INTEGER NOT NULL DEFAULT 0,
  replies INTEGER NOT NULL DEFAULT 0, messages_together INTEGER NOT NULL DEFAULT 0, voice_seconds INTEGER NOT NULL DEFAULT 0,
  positive INTEGER NOT NULL DEFAULT 0, rivalry INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL,
  PRIMARY KEY(guild_id, user_a, user_b)
);
CREATE TABLE IF NOT EXISTS games (
  guild_id TEXT NOT NULL, user_id TEXT NOT NULL, game TEXT NOT NULL, activity_count INTEGER NOT NULL DEFAULT 0,
  minutes_detected INTEGER NOT NULL DEFAULT 0, last_seen TEXT NOT NULL, preferences TEXT NOT NULL DEFAULT '{}',
  PRIMARY KEY(guild_id, user_id, game)
);
CREATE TABLE IF NOT EXISTS presence_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT, guild_id TEXT NOT NULL, user_id TEXT NOT NULL,
  status TEXT NOT NULL, activity_type INTEGER, activity_name TEXT, details TEXT, state TEXT,
  application_id TEXT, started_at TEXT NOT NULL, last_seen TEXT NOT NULL, ended_at TEXT,
  duration_seconds INTEGER NOT NULL DEFAULT 0, music_track TEXT, music_artist TEXT
);
CREATE INDEX IF NOT EXISTS idx_presence_live ON presence_sessions(guild_id, user_id, ended_at, last_seen);
CREATE TABLE IF NOT EXISTS voice_activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT, guild_id TEXT NOT NULL, user_id TEXT NOT NULL, channel_id TEXT NOT NULL,
  joined_at TEXT NOT NULL, left_at TEXT, duration_seconds INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT, guild_id TEXT NOT NULL, type TEXT NOT NULL, title TEXT NOT NULL,
  description TEXT NOT NULL, starts_at TEXT NOT NULL, ends_at TEXT, metadata TEXT NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS moods (
  guild_id TEXT PRIMARY KEY, mood TEXT NOT NULL, intensity INTEGER NOT NULL DEFAULT 5, reason TEXT,
  changed_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS quests (
  id INTEGER PRIMARY KEY AUTOINCREMENT, guild_id TEXT NOT NULL, date TEXT NOT NULL, title TEXT NOT NULL,
  description TEXT NOT NULL, target INTEGER NOT NULL DEFAULT 1, reward TEXT NOT NULL, completions TEXT NOT NULL DEFAULT '[]',
  UNIQUE(guild_id, date)
);
CREATE TABLE IF NOT EXISTS reputation (
  guild_id TEXT NOT NULL, user_id TEXT NOT NULL, positive INTEGER NOT NULL DEFAULT 0, funny INTEGER NOT NULL DEFAULT 0,
  activity INTEGER NOT NULL DEFAULT 0, memorable INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL,
  PRIMARY KEY(guild_id, user_id)
);
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY, guild_id TEXT NOT NULL, channel_id TEXT NOT NULL, user_id TEXT NOT NULL, content TEXT NOT NULL,
  reply_to_user_id TEXT, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_recent ON messages(guild_id, created_at DESC);
CREATE TABLE IF NOT EXISTS phrases (
  guild_id TEXT NOT NULL, phrase TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 1, first_user_id TEXT NOT NULL,
  last_user_id TEXT NOT NULL, last_seen TEXT NOT NULL, PRIMARY KEY(guild_id, phrase)
);
CREATE TABLE IF NOT EXISTS settings (
  guild_id TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL, updated_at TEXT NOT NULL,
  PRIMARY KEY(guild_id, key)
);
CREATE TABLE IF NOT EXISTS dashboard_sessions (
  sid TEXT PRIMARY KEY, data TEXT NOT NULL, expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS npc_journal (
  id INTEGER PRIMARY KEY AUTOINCREMENT, guild_id TEXT NOT NULL, content TEXT NOT NULL, period_start TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS user_state (
  guild_id TEXT NOT NULL, user_id TEXT NOT NULL, last_catchup_at TEXT, reply_style TEXT NOT NULL DEFAULT 'normal', PRIMARY KEY(guild_id,user_id)
);
