import type { CardioKind } from './cardio';
import { dateKey } from './dates';

/**
 * Pure helpers for watch and health-app data: Bluetooth heart rate packets, sleep totals,
 * heart rate summaries and mapping activity types from Health Connect and Apple Health.
 */

/**
 * Parses a Bluetooth Heart Rate Measurement (characteristic 0x2A37).
 * Byte 0 is flags; bit 0 set means the rate is a little-endian uint16, otherwise a uint8.
 */
export function parseHeartRate(bytes: ArrayLike<number>): number | null {
  if (bytes.length < 2) return null;
  const wide = (bytes[0] & 0x01) === 1;
  if (wide && bytes.length < 3) return null;
  const bpm = wide ? bytes[1] | (bytes[2] << 8) : bytes[1];
  return bpm > 0 && bpm < 255 ? bpm : null;
}

/** Decodes base64 (as BLE libraries deliver characteristic values) into bytes. */
export function base64Bytes(b64: string): number[] {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, '');
  const out: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const ch of clean) {
    buffer = (buffer << 6) | alphabet.indexOf(ch);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((buffer >> bits) & 0xff);
    }
  }
  return out;
}

/** Average and peak of heart rate samples, ignoring anything outside a human range. */
export function heartRateStats(samples: number[]): { avg: number; max: number } | null {
  const valid = samples.filter((b) => b >= 30 && b <= 230);
  if (valid.length === 0) return null;
  return { avg: Math.round(valid.reduce((a, b) => a + b, 0) / valid.length), max: Math.max(...valid) };
}

export type SleepStage = 'deep' | 'rem' | 'light' | 'asleep' | 'awake';

export interface SleepInterval {
  start: number;
  end: number;
  /** Stages inside the session; when missing, the whole session counts as sleep. */
  stages?: { start: number; end: number; stage: SleepStage }[];
  /** App that recorded it (a package name or bundle ID). */
  origin?: string | null;
}

/** One night of sleep from one app. Stage minutes are null when the app doesn't record stages. */
export interface SleepNight {
  dateKey: string;
  origin: string | null;
  asleepMin: number;
  deepMin: number | null;
  remMin: number | null;
  lightMin: number | null;
  awakeMin: number | null;
  start: number;
  end: number;
}

/** The morning a sleep belongs to: a sleep ending after 6 pm counts toward the next morning. */
function nightKey(end: number): string {
  const d = new Date(end);
  return d.getHours() >= 18 ? dateKey(new Date(end + 12 * 3600_000)) : dateKey(d);
}

/** Total length of possibly overlapping intervals, in minutes. */
function unionMinutes(parts: [number, number][]): number {
  const sorted = parts.filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
  let total = 0;
  let cur: [number, number] | null = null;
  for (const [a, b] of sorted) {
    if (cur && a <= cur[1]) cur[1] = Math.max(cur[1], b);
    else {
      if (cur) total += cur[1] - cur[0];
      cur = [a, b];
    }
  }
  if (cur) total += cur[1] - cur[0];
  return total / 60000;
}

function summarize(day: string, origin: string | null, sessions: SleepInterval[]): SleepNight {
  // Only apps that split sleep into deep, REM and light report stages; plain "asleep" doesn't count.
  const staged = sessions.some((s) => s.stages?.some((p) => p.stage === 'deep' || p.stage === 'rem' || p.stage === 'light'));
  const asleep: [number, number][] = [];
  const minutes: Record<SleepStage, number> = { deep: 0, rem: 0, light: 0, asleep: 0, awake: 0 };
  for (const s of sessions) {
    if (s.stages?.length) {
      for (const p of s.stages) {
        if (p.end <= p.start) continue;
        minutes[p.stage] += (p.end - p.start) / 60000;
        if (p.stage !== 'awake') asleep.push([p.start, p.end]);
      }
    } else {
      asleep.push([s.start, s.end]);
    }
  }
  return {
    dateKey: day,
    origin,
    asleepMin: Math.round(unionMinutes(asleep)),
    deepMin: staged ? Math.round(minutes.deep) : null,
    remMin: staged ? Math.round(minutes.rem) : null,
    // Sleep that a device doesn't split into stages counts as light sleep.
    lightMin: staged ? Math.round(minutes.light + minutes.asleep) : null,
    awakeMin: staged ? Math.round(minutes.awake) : null,
    start: Math.min(...sessions.map((s) => s.start)),
    end: Math.max(...sessions.map((s) => s.end)),
  };
}

/**
 * One night per morning, each from a single app so two devices never double a night: the
 * preferred app when it recorded that night, otherwise the app with sleep stages and the most sleep.
 * Several sessions from the same app (a night and a nap) add up.
 */
export function sleepNights(sessions: SleepInterval[], preferred?: string | null): SleepNight[] {
  const byDay = new Map<string, Map<string, SleepInterval[]>>();
  for (const s of sessions) {
    if (s.end <= s.start) continue;
    const day = nightKey(s.end);
    const origin = s.origin ?? '';
    if (!byDay.has(day)) byDay.set(day, new Map());
    const byOrigin = byDay.get(day)!;
    byOrigin.set(origin, [...(byOrigin.get(origin) ?? []), s]);
  }
  const nights: SleepNight[] = [];
  for (const [day, byOrigin] of byDay) {
    const candidates = [...byOrigin].map(([origin, list]) => summarize(day, origin || null, list));
    const pinned = preferred ? candidates.find((c) => c.origin === preferred) : undefined;
    const score = (n: SleepNight) => (n.deepMin != null ? 100_000 : 0) + n.asleepMin;
    nights.push(pinned ?? candidates.sort((a, b) => score(b) - score(a))[0]);
  }
  return nights.sort((a, b) => a.dateKey.localeCompare(b.dateKey));
}

/** Hours slept for each night, keyed by the morning you woke up. */
export function sleepHoursByDay(sessions: SleepInterval[], preferred?: string | null): Record<string, number> {
  return Object.fromEntries(sleepNights(sessions, preferred).map((n) => [n.dateKey, Math.round((n.asleepMin / 60) * 10) / 10]));
}

export interface OriginSample {
  at: number;
  value: number;
  origin?: string | null;
}

/** The app to read a metric from: the chosen one when it has data, otherwise the one with the most readings. */
export function pickOrigin(samples: { origin?: string | null }[], preferred?: string | null): string | null {
  const counts = new Map<string, number>();
  for (const s of samples) counts.set(s.origin ?? '', (counts.get(s.origin ?? '') ?? 0) + 1);
  if (preferred && counts.has(preferred)) return preferred;
  const best = [...counts].sort((a, b) => b[1] - a[1])[0];
  return best ? best[0] || null : null;
}

export interface DailyValue {
  value: number;
  origin: string | null;
}

/**
 * Daily averages with each day taken from a single app, so two devices' readings never blend:
 * the chosen app when it has readings that day, otherwise the app with the most readings overall.
 */
export function dailyAverageFrom(samples: OriginSample[], preferred?: string | null): Record<string, DailyValue> {
  const counts = new Map<string, number>();
  const byDay = new Map<string, Map<string, number[]>>();
  for (const s of samples) {
    if (!Number.isFinite(s.value)) continue;
    const origin = s.origin ?? '';
    const day = dateKey(new Date(s.at));
    counts.set(origin, (counts.get(origin) ?? 0) + 1);
    if (!byDay.has(day)) byDay.set(day, new Map());
    const values = byDay.get(day)!;
    values.set(origin, [...(values.get(origin) ?? []), s.value]);
  }
  const rank = [...counts].sort((a, b) => b[1] - a[1]).map(([o]) => o);
  if (preferred && counts.has(preferred)) rank.unshift(preferred);
  const out: Record<string, DailyValue> = {};
  for (const [day, values] of byDay) {
    const origin = rank.find((o) => values.has(o))!;
    const v = values.get(origin)!;
    out[day] = { value: Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10, origin: origin || null };
  }
  return out;
}

/** Health Connect ExerciseSessionRecord exercise types that map to a cardio kind. */
const HEALTH_CONNECT_KINDS: Record<number, CardioKind> = {
  56: 'run', // RUNNING
  57: 'run', // RUNNING_TREADMILL
  79: 'walk', // WALKING
  37: 'hike', // HIKING
  8: 'cycle', // BIKING
  9: 'cycle', // BIKING_STATIONARY
  53: 'row', // ROWING
  54: 'row', // ROWING_MACHINE
  73: 'swim', // SWIMMING_OPEN_WATER
  74: 'swim', // SWIMMING_POOL
  25: 'elliptical', // ELLIPTICAL
  68: 'stairs', // STAIR_CLIMBING
  69: 'stairs', // STAIR_CLIMBING_MACHINE
  36: 'hiit', // HIGH_INTENSITY_INTERVAL_TRAINING
  10: 'hiit', // BOOT_CAMP
  2: 'sport', // BADMINTON
  5: 'sport', // BASKETBALL
  11: 'sport', // BOXING
  16: 'sport', // DANCING
  44: 'sport', // MARTIAL_ARTS
  64: 'sport', // SOCCER
  66: 'sport', // SQUASH
  75: 'sport', // TABLE_TENNIS
  76: 'sport', // TENNIS
  78: 'sport', // VOLLEYBALL
};

/** Apple Health HKWorkoutActivityType values that map to a cardio kind. */
const APPLE_KINDS: Record<number, CardioKind> = {
  37: 'run', // running
  52: 'walk', // walking
  24: 'hike', // hiking
  13: 'cycle', // cycling
  35: 'row', // rowing
  46: 'swim', // swimming
  16: 'elliptical', // elliptical
  44: 'stairs', // stairClimbing
  68: 'stairs', // stairs
  63: 'hiit', // highIntensityIntervalTraining
  73: 'hiit', // mixedCardio
  11: 'hiit', // crossTraining
  4: 'sport', // badminton
  6: 'sport', // basketball
  8: 'sport', // boxing
  41: 'sport', // soccer
  43: 'sport', // squash
  47: 'sport', // tableTennis
  48: 'sport', // tennis
  51: 'sport', // volleyball
  77: 'sport', // cardioDance
  28: 'sport', // martialArts
};

/**
 * Cardio kind for a watch workout, or null for strength and anything Metakai logs itself
 * (lifting, yoga, stretching), so imports never duplicate the gym logger.
 */
export function cardioKindFor(platform: 'health_connect' | 'apple_health', type: number): CardioKind | null {
  return (platform === 'health_connect' ? HEALTH_CONNECT_KINDS : APPLE_KINDS)[type] ?? null;
}

/** Non-cardio watch sessions: they count toward training load and link to Metakai workouts. */
const HEALTH_CONNECT_OTHER: Record<number, { label: string; strength: boolean }> = {
  70: { label: 'Strength training', strength: true }, // STRENGTH_TRAINING
  81: { label: 'Weightlifting', strength: true }, // WEIGHTLIFTING
  13: { label: 'Calisthenics', strength: true }, // CALISTHENICS
  83: { label: 'Yoga', strength: false }, // YOGA
  48: { label: 'Pilates', strength: false }, // PILATES
  71: { label: 'Stretching', strength: false }, // STRETCHING
  26: { label: 'Exercise class', strength: false }, // EXERCISE_CLASS
  0: { label: 'Workout', strength: false }, // OTHER_WORKOUT
};

const APPLE_OTHER: Record<number, { label: string; strength: boolean }> = {
  50: { label: 'Strength training', strength: true }, // traditionalStrengthTraining
  20: { label: 'Functional strength', strength: true }, // functionalStrengthTraining
  59: { label: 'Core training', strength: true }, // coreTraining
  57: { label: 'Yoga', strength: false }, // yoga
  66: { label: 'Pilates', strength: false }, // pilates
  62: { label: 'Flexibility', strength: false }, // flexibility
  58: { label: 'Barre', strength: false }, // barre
  72: { label: 'Tai chi', strength: false }, // taiChi
  29: { label: 'Mind and body', strength: false }, // mindAndBody
  3000: { label: 'Workout', strength: false }, // other
};

export interface WatchSession {
  kind: CardioKind;
  /** Name for sessions that aren't a cardio kind, like "Strength training". */
  label: string | null;
  strength: boolean;
}

/** How a watch workout is stored: a cardio kind, or 'other' with a label. Null for types Metakai skips. */
export function watchSessionFor(platform: 'health_connect' | 'apple_health', type: number): WatchSession | null {
  const cardio = cardioKindFor(platform, type);
  if (cardio) return { kind: cardio, label: null, strength: false };
  const other = (platform === 'health_connect' ? HEALTH_CONNECT_OTHER : APPLE_OTHER)[type];
  return other ? { kind: 'other', label: other.label, strength: other.strength } : null;
}

/** Health Connect exercise type for writing a session from Metakai. */
export function healthConnectTypeFor(kind: CardioKind | 'strength'): number {
  if (kind === 'strength') return 70; // STRENGTH_TRAINING
  const match = Object.entries(HEALTH_CONNECT_KINDS).find(([, k]) => k === kind);
  return match ? Number(match[0]) : 0; // OTHER_WORKOUT
}

/** Apple Health workout activity type for writing a session from Metakai. */
export function appleTypeFor(kind: CardioKind | 'strength'): number {
  if (kind === 'strength') return 50; // traditionalStrengthTraining
  const match = Object.entries(APPLE_KINDS).find(([, k]) => k === kind);
  return match ? Number(match[0]) : 3000; // other
}

/** Average of values grouped by local day. */
export function dailyAverage(samples: { at: number; value: number }[]): Record<string, number> {
  const sums: Record<string, { total: number; n: number }> = {};
  for (const s of samples) {
    const k = dateKey(new Date(s.at));
    sums[k] = { total: (sums[k]?.total ?? 0) + s.value, n: (sums[k]?.n ?? 0) + 1 };
  }
  return Object.fromEntries(Object.entries(sums).map(([k, v]) => [k, Math.round(v.total / v.n)]));
}
