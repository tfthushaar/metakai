/** Readiness read from a real database: watch readings by app, sleep nights and check-ins. */
import { addDays } from '../../../lib/dates';
import { readiness } from '../../../lib/readiness';
import { openTestDb, testDb } from '../../../testing/sqliteDb';

jest.mock('../../../core/db/database', () => require('../../../testing/sqliteDb').database);
// Only muscle recovery needs the exercise library.
jest.mock('../../workouts/repo', () => ({ getExercise: () => ({ primary: [], secondary: [] }) }));

import { readinessFor, readinessHistory, saveCheckIn } from '../repo';

const DAY = '2026-09-19';
const now = new Date().toISOString();
const marker = (day: string, kind: string, value: number, origin: string | null) =>
  testDb.runSync("INSERT INTO health_markers (id, date_key, kind, value, source, origin, created_at, updated_at) VALUES (?, ?, ?, ?, 'watch', ?, ?, ?)", [
    `${kind}-${day}-${origin}`,
    day,
    kind,
    value,
    origin,
    now,
    now,
  ]);

beforeAll(openTestDb);

describe('readinessFor', () => {
  it('scores a check-in alone exactly as before', () => {
    const answers = { sleepHours: 6, sleepQuality: 3, soreness: 4, stress: 2, energy: 3, mood: 4 };
    saveCheckIn('2026-08-01', answers);
    expect(readinessFor('2026-08-01')).toMatchObject({ score: readiness(answers)!.score, flags: readiness(answers)!.flags });
  });

  it('compares HRV and resting heart rate with the same watch only', () => {
    for (let i = 1; i <= 14; i++) {
      const day = addDays(DAY, -i);
      marker(day, 'hrv', 50 + (i % 3), 'Zepp');
      marker(day, 'rhr', 54 + (i % 2), 'Zepp');
    }
    marker(DAY, 'hrv', 36, 'Zepp');
    marker(DAY, 'rhr', 62, 'Zepp');
    testDb.runSync(
      "INSERT INTO sleep_nights (id, date_key, asleep_min, deep_min, rem_min, light_min, awake_min, origin, created_at, updated_at) VALUES ('n1', ?, 450, 80, 95, 275, 20, 'Zepp', ?, ?)",
      [DAY, now, now],
    );
    const r = readinessFor(DAY)!;
    expect(r.factors.map((f) => f.key)).toEqual(['sleep', 'hrv', 'rhr']);
    expect(r.flags).toEqual(['HRV below your normal', 'Resting heart rate up']);
    expect(r.factors[0].detail).toBe('7h 30m · 39% deep and REM');
  });

  it('starts a fresh normal when the reading comes from another app', () => {
    marker('2026-09-20', 'hrv', 90, 'Garmin Connect');
    expect(readinessFor('2026-09-20')?.factors.some((f) => f.key === 'hrv') ?? false).toBe(false);
  });

  it('builds the history from watch days as well as check-ins', () => {
    const history = readinessHistory(14, DAY);
    expect(history).toHaveLength(14);
    expect(history.every((h) => h.score == null)).toBe(false);
  });
});
