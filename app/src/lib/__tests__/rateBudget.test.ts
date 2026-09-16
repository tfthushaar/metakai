import { block, emptyUsage, nextPacificMidnight, pacificDay, parseDelay, recordUse, waitMs } from '../rateBudget';

const LIMITS = { rpm: 2, rpd: 3, tpm: 1000 };
const T0 = Date.UTC(2026, 8, 16, 12, 0, 0); // 16 Sep 2026, 05:00 PDT
const DAY = pacificDay(T0);

describe('pacific time', () => {
  it('uses PDT in summer and PST in winter', () => {
    expect(pacificDay(Date.UTC(2026, 8, 16, 6, 59))).toBe('2026-09-15');
    expect(pacificDay(Date.UTC(2026, 8, 16, 7, 0))).toBe('2026-09-16');
    expect(pacificDay(Date.UTC(2026, 0, 10, 7, 59))).toBe('2026-01-09');
    expect(pacificDay(Date.UTC(2026, 0, 10, 8, 0))).toBe('2026-01-10');
  });
  it('finds the next midnight', () => {
    expect(new Date(nextPacificMidnight(T0)).toISOString()).toBe('2026-09-17T07:00:00.000Z');
    expect(new Date(nextPacificMidnight(Date.UTC(2026, 0, 10, 12))).toISOString()).toBe('2026-01-11T08:00:00.000Z');
  });
});

describe('budget', () => {
  it('allows requests until the per-minute limit, then waits for the oldest to expire', () => {
    let u = emptyUsage();
    expect(waitMs(u, LIMITS, T0, DAY, 100)).toBe(0);
    u = recordUse(u, T0, DAY, 100);
    u = recordUse(u, T0 + 10_000, DAY, 100);
    expect(waitMs(u, LIMITS, T0 + 20_000, DAY, 100)).toBe(40_000);
    expect(waitMs(u, LIMITS, T0 + 60_000, DAY, 100)).toBe(0);
  });

  it('stops for the day at the daily limit and resets on a new day', () => {
    let u = emptyUsage();
    for (let i = 0; i < 3; i++) u = recordUse(u, T0 + i * 120_000, DAY, 10);
    expect(waitMs(u, LIMITS, T0 + 600_000, DAY, 10)).toBe(Infinity);
    expect(waitMs(u, LIMITS, T0 + 86400_000, pacificDay(T0 + 86400_000), 10)).toBe(0);
  });

  it('respects tokens per minute', () => {
    let u = recordUse(emptyUsage(), T0, DAY, 800);
    expect(waitMs(u, LIMITS, T0 + 5_000, DAY, 300)).toBe(55_000);
    expect(waitMs(u, LIMITS, T0 + 5_000, DAY, 150)).toBe(0);
    expect(waitMs(u, LIMITS, T0, DAY, 5000)).toBe(Infinity);
  });

  it('honours cooldowns and provider-reported quota', () => {
    const u = block(emptyUsage(), T0 + 30_000);
    expect(waitMs(u, LIMITS, T0, DAY, 10)).toBe(30_000);
    expect(waitMs({ ...emptyUsage(), day: DAY, remainingToday: 0 }, LIMITS, T0, DAY, 10)).toBe(Infinity);
  });
});

describe('parseDelay', () => {
  it('reads provider formats', () => {
    expect(parseDelay('30s')).toBe(30_000);
    expect(parseDelay('1.5s')).toBe(1500);
    expect(parseDelay('7m12.5s')).toBe(432_500);
    expect(parseDelay('12')).toBe(12_000);
    expect(parseDelay('250ms')).toBe(250);
    expect(parseDelay('soon')).toBeNull();
    expect(parseDelay(null)).toBeNull();
  });
});
