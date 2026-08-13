# NPC

NPC is a persistent Discord resident for gaming communities: part historian, part instigator, part suspiciously attentive lurker. It remembers people and incidents, builds server lore, tracks friendships and voice/game activity, awards achievements, publishes gossip, and uses a free-tier LLM only when conversation actually calls for one.

## What is included

- Mention-driven conversation with durable channel context and relevant-memory retrieval
- Automatic Groq → OpenRouter failover (both optional free-tier providers)
- Lore, quotes, reputation, relationships, game/activity, party finder, VC stats, archaeology, quests, achievements, patch notes, and media roasts
- Phrase/inside-joke detection, explicit memory capture, changing moods, rare ambient replies, and random events
- Daily gossip and a Sunday server newspaper
- Password-protected, CSRF-protected Express archive dashboard
- SQLite WAL storage, graceful shutdown, structured logs, Docker health checks, PM2 configuration, ESLint, and Prettier

## Discord setup

1. Create an application and bot in the [Discord Developer Portal](https://discord.com/developers/applications).
2. On the **Bot** page enable **Message Content**, **Server Members**, and **Presence** privileged intents.
3. Invite it with the `bot` and `applications.commands` scopes. Useful permissions: View Channels, Send Messages, Read Message History, Add Reactions, and Embed Links.
4. Copy `.env.example` to `.env`. Set the token, application ID, strong dashboard secrets, and at least one free AI provider key. During development, set `DISCORD_GUILD_ID` so commands update instantly.
5. Register commands once with `npm run register`.

## Local development

```bash
npm install
npm run register
npm run dev
```

Node.js 22+ is required. The dashboard is at `http://localhost:3000`; `/health` intentionally remains unauthenticated for monitoring. Set `GOSSIP_CHANNEL_ID` to enable scheduled posts. `NPC_SPONTANEOUS_CHANCE=0.004` means roughly four ambient replies per thousand eligible messages; use `0` for mention-only behavior.

## Docker deployment

```bash
cp .env.example .env
# edit .env, then:
docker compose build
docker compose run --rm npc npm run register:prod
docker compose up -d
```

The dashboard binds to loopback by default; put Caddy or nginx with TLS in front of it for remote access, then set `DASHBOARD_SECURE_COOKIES=true`. SQLite lives in the named `npc-data` volume. Back it up using SQLite's online backup command rather than copying a live WAL database.

## PM2 deployment

```bash
npm ci
npm run build
npm run register
npx pm2 start ecosystem.config.cjs
npx pm2 save
```

Use one process only: SQLite and Discord gateway state do not benefit from PM2 clustering here.

## Commands

`/lore add|random|search|top`, `/quote add|random|user|search`, `/randomquote`, `/tldr`, `/catchup`, `/whatdidimiss`, `/recap`, `/trending`, `/npcjournal`, `/reputation`, `/whois`, `/server-legends`, `/friends`, `/rivals`, `/besties`, `/game-profile`, `/game-stats`, `/party`, `/vcstats`, `/voice-legends`, `/ancient-lore`, `/onthisday`, `/patchnotes`, `/quest`, `/achievements`, and `/analyze`.

## Privacy and operations

NPC stores message content to maintain context. Tell members before enabling it, set a retention policy appropriate to your community, and restrict dashboard access. Dashboard AI keys are deliberately environment-only. Start with a test guild, review logs, and keep the bot's Discord role below moderator/admin roles.

The media analyzer is intentionally a deterministic comedy score; it does not upload attachments to a paid vision service. All core features work without paid APIs.
