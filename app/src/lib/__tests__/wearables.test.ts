import { appleTypeFor, base64Bytes, cardioKindFor, dailyAverage, healthConnectTypeFor, heartRateStats, parseHeartRate, sleepHoursByDay } from '../wearables';

const at = (y: number, m: number, d: number, h: number, min = 0) => new Date(y, m - 1, d, h, min).getTime();

describe('parseHeartRate', () => {
  it('reads an 8-bit rate', () => {
    expect(parseHeartRate([0x00, 72])).toBe(72);
  });
  it('reads a 16-bit little-endian rate', () => {
    expect(parseHeartRate([0x01, 0x9a, 0x00])).toBe(154);
  });
  it('rejects short or empty packets', () => {
    expect(parseHeartRate([0x00])).toBeNull();
    expect(parseHeartRate([0x01, 0x40])).toBeNull();
    expect(parseHeartRate([0x00, 0])).toBeNull();
  });
});

describe('base64Bytes', () => {
  it('decodes BLE characteristic values', () => {
    expect(base64Bytes('AEg=')).toEqual([0x00, 72]);
    expect(base64Bytes('AZoA')).toEqual([0x01, 0x9a, 0x00]);
  });
});

describe('heartRateStats', () => {
  it('averages and peaks valid samples', () => {
    expect(heartRateStats([120, 140, 160, 0, 250])).toEqual({ avg: 140, max: 160 });
  });
  it('returns null without samples', () => {
    expect(heartRateStats([])).toBeNull();
  });
});

describe('sleepHoursByDay', () => {
  it('keys a night by the morning it ends', () => {
    expect(sleepHoursByDay([{ start: at(2026, 9, 18, 23), end: at(2026, 9, 19, 7) }])).toEqual({ '2026-09-19': 8 });
  });
  it('counts only asleep stages', () => {
    const night = {
      start: at(2026, 9, 18, 23),
      end: at(2026, 9, 19, 7),
      stages: [
        { start: at(2026, 9, 18, 23), end: at(2026, 9, 19, 3), asleep: true },
        { start: at(2026, 9, 19, 3), end: at(2026, 9, 19, 4), asleep: false },
        { start: at(2026, 9, 19, 4), end: at(2026, 9, 19, 7), asleep: true },
      ],
    };
    expect(sleepHoursByDay([night])).toEqual({ '2026-09-19': 7 });
  });
  it('merges the same night reported by two apps', () => {
    const a = { start: at(2026, 9, 18, 23), end: at(2026, 9, 19, 6) };
    const b = { start: at(2026, 9, 19, 0), end: at(2026, 9, 19, 7) };
    expect(sleepHoursByDay([a, b])).toEqual({ '2026-09-19': 8 });
  });
  it('adds an afternoon nap to that day', () => {
    const night = { start: at(2026, 9, 18, 23), end: at(2026, 9, 19, 6) };
    const nap = { start: at(2026, 9, 19, 14), end: at(2026, 9, 19, 14, 30) };
    expect(sleepHoursByDay([night, nap])).toEqual({ '2026-09-19': 7.5 });
  });
});

describe('activity types', () => {
  it('maps cardio and skips strength', () => {
    expect(cardioKindFor('health_connect', 56)).toBe('run');
    expect(cardioKindFor('health_connect', 70)).toBeNull();
    expect(cardioKindFor('apple_health', 13)).toBe('cycle');
    expect(cardioKindFor('apple_health', 50)).toBeNull();
  });
  it('writes Metakai sessions with a matching type', () => {
    expect(healthConnectTypeFor('strength')).toBe(70);
    expect(healthConnectTypeFor('run')).toBe(56);
    expect(appleTypeFor('strength')).toBe(50);
    expect(appleTypeFor('walk')).toBe(52);
    expect(appleTypeFor('other')).toBe(3000);
  });
});

describe('dailyAverage', () => {
  it('averages per local day', () => {
    const out = dailyAverage([
      { at: at(2026, 9, 19, 7), value: 50 },
      { at: at(2026, 9, 19, 22), value: 60 },
      { at: at(2026, 9, 20, 7), value: 70 },
    ]);
    expect(out).toEqual({ '2026-09-19': 55, '2026-09-20': 70 });
  });
});
