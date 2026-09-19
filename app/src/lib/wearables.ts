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

export interface SleepInterval {
  start: number;
  end: number;
  /** Stages inside the session; when missing, the whole session counts as sleep. */
  stages?: { start: number; end: number; asleep: boolean }[];
}

/**
 * Hours slept for each night, keyed by the day the sleep ended (the morning you wake up).
 * Overlapping sessions from different apps are merged so a night is never counted twice.
 */
export function sleepHoursByDay(sessions: SleepInterval[]): Record<string, number> {
  const asleep: [number, number][] = [];
  for (const s of sessions) {
    const parts = s.stages?.length ? s.stages.filter((p) => p.asleep).map((p) => [p.start, p.end] as [number, number]) : [[s.start, s.end] as [number, number]];
    asleep.push(...parts.filter(([a, b]) => b > a));
  }
  asleep.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const [a, b] of asleep) {
    const last = merged[merged.length - 1];
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else merged.push([a, b]);
  }
  const out: Record<string, number> = {};
  for (const [a, b] of merged) {
    // A nap after 6 pm belongs to the next morning's night; anything else to the day it ends.
    const end = new Date(b);
    const key = end.getHours() >= 18 ? dateKey(new Date(b + 12 * 3600_000)) : dateKey(end);
    out[key] = (out[key] ?? 0) + (b - a) / 3600_000;
  }
  for (const k of Object.keys(out)) out[k] = Math.round(out[k] * 10) / 10;
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
