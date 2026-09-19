import { baseline, recoveryScore, sessionLoad, trainingLoad, type LoadSession } from '../recoveryScore';

const none = { sleepHours: null, sleepQuality: null, soreness: null, stress: null, energy: null, mood: null };
const steady = (v: number) => Array.from({ length: 14 }, (_, i) => v + (i % 2 ? 2 : -2));

describe('baseline', () => {
  it('needs about a week of readings', () => {
    expect(baseline([50, 52, 51])).toBeNull();
    expect(baseline([50, 52, 51, 49, 48])).toMatchObject({ n: 5, mean: 50 });
  });
});

describe('recoveryScore', () => {
  it('scores from watch data alone', () => {
    const r = recoveryScore({ checkIn: null, sleep: { hours: 8, deepMin: 90, remMin: 110 }, hrv: { today: 55, history: steady(50) }, rhr: { today: 52, history: steady(53) }, load: null })!;
    expect(r.band).toBe('high');
    expect(r.factors.map((f) => f.key)).toEqual(['sleep', 'hrv', 'rhr']);
    expect(r.flags).toEqual([]);
  });

  it('flags low HRV and a raised resting heart rate', () => {
    const r = recoveryScore({ checkIn: null, sleep: { hours: 7.5 }, hrv: { today: 32, history: steady(50) }, rhr: { today: 62, history: steady(53) }, load: null })!;
    expect(r.flags).toEqual(expect.arrayContaining(['HRV below your normal', 'Resting heart rate up']));
    expect(r.score).toBeLessThan(75);
    expect(r.factors.find((f) => f.key === 'hrv')!.detail).toMatch(/below your normal/);
  });

  it('skips HRV and resting heart rate until there is a baseline', () => {
    const r = recoveryScore({ checkIn: null, sleep: { hours: 8 }, hrv: { today: 30, history: [50, 51] }, rhr: null, load: null })!;
    expect(r.factors.map((f) => f.key)).toEqual(['sleep']);
  });

  it('lets a typed sleep time override the watch and adds how you feel', () => {
    const r = recoveryScore({ checkIn: { ...none, sleepHours: 5, soreness: 5 }, sleep: { hours: 8 }, hrv: null, rhr: null, load: null })!;
    expect(r.factors.find((f) => f.key === 'sleep')!.detail).toMatch(/^5h/);
    expect(r.flags).toEqual(expect.arrayContaining(['Short sleep', 'Sore']));
  });

  it('marks a load spike', () => {
    const r = recoveryScore({ checkIn: null, sleep: { hours: 8 }, hrv: null, rhr: null, load: { acute: 30, chronic: 10 } })!;
    expect(r.flags).toContain('Training load spiked');
    expect(r.loadNote).toBe('Much more training than usual');
  });

  it('returns null with nothing to go on', () => {
    expect(recoveryScore({ checkIn: null, sleep: null, hrv: null, rhr: null, load: null })).toBeNull();
  });
});

describe('training load', () => {
  const heart = { rest: 55, max: 190 };
  it('weights sessions by heart rate, sets or effort', () => {
    const hard = sessionLoad({ dateKey: '2026-09-20', minutes: 45, avgHr: 160, strength: false }, heart);
    const easy = sessionLoad({ dateKey: '2026-09-20', minutes: 45, avgHr: 110, strength: false }, heart);
    expect(hard).toBeGreaterThan(easy * 2);
    expect(sessionLoad({ dateKey: '2026-09-20', minutes: 60, sets: 16, strength: true }, heart)).toBe(40);
  });

  it('compares the last week with the last four', () => {
    const days = (from: number, to: number, extra: Partial<LoadSession> = {}) =>
      Array.from({ length: to - from + 1 }, (_, i) => ({ dateKey: `2026-09-${String(from + i).padStart(2, '0')}`, minutes: 40, rpe: 6, strength: false, ...extra }));
    const sessions = [...days(1, 13), ...days(14, 20, { minutes: 120 })];
    const load = trainingLoad(sessions, '2026-09-20', heart)!;
    expect(load.acute / load.chronic).toBeGreaterThan(1.5);
    expect(trainingLoad(days(10, 20), '2026-09-20', heart)).toBeNull();
  });
});
