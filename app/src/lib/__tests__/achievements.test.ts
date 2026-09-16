import { ACHIEVEMENTS, evaluateAchievements, progressLabel, streakEndingAt, type AchievementStats } from '../achievements';
import { addDays } from '../dates';

const EMPTY: AchievementStats = {
  workouts: 0,
  volumeKg: 0,
  trainingWeekStreak: 0,
  benchRatio: 0,
  squatRatio: 0,
  deadliftRatio: 0,
  gpsRuns: 0,
  longestRunKm: 0,
  totalRunKm: 0,
  best5kSec: null,
  best10kSec: null,
  halfDone: false,
  marathonDone: false,
  cardioSessions: 0,
  daysLogged: 0,
  logStreak: 0,
  proteinDays: 0,
  weighIns: 0,
  photos: 0,
  goalReached: false,
  checkIns: 0,
  bestGroupTier: -1,
  physiqueTier: -1,
  runTier: -1,
};

describe('achievements', () => {
  it('has unique ids', () => {
    const ids = ACHIEVEMENTS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('nothing is earned from empty stats', () => {
    expect(evaluateAchievements(EMPTY).filter((a) => a.complete)).toHaveLength(0);
  });

  it('earns and reports progress', () => {
    const res = evaluateAchievements({ ...EMPTY, workouts: 12, volumeKg: 25_000, benchRatio: 1.05, best5kSec: 1450, bestGroupTier: 3 });
    const byId = Object.fromEntries(res.map((r) => [r.def.id, r]));
    expect(byId.first_workout.complete).toBe(true);
    expect(byId.workouts_10.complete).toBe(true);
    expect(byId.workouts_50.progress).toBeCloseTo(0.24, 5);
    expect(progressLabel(byId.workouts_50)).toBe('12 / 50 workouts');
    expect(progressLabel(byId.volume_100t)).toBe('25k / 100k kg');
    expect(byId.bench_bw.complete).toBe(true);
    expect(progressLabel(byId.bench_bw)).toBe('Done');
    expect(byId.sub_25_5k.complete).toBe(true);
    expect(byId.sub_20_5k.complete).toBe(false);
    expect(byId.group_gold.complete).toBe(true);
    expect(byId.group_platinum.complete).toBe(false);
  });

  it('counts streaks', () => {
    const days = new Set(['2026-09-14', '2026-09-15', '2026-09-16']);
    const prev = (k: string) => addDays(k, -1);
    expect(streakEndingAt(days, '2026-09-16', prev)).toBe(3);
    // Today not logged yet still counts yesterday's streak.
    expect(streakEndingAt(days, '2026-09-17', prev)).toBe(3);
    expect(streakEndingAt(days, '2026-09-19', prev)).toBe(0);
  });
});
