import crypto from 'node:crypto';
import express, { type NextFunction, type Request, type Response } from 'express';
import session from 'express-session';
import helmet from 'helmet';
import { config } from '../config.js';
import { db, now } from '../database/index.js';
import { logger } from '../logger.js';

declare module 'express-session' {
  interface SessionData {
    authenticated?: boolean;
    csrf?: string;
  }
}
const escape = (value: unknown) =>
  String(value ?? '').replace(
    /[&<>'"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[c]!,
  );
const attempts = new Map<string, { count: number; reset: number }>();

class SqliteSessionStore extends session.Store {
  get(sid: string, callback: (error?: unknown, value?: session.SessionData | null) => void) {
    try {
      const row = db
        .prepare('SELECT data,expires_at FROM dashboard_sessions WHERE sid=?')
        .get(sid) as { data: string; expires_at: number } | undefined;
      if (!row || row.expires_at < Date.now()) return callback(undefined, null);
      callback(undefined, JSON.parse(row.data) as session.SessionData);
    } catch (error) {
      callback(error);
    }
  }

  set(sid: string, value: session.SessionData, callback?: (error?: unknown) => void) {
    try {
      const expires = value.cookie.expires?.getTime() ?? Date.now() + 12 * 3600_000;
      db.prepare(
        `INSERT INTO dashboard_sessions(sid,data,expires_at) VALUES(?,?,?)
         ON CONFLICT(sid) DO UPDATE SET data=excluded.data,expires_at=excluded.expires_at`,
      ).run(sid, JSON.stringify(value), expires);
      callback?.();
    } catch (error) {
      callback?.(error);
    }
  }

  destroy(sid: string, callback?: (error?: unknown) => void) {
    try {
      db.prepare('DELETE FROM dashboard_sessions WHERE sid=?').run(sid);
      callback?.();
    } catch (error) {
      callback?.(error);
    }
  }

  touch(sid: string, value: session.SessionData, callback?: () => void) {
    const expires = value.cookie.expires?.getTime() ?? Date.now() + 12 * 3600_000;
    db.prepare('UPDATE dashboard_sessions SET expires_at=? WHERE sid=?').run(expires, sid);
    callback?.();
  }
}

export function startDashboard() {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(
    helmet({
      contentSecurityPolicy: { directives: { 'style-src': ["'self'", "'unsafe-inline'"] } },
    }),
  );
  app.use(express.urlencoded({ extended: false, limit: '20kb' }));
  app.use(
    session({
      store: new SqliteSessionStore(),
      secret: config.SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: 'strict',
        secure: config.DASHBOARD_SECURE_COOKIES,
        maxAge: 12 * 3600_000,
      },
    }),
  );
  app.get('/health', (_req, res) =>
    res.json({ ok: true, uptime: process.uptime(), database: true }),
  );
  app.get('/login', (req, res) => res.send(page('Login', loginForm(req))));
  app.post('/login', (req, res) => {
    const ip = req.ip ?? 'unknown';
    const state = attempts.get(ip) ?? { count: 0, reset: Date.now() + 15 * 60_000 };
    if (Date.now() > state.reset) {
      state.count = 0;
      state.reset = Date.now() + 15 * 60_000;
    }
    state.count++;
    attempts.set(ip, state);
    if (state.count > 10)
      return void res
        .status(429)
        .send(page('Easy there', 'Too many attempts. The archive door is judging you.'));
    const given = Buffer.from(String(req.body.password));
    const expected = Buffer.from(config.DASHBOARD_PASSWORD);
    if (given.length === expected.length && crypto.timingSafeEqual(given, expected)) {
      req.session.authenticated = true;
      req.session.csrf = crypto.randomBytes(24).toString('hex');
      attempts.delete(ip);
      return void res.redirect('/');
    }
    res
      .status(401)
      .send(
        page('Denied', `${loginForm(req)}<p>Incorrect password. The archives remain sealed.</p>`),
      );
  });
  app.post('/logout', auth, csrf, (req, res) => req.session.destroy(() => res.redirect('/login')));
  app.use(auth);
  app.get('/', (req, res) => res.send(page('NPC Dashboard', dashboard(req))));
  app.get('/data/:table', (req, res) => {
    const allowed = [
      'users',
      'memories',
      'lore',
      'achievements',
      'quotes',
      'relationships',
      'games',
      'voice_activity',
      'events',
      'moods',
      'quests',
      'reputation',
      'npc_journal',
      'user_state',
    ];
    if (!allowed.includes(req.params.table))
      return void res.status(404).send(page('Nope', 'That archive does not exist.'));
    const rows = db
      .prepare(`SELECT * FROM ${req.params.table} ORDER BY rowid DESC LIMIT 250`)
      .all() as Record<string, unknown>[];
    res.send(page(req.params.table, tableView(rows, req.params.table, req.session.csrf)));
  });
  app.get('/settings', (req, res) => res.send(page('AI & Server Settings', settings(req))));
  app.post('/settings', csrf, (req, res) => {
    const guild = String(req.body.guild_id ?? '').trim();
    const key = String(req.body.key ?? '').trim();
    const value = String(req.body.value ?? '').trim();
    if (guild && ['gossip_channel_id', 'ai_provider', 'npc_enabled'].includes(key))
      db.prepare(
        `INSERT INTO settings(guild_id,key,value,updated_at) VALUES(?,?,?,?) ON CONFLICT(guild_id,key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at`,
      ).run(guild, key, value, now());
    res.redirect('/settings');
  });
  app.post('/delete/:table/:id', csrf, (req, res) => {
    const table = String(req.params.table);
    const id = String(req.params.id);
    const allowed = ['memories', 'lore', 'quotes'];
    if (allowed.includes(table) && /^\d+$/.test(id))
      db.prepare(`DELETE FROM ${table} WHERE id=?`).run(id);
    res.redirect(`/data/${table}`);
  });
  app.use((_req, res) => res.status(404).send(page('404', 'A wild missing page appeared.')));
  app.listen(config.DASHBOARD_PORT, () =>
    logger.info({ port: config.DASHBOARD_PORT }, 'Dashboard listening'),
  );
}

function auth(req: Request, res: Response, next: NextFunction) {
  if (req.session.authenticated) return next();
  res.redirect('/login');
}
function csrf(req: Request, res: Response, next: NextFunction) {
  if (req.body.csrf && req.body.csrf === req.session.csrf) return next();
  res.status(403).send(page('Nope', 'Invalid form token. Refresh and try again.'));
}
function loginForm(_req: Request) {
  return `<form method="post"><label>Archive password<input type="password" name="password" required autofocus></label><button>Enter</button></form>`;
}
function nav() {
  return `<nav><a href="/">Overview</a><a href="/data/users">Users</a><a href="/data/memories">Memories</a><a href="/data/lore">Lore</a><a href="/data/achievements">Achievements</a><a href="/data/quotes">Quotes</a><a href="/data/games">Games</a><a href="/data/npc_journal">Journal</a><a href="/settings">Settings</a></nav>`;
}
function page(title: string, body: string) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escape(title)} · NPC</title><style>:root{color-scheme:dark;--bg:#101116;--card:#1a1c24;--ink:#f4f1e8;--muted:#9da3b4;--accent:#a7ff68}*{box-sizing:border-box}body{margin:0;font:15px system-ui;background:var(--bg);color:var(--ink)}header,main{max-width:1200px;margin:auto;padding:24px}header{display:flex;align-items:center;gap:24px}h1{letter-spacing:-1px}nav{display:flex;gap:8px;flex-wrap:wrap}a{color:var(--accent);text-decoration:none;padding:7px 10px;border-radius:7px}a:hover{background:#252936}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px}.card,form{background:var(--card);padding:18px;border:1px solid #2b2e39;border-radius:12px}.number{font-size:32px;font-weight:800;color:var(--accent)}table{width:100%;border-collapse:collapse;background:var(--card);font-size:13px}th,td{text-align:left;padding:10px;border-bottom:1px solid #2b2e39;max-width:380px;overflow-wrap:anywhere}th{color:var(--muted)}input,select,button{width:100%;margin:6px 0 14px;padding:10px;background:#101116;color:var(--ink);border:1px solid #3a3e4c;border-radius:7px}button{background:var(--accent);color:#102000;font-weight:700;cursor:pointer}code{color:#f4bdff}.muted{color:var(--muted)}</style></head><body><header><h1>NPC // ARCHIVES</h1>${nav()}</header><main><h2>${escape(title)}</h2>${body}</main></body></html>`;
}
function dashboard(req: Request) {
  const names = ['users', 'memories', 'lore', 'achievements', 'quotes', 'messages'];
  const cards = names
    .map((n) => {
      const c = (db.prepare(`SELECT COUNT(*) n FROM ${n}`).get() as any).n;
      return `<a class="card" href="/data/${n === 'messages' ? 'users' : n}"><span class="number">${c}</span><br>${escape(n)}</a>`;
    })
    .join('');
  return `<div class="grid">${cards}</div><p class="muted">The resident is watching respectfully. Mostly.</p><form method="post" action="/logout"><input type="hidden" name="csrf" value="${escape(req.session.csrf)}"><button>Log out</button></form>`;
}
function tableView(rows: Record<string, unknown>[], table?: string, token?: string) {
  if (!rows.length) return '<p>No records yet. The silence is incriminating.</p>';
  const keys = Object.keys(rows[0]!);
  const deletable = ['memories', 'lore', 'quotes'].includes(table ?? '');
  return `<div style="overflow:auto"><table><thead><tr>${keys.map((k) => `<th>${escape(k)}</th>`).join('')}${deletable ? '<th></th>' : ''}</tr></thead><tbody>${rows.map((r) => `<tr>${keys.map((k) => `<td>${escape(r[k])}</td>`).join('')}${deletable && 'id' in r ? `<td><form method="post" action="/delete/${escape(table)}/${escape(r.id)}"><input type="hidden" name="csrf" value="${escape(token)}"><button>Delete</button></form></td>` : ''}</tr>`).join('')}</tbody></table></div>`;
}
function settings(req: Request) {
  const rows = db.prepare('SELECT * FROM settings ORDER BY guild_id,key').all() as any[];
  return `${tableView(rows)}<h3>Update setting</h3><form method="post"><input type="hidden" name="csrf" value="${escape(req.session.csrf)}"><label>Guild ID<input name="guild_id" required></label><label>Setting<select name="key"><option>gossip_channel_id</option><option>ai_provider</option><option>npc_enabled</option></select></label><label>Value<input name="value" required></label><button>Save</button></form><p class="muted">API keys remain environment-only and are never rendered here.</p>`;
}
