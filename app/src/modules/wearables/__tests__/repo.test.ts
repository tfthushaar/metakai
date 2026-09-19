/**
 * Runs every migration on a real SQLite (the sql.js build the web app ships) and checks watch
 * imports against it: sessions matched to ones logged here, sleep nights and readings by app.
 */
import { sleepNights } from '../../../lib/wearables';
import { openTestDb, testDb as mockDb } from '../../../testing/sqliteDb';

jest.mock('../../../core/db/database', () => require('../../../testing/sqliteDb').database);

import { importWorkout, sessionsWithoutHeartRate, sleepNightsBetween, unsharedWorkouts, upsertSleepNight, upsertWatchMarker } from '../repo';

const at = (h: number, m = 0) => new Date(2026, 8, 19, h, m).getTime();
const iso = (t: number) => new Date(t).toISOString();

beforeAll(openTestDb);

const workout = { kind: 'other' as const, title: 'Strength training', distanceKm: null, kcal: 310, avgHr: 118, maxHr: 161, origin: 'Garmin Connect' };

describe('watch imports', () => {
  it('adds the watch heart rate to a gym session logged here instead of saving it twice', () => {
    mockDb.runSync("INSERT INTO workouts (id, name, date_key, started_at, ended_at, created_at, updated_at) VALUES ('lift', 'Push', '2026-09-19', ?, ?, ?, ?)", [
      iso(at(18)),
      iso(at(19, 5)),
      iso(at(19, 5)),
      iso(at(19, 5)),
    ]);
    expect(importWorkout({ ...workout, externalId: 'g1', strength: true, start: at(18, 2), end: at(19, 4) })).toBe('linked');
    expect(mockDb.getFirstSync("SELECT avg_hr, max_hr, external_id FROM workouts WHERE id = 'lift'")).toEqual({ avg_hr: 118, max_hr: 161, external_id: 'g1' });
    expect(mockDb.getAllSync('SELECT id FROM cardio_sessions')).toHaveLength(0);
    // Seen once, never again; and a session a watch also has isn't sent back to the health app.
    expect(importWorkout({ ...workout, externalId: 'g1', strength: true, start: at(18, 2), end: at(19, 4) })).toBeNull();
    expect(unsharedWorkouts().map((w) => w.id)).not.toContain('lift');
  });

  it('saves a strength session with nothing logged here', () => {
    expect(importWorkout({ ...workout, externalId: 'g2', strength: true, start: at(7), end: at(8) })).toBe('added');
    expect(mockDb.getFirstSync("SELECT kind, title, origin, started_at, source FROM cardio_sessions WHERE external_id = 'g2'")).toEqual({
      kind: 'other',
      title: 'Strength training',
      origin: 'Garmin Connect',
      started_at: iso(at(7)),
      source: 'watch',
    });
  });

  it('matches a run logged by hand on the same day with about the same length', () => {
    mockDb.runSync(
      "INSERT INTO cardio_sessions (id, date_key, kind, duration_min, kcal, created_at, updated_at) VALUES ('run', '2026-09-19', 'run', 30, 300, ?, ?)",
      [iso(at(21)), iso(at(21))],
    );
    const run = { ...workout, kind: 'run' as const, title: null, distanceKm: 5, strength: false };
    expect(importWorkout({ ...run, externalId: 'g3', start: at(6), end: at(6, 50) })).toBe('added');
    expect(importWorkout({ ...run, externalId: 'g4', start: at(12), end: at(12, 32) })).toBe('linked');
    expect(mockDb.getFirstSync("SELECT avg_hr, kcal FROM cardio_sessions WHERE id = 'run'")).toEqual({ avg_hr: 118, kcal: 300 });
  });

  it('finds sessions logged here that still need heart rate', () => {
    mockDb.runSync(
      "INSERT INTO workouts (id, name, date_key, started_at, ended_at, created_at, updated_at) VALUES ('legs', 'Legs', '2026-09-19', ?, ?, ?, ?)",
      [iso(at(10)), iso(at(11)), iso(at(11)), iso(at(11))],
    );
    expect(sessionsWithoutHeartRate('2026-09-19')).toEqual([{ table: 'workouts', id: 'legs', start: at(10), end: at(11) }]);
  });
});

describe('watch sleep and readings', () => {
  it('keeps one night per morning and updates it in place', () => {
    const [night] = sleepNights([{ start: at(-1), end: at(7), origin: 'Zepp' }]);
    expect(upsertSleepNight(night)).toBe(true);
    expect(upsertSleepNight(night)).toBe(false);
    expect(upsertSleepNight({ ...night, asleepMin: 420, origin: 'Garmin Connect' })).toBe(true);
    expect(sleepNightsBetween('2026-09-19', '2026-09-19')).toEqual([expect.objectContaining({ asleepMin: 420, origin: 'Garmin Connect' })]);
  });

  it('records which app a reading came from', () => {
    expect(upsertWatchMarker('2026-09-19', 'hrv', 52, 'ms', 'Zepp')).toBe(true);
    expect(upsertWatchMarker('2026-09-19', 'hrv', 52, 'ms', 'Zepp')).toBe(false);
    expect(upsertWatchMarker('2026-09-19', 'hrv', 48, 'ms', 'Garmin Connect')).toBe(true);
    expect(mockDb.getAllSync("SELECT value, origin FROM health_markers WHERE kind = 'hrv'")).toEqual([{ value: 48, origin: 'Garmin Connect' }]);
  });
});
