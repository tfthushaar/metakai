import { appleUserId, corsHeaders, HttpError, issueSession, revokeApple, userId, type AuthEnv } from './auth';
import {
  ageGroup,
  BOARDS,
  FILTERS,
  heightBand,
  holdUntil,
  isBoard,
  scoreRows,
  validateName,
  validateProfile,
  weightClass,
  type Board,
  type Filter,
  type ProfileInput,
  type ScoresUpload,
} from './rules';

export interface Env extends AuthEnv {
  DB: D1Database;
}

const UPLOAD_INTERVAL_MS = 10 * 60 * 1000;
const MAX_BODY = 16_000;
const LIVE_COUNT_LIMIT = 1000;

interface UserRow {
  id: string;
  name: string;
  country: string | null;
  sex: 'male' | 'female';
  age_group: string;
  weight_class: string;
  height_band: string;
  friend_code: string;
  last_upload_at: string | null;
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

async function body<T>(req: Request, optional = false): Promise<T> {
  const text = await req.text();
  if (text.length > MAX_BODY) throw new HttpError(413, 'Request too large.');
  if (optional && !text.trim()) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new HttpError(400, 'Invalid JSON.');
  }
}

const getUser = (env: Env, id: string) => env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<UserRow>();

function friendCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return [...bytes].map((b) => alphabet[b % alphabet.length]).join('');
}

/* ---------------- profile ---------------- */

async function putProfile(env: Env, id: string, p: ProfileInput) {
  const error = validateProfile(p);
  if (error) throw new HttpError(400, error);
  const name = p.displayName.trim().replace(/\s+/g, ' ');
  const nameKey = name.toLowerCase();
  const taken = await env.DB.prepare('SELECT id FROM users WHERE name_key = ? AND id != ?').bind(nameKey, id).first();
  if (taken) throw new HttpError(409, 'That name is taken.');
  const now = new Date().toISOString();
  const buckets = { age: ageGroup(p.age), weight: weightClass(p.sex, p.weightKg), height: heightBand(p.heightCm) };
  const existing = await getUser(env, id);
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO users (id, name, name_key, country, sex, age_group, weight_class, height_band, friend_code, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, name_key = excluded.name_key, country = excluded.country, sex = excluded.sex,
         age_group = excluded.age_group, weight_class = excluded.weight_class, height_band = excluded.height_band, updated_at = excluded.updated_at`,
    ).bind(id, name, nameKey, p.country, p.sex, buckets.age, buckets.weight, buckets.height, existing?.friend_code ?? friendCode(), now, now),
    env.DB.prepare('UPDATE scores SET sex = ?, age_group = ?, weight_class = ?, height_band = ?, country = ? WHERE user_id = ?').bind(
      p.sex,
      buckets.age,
      buckets.weight,
      buckets.height,
      p.country,
      id,
    ),
  ]);
  return getMe(env, id);
}

async function getMe(env: Env, id: string) {
  const user = await getUser(env, id);
  if (!user) return { profile: null, scores: [] };
  const scores = await env.DB.prepare('SELECT board, score, value, held_until FROM scores WHERE user_id = ?').bind(id).all();
  return {
    profile: { displayName: user.name, country: user.country, friendCode: user.friend_code, sex: user.sex, ageGroup: user.age_group, weightClass: user.weight_class, heightBand: user.height_band },
    scores: scores.results,
  };
}

async function deleteMe(env: Env, id: string) {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM scores WHERE user_id = ?').bind(id),
    env.DB.prepare('DELETE FROM friends WHERE user_id = ? OR friend_id = ?').bind(id, id),
    env.DB.prepare('DELETE FROM users WHERE id = ?').bind(id),
  ]);
  return { deleted: true };
}

/* ---------------- scores ---------------- */

async function putScores(env: Env, id: string, upload: ScoresUpload) {
  const user = await getUser(env, id);
  if (!user) throw new HttpError(404, 'Join the leaderboards first.');
  const now = Date.now();
  if (user.last_upload_at && now - Date.parse(user.last_upload_at) < UPLOAD_INTERVAL_MS) return { accepted: 0, throttled: true };
  const rows = scoreRows(upload, user.sex);
  const previous = await env.DB.prepare('SELECT board, score, held_until FROM scores WHERE user_id = ?').bind(id).all<{ board: string; score: number; held_until: string | null }>();
  const prev = new Map(previous.results.map((r) => [r.board, r]));
  const iso = new Date(now).toISOString();
  const statements = rows.map((r) => {
    const before = prev.get(r.board);
    const held = holdUntil(before ? { score: before.score, heldUntil: before.held_until } : null, r.score, now);
    return env.DB.prepare(
      `INSERT INTO scores (user_id, board, score, value, held_until, sex, age_group, weight_class, height_band, country, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, board) DO UPDATE SET score = excluded.score, value = excluded.value, held_until = excluded.held_until, updated_at = excluded.updated_at`,
    ).bind(id, r.board, r.score, r.value, held, user.sex, user.age_group, user.weight_class, user.height_band, user.country, iso);
  });
  statements.push(env.DB.prepare('UPDATE users SET last_upload_at = ? WHERE id = ?').bind(iso, id));
  await env.DB.batch(statements);
  return { accepted: rows.length, throttled: false };
}

/* ---------------- boards ---------------- */

function filterClause(filter: Filter, me: UserRow | null): { sql: string; params: unknown[]; bucket: string } | null {
  if (filter === 'all') return { sql: '', params: [], bucket: 'all' };
  if (!me) return null;
  switch (filter) {
    case 'sex':
      return { sql: ' AND s.sex = ?', params: [me.sex], bucket: `sex:${me.sex}` };
    case 'age':
      return { sql: ' AND s.sex = ? AND s.age_group = ?', params: [me.sex, me.age_group], bucket: `age:${me.sex}:${me.age_group}` };
    case 'weight':
      return { sql: ' AND s.sex = ? AND s.weight_class = ?', params: [me.sex, me.weight_class], bucket: `weight:${me.sex}:${me.weight_class}` };
    case 'height':
      return { sql: ' AND s.sex = ? AND s.height_band = ?', params: [me.sex, me.height_band], bucket: `height:${me.sex}:${me.height_band}` };
    case 'country':
      return me.country ? { sql: ' AND s.country = ?', params: [me.country], bucket: `country:${me.country}` } : null;
    case 'friends':
      return {
        sql: ' AND (s.user_id = ? OR s.user_id IN (SELECT friend_id FROM friends WHERE user_id = ?))',
        params: [me.id, me.id],
        bucket: `friends:${me.id}`,
      };
  }
}

async function board(env: Env, id: string, boardId: Board, filter: Filter) {
  const me = await getUser(env, id);
  const clause = filterClause(filter, me);
  if (!clause) throw new HttpError(400, filter === 'country' ? 'Add your country to use this filter.' : 'Join the leaderboards first.');
  const now = new Date().toISOString();
  const visible = ' AND (s.held_until IS NULL OR s.held_until < ? OR s.user_id = ?)';
  const where = `s.board = ?${clause.sql}${visible}`;
  const params = [boardId, ...clause.params, now, id];

  const top = await env.DB.prepare(
    `SELECT u.name, u.country, s.score, s.value, s.user_id = ? AS me FROM scores s JOIN users u ON u.id = s.user_id
     WHERE ${where} ORDER BY s.score DESC LIMIT 100`,
  )
    .bind(id, ...params)
    .all<{ name: string; country: string | null; score: number; value: number | null; me: number }>();

  const mine = me ? await env.DB.prepare('SELECT score, value, held_until FROM scores WHERE user_id = ? AND board = ?').bind(id, boardId).first<{ score: number; value: number | null; held_until: string | null }>() : null;

  let total: number;
  let bins: number[];
  let rank: number | null = null;
  const cached = filter === 'friends' ? null : await env.DB.prepare('SELECT bins, total FROM histograms WHERE board = ? AND bucket = ?').bind(boardId, clause.bucket).first<{ bins: string; total: number }>();
  // Small boards are counted live so they are always exact; big ones use the scheduled histogram.
  if (cached && cached.total >= LIVE_COUNT_LIMIT) {
    bins = JSON.parse(cached.bins);
    total = cached.total;
    if (mine) {
      // Rank from the 100-point histogram, accurate to one point.
      const at = Math.min(99, Math.floor(mine.score));
      const above = bins.slice(at + 1).reduce((a, b) => a + b, 0);
      rank = Math.min(total, above + 1);
    }
  } else {
    const counts = await env.DB.prepare(`SELECT CAST(MIN(s.score, 99.999) AS INTEGER) AS bin, COUNT(*) AS n FROM scores s WHERE ${where} GROUP BY bin`)
      .bind(...params)
      .all<{ bin: number; n: number }>();
    bins = new Array(100).fill(0);
    for (const c of counts.results) bins[c.bin] = c.n;
    total = bins.reduce((a, b) => a + b, 0);
    if (mine) {
      const above = await env.DB.prepare(`SELECT COUNT(*) AS n FROM scores s WHERE ${where} AND s.score > ?`)
        .bind(...params, mine.score)
        .first<{ n: number }>();
      rank = (above?.n ?? 0) + 1;
    }
  }
  const tenths = new Array(10).fill(0);
  bins.forEach((n, i) => (tenths[Math.floor(i / 10)] += n));

  return {
    board: boardId,
    filter,
    total,
    me: mine
      ? {
          rank,
          percentile: total <= 1 ? 100 : Math.round(((total - (rank ?? total)) / (total - 1)) * 1000) / 10,
          score: mine.score,
          value: mine.value,
          held: !!mine.held_until && mine.held_until > now,
        }
      : null,
    top: top.results.map((r, i) => ({ rank: i + 1, name: r.name, country: r.country, score: r.score, value: r.value, me: !!r.me })),
    histogram: tenths,
  };
}

/* ---------------- friends ---------------- */

async function addFriend(env: Env, id: string, code: string) {
  const me = await getUser(env, id);
  if (!me) throw new HttpError(404, 'Join the leaderboards first.');
  const other = await env.DB.prepare('SELECT id, name FROM users WHERE friend_code = ?').bind(String(code).trim().toUpperCase()).first<{ id: string; name: string }>();
  if (!other) throw new HttpError(404, 'No one has that code.');
  if (other.id === id) throw new HttpError(400, 'That is your own code.');
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare('INSERT OR IGNORE INTO friends (user_id, friend_id, created_at) VALUES (?, ?, ?)').bind(id, other.id, now),
    env.DB.prepare('INSERT OR IGNORE INTO friends (user_id, friend_id, created_at) VALUES (?, ?, ?)').bind(other.id, id, now),
  ]);
  return { name: other.name };
}

async function listFriends(env: Env, id: string) {
  const rows = await env.DB.prepare('SELECT u.name, u.country, f.friend_id FROM friends f JOIN users u ON u.id = f.friend_id WHERE f.user_id = ? ORDER BY u.name').bind(id).all<{ name: string; country: string | null; friend_id: string }>();
  return { friends: rows.results.map((r) => ({ name: r.name, country: r.country })) };
}

async function removeFriend(env: Env, id: string, name: string) {
  const other = await env.DB.prepare('SELECT id FROM users WHERE name_key = ?').bind(name.toLowerCase()).first<{ id: string }>();
  if (other) {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM friends WHERE user_id = ? AND friend_id = ?').bind(id, other.id),
      env.DB.prepare('DELETE FROM friends WHERE user_id = ? AND friend_id = ?').bind(other.id, id),
    ]);
  }
  return { removed: true };
}

/* ---------------- scheduled histograms ---------------- */

async function refreshHistograms(env: Env) {
  const now = new Date().toISOString();
  for (const b of BOARDS) {
    const rows = await env.DB.prepare('SELECT score, sex, age_group, weight_class, height_band, country FROM scores WHERE board = ? AND (held_until IS NULL OR held_until < ?)')
      .bind(b, now)
      .all<{ score: number; sex: string; age_group: string; weight_class: string; height_band: string; country: string | null }>();
    const buckets = new Map<string, number[]>();
    const add = (key: string, score: number) => {
      let bins = buckets.get(key);
      if (!bins) buckets.set(key, (bins = new Array(100).fill(0)));
      bins[Math.min(99, Math.max(0, Math.floor(score)))]++;
    };
    for (const r of rows.results) {
      add('all', r.score);
      add(`sex:${r.sex}`, r.score);
      add(`age:${r.sex}:${r.age_group}`, r.score);
      add(`weight:${r.sex}:${r.weight_class}`, r.score);
      add(`height:${r.sex}:${r.height_band}`, r.score);
      if (r.country) add(`country:${r.country}`, r.score);
    }
    const statements = [env.DB.prepare('DELETE FROM histograms WHERE board = ?').bind(b)];
    for (const [bucket, bins] of buckets) {
      statements.push(
        env.DB.prepare('INSERT INTO histograms (board, bucket, bins, total, updated_at) VALUES (?, ?, ?, ?, ?)').bind(b, bucket, JSON.stringify(bins), bins.reduce((a, n) => a + n, 0), now),
      );
    }
    await env.DB.batch(statements);
  }
}

/** Profiles with no uploads or profile changes for this long are deleted. */
const INACTIVE_DAYS = 365;

async function deleteInactive(env: Env) {
  const cutoff = new Date(Date.now() - INACTIVE_DAYS * 86400_000).toISOString();
  const stale = 'SELECT id FROM users WHERE COALESCE(last_upload_at, updated_at) < ?';
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM scores WHERE user_id IN (${stale})`).bind(cutoff),
    env.DB.prepare(`DELETE FROM friends WHERE user_id IN (${stale}) OR friend_id IN (${stale})`).bind(cutoff, cutoff),
    env.DB.prepare(`DELETE FROM users WHERE COALESCE(last_upload_at, updated_at) < ?`).bind(cutoff),
  ]);
}

/* ---------------- router ---------------- */

async function route(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/, '');
  if (path === '/v1/health') return json({ ok: true });
  if (path === '/v1/auth/apple' && req.method === 'POST') {
    const { identityToken } = await body<{ identityToken?: string }>(req);
    if (!identityToken) throw new HttpError(400, 'Missing Apple identity token.');
    return json({ session: await issueSession(env, await appleUserId(env, identityToken)) });
  }

  const id = await userId(req, env);
  if (path === '/v1/me') {
    if (req.method === 'GET') return json(await getMe(env, id));
    if (req.method === 'PUT') return json(await putProfile(env, id, await body<ProfileInput>(req)));
    if (req.method === 'DELETE') {
      const { appleAuthorizationCode } = await body<{ appleAuthorizationCode?: string }>(req, true);
      const result = await deleteMe(env, id);
      return json({ ...result, appleRevoked: await revokeApple(env, appleAuthorizationCode) });
    }
  }
  if (path === '/v1/names/check' && req.method === 'GET') {
    const name = url.searchParams.get('name') ?? '';
    const error = validateName(name);
    if (error) return json({ available: false, error });
    const taken = await env.DB.prepare('SELECT id FROM users WHERE name_key = ? AND id != ?').bind(name.trim().toLowerCase(), id).first();
    return json({ available: !taken, error: taken ? 'That name is taken.' : null });
  }
  if (path === '/v1/scores' && req.method === 'PUT') return json(await putScores(env, id, await body<ScoresUpload>(req)));
  if (path.startsWith('/v1/boards/') && req.method === 'GET') {
    const b = decodeURIComponent(path.slice('/v1/boards/'.length));
    const f = (url.searchParams.get('filter') ?? 'all') as Filter;
    if (!isBoard(b) || !FILTERS.includes(f)) throw new HttpError(404, 'Unknown board.');
    return json(await board(env, id, b, f));
  }
  if (path === '/v1/friends') {
    if (req.method === 'GET') return json(await listFriends(env, id));
    if (req.method === 'POST') return json(await addFriend(env, id, (await body<{ code: string }>(req)).code));
    if (req.method === 'DELETE') return json(await removeFriend(env, id, url.searchParams.get('name') ?? ''));
  }
  throw new HttpError(404, 'Not found.');
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const cors = corsHeaders(req.headers.get('origin'));
    if (req.method === 'OPTIONS') return new Response(null, { status: cors['access-control-allow-origin'] ? 204 : 403, headers: cors });
    let res: Response;
    try {
      res = await route(req, env);
    } catch (e) {
      if (e instanceof HttpError) res = json({ error: e.message }, e.status);
      else {
        console.error(e);
        res = json({ error: 'Something went wrong. Try again shortly.' }, 500);
      }
    }
    for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
    return res;
  },
  async scheduled(_event: ScheduledController, env: Env): Promise<void> {
    await deleteInactive(env);
    await refreshHistograms(env);
  },
} satisfies ExportedHandler<Env>;
