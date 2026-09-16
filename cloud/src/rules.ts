/** Leaderboard buckets and upload validation. Pure, shared by the Worker and its tests. */

export type Sex = 'male' | 'female';

export const GROUPS = ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'quads', 'hamstrings', 'glutes', 'calves', 'core'] as const;
export const DISTANCES = ['1k', '1mi', '5k', '10k', 'half', 'marathon'] as const;

export type Board = 'physique' | 'run' | `group:${(typeof GROUPS)[number]}` | `run:${(typeof DISTANCES)[number]}`;

export const BOARDS: Board[] = ['physique', 'run', ...GROUPS.map((g) => `group:${g}` as Board), ...DISTANCES.map((d) => `run:${d}` as Board)];

export const isBoard = (b: string): b is Board => (BOARDS as string[]).includes(b);

/** World-best reference times (seconds); nothing faster is accepted. */
export const WORLD_BEST: Record<(typeof DISTANCES)[number], Record<Sex, number>> = {
  '1k': { male: 132, female: 149 },
  '1mi': { male: 223, female: 248 },
  '5k': { male: 769, female: 853 },
  '10k': { male: 1584, female: 1734 },
  half: { male: 3451, female: 3772 },
  marathon: { male: 7235, female: 7796 },
};

export function ageGroup(age: number): string {
  if (age < 20) return 'u20';
  if (age >= 60) return '60+';
  const d = Math.floor(age / 10) * 10;
  return `${d}-${d + 9}`;
}

const WEIGHT_CLASSES: Record<Sex, number[]> = {
  male: [59, 66, 74, 83, 93, 105, 120],
  female: [47, 52, 57, 63, 69, 76, 84],
};

/** IPF weight classes, e.g. "83" (up to 83 kg) or "120+". */
export function weightClass(sex: Sex, kg: number): string {
  const classes = WEIGHT_CLASSES[sex];
  const hit = classes.find((c) => kg <= c);
  return hit ? String(hit) : `${classes[classes.length - 1]}+`;
}

/** 5 cm bands, e.g. "175" for 175–179 cm. */
export const heightBand = (cm: number) => String(Math.floor(cm / 5) * 5);

export interface ProfileInput {
  displayName: string;
  country: string | null;
  sex: Sex;
  age: number;
  weightKg: number;
  heightCm: number;
}

const BANNED = ['admin', 'metakai', 'moderator', 'fuck', 'shit', 'cunt', 'nigg', 'fag', 'rape', 'nazi', 'hitler', 'whore', 'slut', 'bitch', 'dick', 'pussy', 'porn'];

export function validateName(raw: string): string | null {
  const name = raw.trim().replace(/\s+/g, ' ');
  if (name.length < 3 || name.length > 20) return 'Names are 3–20 characters.';
  if (!/^[\p{L}\p{N} _.-]+$/u.test(name)) return 'Use letters, numbers, spaces, dots, dashes or underscores.';
  const flat = name.toLowerCase().replace(/[^a-z]/g, '').replace(/0/g, 'o');
  if (BANNED.some((w) => flat.includes(w))) return 'Please choose a different name.';
  return null;
}

export function validateProfile(p: ProfileInput): string | null {
  const nameError = validateName(p.displayName);
  if (nameError) return nameError;
  if (p.sex !== 'male' && p.sex !== 'female') return 'Invalid sex.';
  if (!(p.age >= 13 && p.age <= 100)) return 'Invalid age.';
  if (!(p.weightKg >= 30 && p.weightKg <= 300)) return 'Invalid weight.';
  if (!(p.heightCm >= 120 && p.heightCm <= 230)) return 'Invalid height.';
  if (p.country != null && !/^[A-Z]{2}$/.test(p.country)) return 'Invalid country.';
  return null;
}

export interface GroupUpload {
  score: number;
  /** Best lift ÷ untrained average. */
  multiple: number;
  /** Sessions logged for that lift in the ranking window. */
  sessions: number;
}

export interface RunUpload {
  timeSec: number;
  ageGrade: number;
  /** Recorded with GPS. */
  verified: boolean;
}

export interface ScoresUpload {
  physique?: { overall: number; groups: Partial<Record<(typeof GROUPS)[number], GroupUpload>> };
  run?: { overall: number; efforts: Partial<Record<(typeof DISTANCES)[number], RunUpload>> };
}

export interface ScoreRow {
  board: Board;
  score: number;
  /** Display value, e.g. a run time. */
  value: number | null;
}

export const MIN_SESSIONS = 3;
export const MAX_MULTIPLE = 4;

const inRange = (n: unknown, lo: number, hi: number): n is number => typeof n === 'number' && Number.isFinite(n) && n >= lo && n <= hi;

/** Turns an upload into board rows, dropping anything implausible or unverified. */
export function scoreRows(u: ScoresUpload, sex: Sex): ScoreRow[] {
  const rows: ScoreRow[] = [];
  if (u.physique) {
    let anyGroup = false;
    for (const g of GROUPS) {
      const x = u.physique.groups?.[g];
      if (!x || !inRange(x.score, 0, 100) || !inRange(x.multiple, 0, MAX_MULTIPLE) || !inRange(x.sessions, MIN_SESSIONS, 10_000)) continue;
      rows.push({ board: `group:${g}`, score: x.score, value: x.multiple });
      anyGroup = true;
    }
    if (anyGroup && inRange(u.physique.overall, 0, 100)) rows.push({ board: 'physique', score: u.physique.overall, value: null });
  }
  if (u.run) {
    let anyRun = false;
    for (const d of DISTANCES) {
      const x = u.run.efforts?.[d];
      if (!x || x.verified !== true || !inRange(x.ageGrade, 1, 100) || !inRange(x.timeSec, WORLD_BEST[d][sex] * 0.98, 24 * 3600)) continue;
      rows.push({ board: `run:${d}`, score: x.ageGrade, value: Math.round(x.timeSec) });
      anyRun = true;
    }
    if (anyRun && inRange(u.run.overall, 0, 100)) rows.push({ board: 'run', score: u.run.overall, value: null });
  }
  return rows;
}

/** Points a score may rise per upload before it is held for review. */
export const JUMP_LIMIT = 25;
export const HOLD_DAYS = 7;

/**
 * A score that jumps suspiciously is held until a later upload confirms it.
 * Returns the hold expiry (ISO) or null.
 */
export function holdUntil(previous: { score: number; heldUntil: string | null } | null, next: number, nowMs: number): string | null {
  if (!previous) return next > 60 ? new Date(nowMs + HOLD_DAYS * 86400_000).toISOString() : null;
  if (previous.heldUntil && Date.parse(previous.heldUntil) > nowMs) return previous.heldUntil;
  return next - previous.score > JUMP_LIMIT ? new Date(nowMs + HOLD_DAYS * 86400_000).toISOString() : null;
}

export type Filter = 'all' | 'sex' | 'age' | 'weight' | 'height' | 'country' | 'friends';
export const FILTERS: Filter[] = ['all', 'sex', 'age', 'weight', 'height', 'country', 'friends'];

/** Percent of people you rank above, 0–100. */
export const percentile = (rank: number, total: number) => (total <= 1 ? 100 : Math.round(((total - rank) / (total - 1)) * 1000) / 10);

/** Ten-bucket histogram of scores 0–100. */
export function histogram(scores: number[]): number[] {
  const bins = new Array(10).fill(0);
  for (const s of scores) bins[Math.min(9, Math.max(0, Math.floor(s / 10)))]++;
  return bins;
}
