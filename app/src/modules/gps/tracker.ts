import * as Speech from 'expo-speech';
import { create } from 'zustand';

import { getDb } from '../../core/db/database';
import { useSettings } from '../../core/store/settings';
import Storage from '../../core/store/kv';
import { acceptPoint, distanceM, MAX_ACCURACY_M, MOVING_SPEED, type GeoPoint, type TrackKind } from '../../lib/geo';
import { ensureLocationPermission, onFixes, startTracking, stopTracking, watchFixes, type Fix } from './location';

/**
 * GPS recording. Fixes arrive from a foreground service (so tracking continues with the screen
 * off), are filtered, written to the local gps_live table and folded into running totals.
 * The totals live in key-value storage so a recording survives the app being closed.
 */
const STATE_KEY = 'metakai.gpsLive';
const MI = 1609.344;
/** Window for "current pace". */
const CURRENT_WINDOW_SEC = 30;
/** Altitude changes smaller than this are noise. */
const CLIMB_THRESHOLD_M = 4;

export type RecordStatus = 'idle' | 'recording' | 'paused' | 'finished';

export interface LiveState {
  status: RecordStatus;
  kind: TrackKind;
  startedAt: number;
  pausedMs: number;
  pausedAt: number | null;
  endedAt: number | null;
  segment: number;
  last: GeoPoint | null;
  distanceM: number;
  movingSec: number;
  gainM: number;
  altRef: number | null;
  nextCueM: number;
  lastCueSec: number;
  /** Most recent fix, accepted or not, for the signal indicator. */
  fixAt: number | null;
  fixAcc: number | null;
  recent: { d: number; dt: number; at: number }[];
}

const IDLE: LiveState = {
  status: 'idle',
  kind: 'run',
  startedAt: 0,
  pausedMs: 0,
  pausedAt: null,
  endedAt: null,
  segment: 0,
  last: null,
  distanceM: 0,
  movingSec: 0,
  gainM: 0,
  altRef: null,
  nextCueM: 1000,
  lastCueSec: 0,
  fixAt: null,
  fixAcc: null,
  recent: [],
};

function load(): LiveState {
  try {
    const raw = Storage.getItemSync(STATE_KEY);
    return raw ? { ...IDLE, ...JSON.parse(raw) } : IDLE;
  } catch {
    return IDLE;
  }
}

/** Live totals for the UI. `route` holds points added this session, for drawing. */
export const useLive = create<LiveState & { route: [number, number][] }>(() => ({ ...load(), route: [] }));

function save(s: LiveState) {
  try {
    Storage.setItemSync(STATE_KEY, JSON.stringify(s));
  } catch {
    // Best-effort; the points themselves are in SQLite.
  }
  useLive.setState(s);
}

const cueUnitM = () => (useSettings.getState().units === 'metric' ? 1000 : MI);

function speakSplit(s: LiveState) {
  if (!useSettings.getState().gpsVoice) return;
  const metric = useSettings.getState().units === 'metric';
  const unit = cueUnitM();
  const count = Math.round(s.distanceM / unit);
  const splitSec = s.movingSec - s.lastCueSec;
  const avgPer = (s.movingSec / s.distanceM) * unit;
  const words = (sec: number) => {
    const m = Math.floor(sec / 60);
    const r = Math.round(sec % 60);
    return `${m} ${m === 1 ? 'minute' : 'minutes'}${r ? ` ${r} seconds` : ''}`;
  };
  const name = metric ? (count === 1 ? 'kilometre' : 'kilometres') : count === 1 ? 'mile' : 'miles';
  const text =
    s.kind === 'cycle'
      ? `${count} ${name}. Average speed ${Math.round((s.distanceM / s.movingSec) * (metric ? 3.6 : 2.23694))} ${metric ? 'kilometres' : 'miles'} per hour.`
      : `${count} ${name}. Split ${words(splitSec)}. Average pace ${words(avgPer)}.`;
  Speech.speak(text, { rate: 1.0 });
}

function ingest(fixes: Fix[]) {
  const s = load();
  const route: [number, number][] = [];
  for (const fix of fixes) {
    const p: GeoPoint = {
      lat: fix.lat,
      lon: fix.lon,
      t: fix.t,
      acc: fix.accuracy,
      alt: fix.alt != null && (fix.altAccuracy ?? 99) <= 15 ? fix.alt : null,
    };
    s.fixAt = p.t;
    s.fixAcc = p.acc ?? null;
    if (s.status !== 'recording' || !acceptPoint(s.last, p, s.kind)) continue;

    getDb().runSync('INSERT INTO gps_live (segment, lat, lon, alt, acc, t) VALUES (?, ?, ?, ?, ?, ?)', [s.segment, p.lat, p.lon, p.alt ?? null, p.acc ?? null, p.t]);
    route.push([p.lat, p.lon]);
    if (s.last) {
      const d = distanceM(s.last, p);
      const dt = (p.t - s.last.t) / 1000;
      s.distanceM += d;
      if (dt > 0 && d / dt >= MOVING_SPEED[s.kind]) s.movingSec += dt;
      s.recent = [...s.recent, { d, dt, at: p.t }].filter((r) => p.t - r.at <= CURRENT_WINDOW_SEC * 1000);
    }
    if (p.alt != null) {
      if (s.altRef == null) s.altRef = p.alt;
      else if (p.alt - s.altRef >= CLIMB_THRESHOLD_M) {
        s.gainM += p.alt - s.altRef;
        s.altRef = p.alt;
      } else if (s.altRef - p.alt >= CLIMB_THRESHOLD_M) s.altRef = p.alt;
    }
    s.last = p;
    if (s.distanceM >= s.nextCueM) {
      speakSplit(s);
      s.lastCueSec = s.movingSec;
      s.nextCueM += cueUnitM();
    }
  }
  save(s);
  if (route.length) useLive.setState((st) => ({ route: [...st.route, ...route] }));
}

onFixes(ingest);

/* ---------------- controls ---------------- */

export type Readiness = 'ok' | 'denied' | 'services-off';

export const ensurePermission = ensureLocationPermission;

export async function startRecording(kind: TrackKind) {
  getDb().runSync('DELETE FROM gps_live');
  const s: LiveState = { ...IDLE, status: 'recording', kind, startedAt: Date.now(), nextCueM: cueUnitM(), fixAt: useLive.getState().fixAt, fixAcc: useLive.getState().fixAcc };
  save(s);
  useLive.setState({ route: [] });
  await startTracking(kind);
  if (useSettings.getState().gpsVoice) Speech.speak(`${kind === 'cycle' ? 'Ride' : kind[0].toUpperCase() + kind.slice(1)} started`);
}

export function pauseRecording() {
  const s = load();
  if (s.status !== 'recording') return;
  save({ ...s, status: 'paused', pausedAt: Date.now() });
}

export async function resumeRecording() {
  const s = load();
  if (s.status !== 'paused') return;
  // A new segment, so the gap while paused isn't counted as distance.
  save({ ...s, status: 'recording', pausedMs: s.pausedMs + (Date.now() - (s.pausedAt ?? Date.now())), pausedAt: null, segment: s.segment + 1, last: null, recent: [] });
  await startTracking(s.kind);
}

export async function finishRecording() {
  const s = load();
  await stopTracking();
  const end = s.pausedAt ?? Date.now();
  save({ ...s, status: 'finished', endedAt: end, pausedAt: null });
}

export async function discardRecording() {
  await stopTracking();
  getDb().runSync('DELETE FROM gps_live');
  save(IDLE);
  useLive.setState({ route: [] });
}

/** Called after the activity is saved. */
export function clearRecording() {
  getDb().runSync('DELETE FROM gps_live');
  save(IDLE);
  useLive.setState({ route: [] });
}

/** Resumes the service if the app was restarted mid-recording, and reloads the route for drawing. */
export async function restoreRecording() {
  const s = load();
  useLive.setState({ ...s, route: loadSegments().flat().map((p) => [p.lat, p.lon] as [number, number]) });
  if (s.status === 'recording') await startTracking(s.kind).catch(() => {});
}

export function loadSegments(): GeoPoint[][] {
  const rows = getDb().getAllSync<{ segment: number; lat: number; lon: number; alt: number | null; acc: number | null; t: number }>('SELECT * FROM gps_live ORDER BY seq');
  const out: GeoPoint[][] = [];
  let current = -1;
  for (const r of rows) {
    if (r.segment !== current) {
      out.push([]);
      current = r.segment;
    }
    out[out.length - 1].push({ lat: r.lat, lon: r.lon, alt: r.alt, acc: r.acc, t: r.t });
  }
  return out;
}

/** Elapsed time excluding manual pauses, seconds. */
export function elapsedSec(s: Pick<LiveState, 'status' | 'startedAt' | 'pausedMs' | 'pausedAt' | 'endedAt'>, now = Date.now()): number {
  if (s.status === 'idle') return 0;
  const end = s.endedAt ?? s.pausedAt ?? now;
  return Math.max(0, (end - s.startedAt - s.pausedMs) / 1000);
}

/** Pace over the last 30 seconds, seconds per metre, or null while stopped. */
export function currentSecPerM(s: Pick<LiveState, 'recent' | 'kind'>, now = Date.now()): number | null {
  const lastAt = s.recent[s.recent.length - 1]?.at;
  if (lastAt == null || now - lastAt > 10_000) return null;
  const d = s.recent.reduce((a, r) => a + r.d, 0);
  const dt = s.recent.reduce((a, r) => a + r.dt, 0);
  if (d < 10 || dt <= 0 || d / dt < MOVING_SPEED[s.kind]) return null;
  return dt / d;
}

export const signalQuality = (acc: number | null, at: number | null, now = Date.now()): 'none' | 'weak' | 'good' =>
  acc == null || at == null || now - at > 15_000 ? 'none' : acc <= 10 ? 'good' : acc <= MAX_ACCURACY_M ? 'weak' : 'none';

/** Watches position while the record screen is open, so the signal indicator is live before starting. */
export function watchSignal(): Promise<() => void> {
  return watchFixes((fix) => useLive.setState({ fixAt: fix.t, fixAcc: fix.accuracy }));
}
