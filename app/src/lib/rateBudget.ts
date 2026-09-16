/**
 * Client-side quota tracking for free AI tiers, so requests go to a model that still has room
 * instead of failing with 429s.
 */

export interface ModelLimits {
  rpm: number;
  rpd: number;
  /** Tokens per minute; omitted when the provider's limit is generous enough to ignore. */
  tpm?: number;
}

export interface ModelUsage {
  /** Request timestamps (ms) within the last minute, with the tokens each one used. */
  recent: { at: number; tokens: number }[];
  day: string;
  dayCount: number;
  /** No requests before this time (ms), set after a 429 or when the daily quota is gone. */
  blockedUntil: number;
  /** Remaining requests reported by the provider, when it tells us. */
  remainingToday?: number;
}

export const emptyUsage = (): ModelUsage => ({ recent: [], day: '', dayCount: 0, blockedUntil: 0 });

/** Second Sunday of March to first Sunday of November, 02:00 local (US rules). */
function pacificOffsetHours(utcMs: number): number {
  const d = new Date(utcMs);
  const y = d.getUTCFullYear();
  const nthSunday = (month: number, n: number) => {
    const first = new Date(Date.UTC(y, month, 1)).getUTCDay();
    return 1 + ((7 - first) % 7) + (n - 1) * 7;
  };
  const dstStart = Date.UTC(y, 2, nthSunday(2, 2), 10); // 02:00 PST = 10:00 UTC
  const dstEnd = Date.UTC(y, 10, nthSunday(10, 1), 9); // 02:00 PDT = 09:00 UTC
  return utcMs >= dstStart && utcMs < dstEnd ? -7 : -8;
}

/** Calendar day in Pacific time, where Google resets daily quotas. */
export function pacificDay(utcMs: number): string {
  return new Date(utcMs + pacificOffsetHours(utcMs) * 3600_000).toISOString().slice(0, 10);
}

/** The next midnight Pacific time, in ms. */
export function nextPacificMidnight(utcMs: number): number {
  const day = pacificDay(utcMs);
  const midnightLocal = Date.parse(`${day}T00:00:00Z`) + 86400_000;
  // Offset at the moment just after midnight decides the UTC time.
  const offset = pacificOffsetHours(midnightLocal + 8 * 3600_000);
  return midnightLocal - offset * 3600_000;
}

function roll(u: ModelUsage, now: number, day: string): ModelUsage {
  const recent = u.recent.filter((r) => now - r.at < 60_000);
  return u.day === day ? { ...u, recent } : { ...u, recent, day, dayCount: 0, remainingToday: undefined };
}

/** Milliseconds to wait before this model can take a request of `tokens`, or Infinity for today. */
export function waitMs(u: ModelUsage, limits: ModelLimits, now: number, day: string, tokens: number): number {
  const s = roll(u, now, day);
  if (s.blockedUntil > now) return s.blockedUntil - now;
  if (s.dayCount >= limits.rpd || s.remainingToday === 0) return Infinity;
  let wait = 0;
  if (s.recent.length >= limits.rpm) wait = Math.max(wait, 60_000 - (now - s.recent[s.recent.length - limits.rpm].at));
  if (limits.tpm) {
    let used = s.recent.reduce((a, r) => a + r.tokens, 0);
    // Free tokens as the oldest requests leave the window.
    for (let i = 0; used + tokens > limits.tpm && i < s.recent.length; i++) {
      used -= s.recent[i].tokens;
      wait = Math.max(wait, 60_000 - (now - s.recent[i].at));
    }
    if (tokens > limits.tpm) return Infinity;
  }
  return wait;
}

export function recordUse(u: ModelUsage, now: number, day: string, tokens: number): ModelUsage {
  const s = roll(u, now, day);
  return { ...s, recent: [...s.recent, { at: now, tokens }], dayCount: s.dayCount + 1, remainingToday: s.remainingToday != null ? Math.max(0, s.remainingToday - 1) : undefined };
}

export function block(u: ModelUsage, until: number): ModelUsage {
  return { ...u, blockedUntil: Math.max(u.blockedUntil, until) };
}

/** Rough token count for budgeting: ~4 characters per token. */
export const estimateTokens = (text: string) => Math.ceil(text.length / 4);

/** Parses "30s", "1.5s", "2m", "7m12.5s" or plain seconds into ms. */
export function parseDelay(value: string | null | undefined): number | null {
  if (!value) return null;
  const v = value.trim();
  if (/^\d+(\.\d+)?$/.test(v)) return Number(v) * 1000;
  const m = /^(?:(\d+(?:\.\d+)?)h)?(?:(\d+(?:\.\d+)?)m(?!s))?(?:(\d+(?:\.\d+)?)s)?(?:(\d+(?:\.\d+)?)ms)?$/.exec(v);
  if (!m || !v) return null;
  const [, h, min, s, ms] = m;
  return (Number(h ?? 0) * 3600 + Number(min ?? 0) * 60 + Number(s ?? 0)) * 1000 + Number(ms ?? 0);
}
