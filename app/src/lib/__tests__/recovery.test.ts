import { cardioCalories, cardioMet, formatPace, paceMinPerKm } from '../cardio';
import { buildSegments, formatClock, INTERVAL_PRESETS, positionAt, totalSeconds } from '../intervals';
import { muscleRecovery } from '../muscleRecovery';
import { readiness } from '../readiness';

describe('cardio', () => {
  it('uses speed when distance is known', () => {
    // 10 km in 60 min = 10 km/h, between 9.7 (9.8) and 11.3 (11.0)
    expect(cardioMet({ kind: 'run', durationMin: 60, distanceKm: 10 })).toBeCloseTo(10.025, 2);
    expect(cardioCalories({ kind: 'run', durationMin: 60, distanceKm: 10, bodyweightKg: 80 })).toBe(802);
    // clamps outside the table
    expect(cardioMet({ kind: 'walk', durationMin: 60, distanceKm: 2 })).toBe(2.8);
  });

  it('falls back to effort bands', () => {
    expect(cardioMet({ kind: 'row', durationMin: 20, rpe: 3 })).toBe(4.8);
    expect(cardioMet({ kind: 'row', durationMin: 20, rpe: 8 })).toBe(8.5);
    expect(cardioMet({ kind: 'elliptical', durationMin: 20 })).toBe(5.0);
    expect(cardioCalories({ kind: 'hiit', durationMin: 0, bodyweightKg: 80 })).toBe(0);
  });

  it('formats pace', () => {
    expect(paceMinPerKm(27.5, 5)).toBe(5.5);
    expect(paceMinPerKm(30, null)).toBeNull();
    expect(formatPace(5.5)).toBe('5:30');
    expect(formatPace(4.999)).toBe('5:00');
  });
});

describe('intervals', () => {
  it('builds tabata with warm-up and no trailing rest', () => {
    const segs = buildSegments(INTERVAL_PRESETS.tabata.config);
    expect(segs[0]).toMatchObject({ kind: 'warmup', seconds: 60, startsAt: 0 });
    expect(segs.filter((s) => s.kind === 'work')).toHaveLength(8);
    expect(segs.filter((s) => s.kind === 'rest')).toHaveLength(7);
    expect(totalSeconds(segs)).toBe(60 + 8 * 20 + 7 * 10);
  });

  it('tracks position', () => {
    const segs = buildSegments({ workSec: 20, restSec: 10, rounds: 2, warmupSec: 0, cooldownSec: 0 });
    expect(positionAt(segs, 0)).toMatchObject({ index: 0, remaining: 20, done: false });
    expect(positionAt(segs, 25)).toMatchObject({ index: 1, remaining: 5 });
    expect(positionAt(segs, 30).segment).toMatchObject({ kind: 'work', round: 2 });
    expect(positionAt(segs, 50).done).toBe(true);
  });

  it('handles EMOM without rest', () => {
    const segs = buildSegments(INTERVAL_PRESETS.emom.config);
    expect(segs.every((s) => s.kind === 'work')).toBe(true);
    expect(totalSeconds(segs)).toBe(600);
    expect(formatClock(65)).toBe('1:05');
    expect(formatClock(0.2)).toBe('0:01');
  });
});

describe('readiness', () => {
  it('scores a great day high', () => {
    const r = readiness({ sleepHours: 8.5, sleepQuality: 5, soreness: 1, stress: 1, energy: 5, mood: 5 })!;
    expect(r.score).toBe(100);
    expect(r.band).toBe('high');
    expect(r.flags).toEqual([]);
  });

  it('flags the worst factors and scores low', () => {
    const r = readiness({ sleepHours: 4.5, sleepQuality: 2, soreness: 5, stress: 4, energy: 2, mood: 3 })!;
    expect(r.band).toBe('low');
    expect(r.flags.slice(0, 2)).toEqual(['Short sleep', 'Sore']);
  });

  it('ignores missing answers and penalises load spikes', () => {
    const base = readiness({ sleepHours: 8, sleepQuality: null, soreness: null, stress: null, energy: null, mood: null })!;
    expect(base.score).toBe(100);
    const spiked = readiness({ sleepHours: 8, sleepQuality: null, soreness: null, stress: null, energy: null, mood: null }, { acute: 20, chronic: 10 })!;
    expect(spiked.score).toBe(90);
    expect(spiked.flags).toContain('Training load spiked');
    expect(readiness({ sleepHours: null, sleepQuality: null, soreness: null, stress: null, energy: null, mood: null })).toBeNull();
  });
});

describe('muscle recovery', () => {
  const now = Date.UTC(2026, 8, 17, 12);
  const h = 3600_000;

  it('drops after training and recovers over time', () => {
    const chest = (at: number) => muscleRecovery([{ primary: ['chest'], secondary: ['triceps'], sets: 10, at }], now).find((g) => g.id === 'chest')!;
    expect(chest(now).recovered).toBe(0);
    expect(chest(now - 30 * h).recovered).toBe(50);
    expect(chest(now - 60 * h).recovered).toBe(75);
    expect(chest(now - 8 * 24 * h).recovered).toBe(100);
  });

  it('counts secondary muscles at half', () => {
    const groups = muscleRecovery([{ primary: ['chest'], secondary: ['triceps'], sets: 10, at: now }], now);
    const triceps = groups.find((g) => g.id === 'triceps')!;
    expect(triceps.recovered).toBe(50);
    expect(triceps.lastTrainedAt).toBeNull();
    expect(groups.find((g) => g.id === 'quads')!.recovered).toBe(100);
  });
});
