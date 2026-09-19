import {
  appleTypeFor,
  base64Bytes,
  cardioKindFor,
  dailyAverage,
  dailyAverageFrom,
  healthConnectTypeFor,
  heartRateStats,
  parseHeartRate,
  pickOrigin,
  sleepHoursByDay,
  sleepNights,
  watchSessionFor,
} from '../wearables';

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
        { start: at(2026, 9, 18, 23), end: at(2026, 9, 19, 3), stage: 'light' as const },
        { start: at(2026, 9, 19, 3), end: at(2026, 9, 19, 4), stage: 'awake' as const },
        { start: at(2026, 9, 19, 4), end: at(2026, 9, 19, 7), stage: 'light' as const },
      ],
    };
    expect(sleepHoursByDay([night])).toEqual({ '2026-09-19': 7 });
  });
  it('merges overlapping sessions from the same app', () => {
    const a = { start: at(2026, 9, 18, 23), end: at(2026, 9, 19, 6) };
    const b = { start: at(2026, 9, 19, 0), end: at(2026, 9, 19, 7) };
    expect(sleepHoursByDay([a, b])).toEqual({ '2026-09-19': 8 });
  });
  it('takes a night from one device, never adding two together', () => {
    const garmin = { start: at(2026, 9, 18, 23), end: at(2026, 9, 19, 6), origin: 'garmin' };
    const zepp = { start: at(2026, 9, 19, 0), end: at(2026, 9, 19, 7), origin: 'zepp' };
    expect(sleepHoursByDay([garmin, zepp])).toEqual({ '2026-09-19': 7 });
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

describe('sleepNights', () => {
  const staged = {
    start: at(2026, 9, 18, 23),
    end: at(2026, 9, 19, 7),
    origin: 'zepp',
    stages: [
      { start: at(2026, 9, 18, 23), end: at(2026, 9, 19, 1), stage: 'light' as const },
      { start: at(2026, 9, 19, 1), end: at(2026, 9, 19, 2, 30), stage: 'deep' as const },
      { start: at(2026, 9, 19, 2, 30), end: at(2026, 9, 19, 3), stage: 'awake' as const },
      { start: at(2026, 9, 19, 3), end: at(2026, 9, 19, 5), stage: 'rem' as const },
      { start: at(2026, 9, 19, 5), end: at(2026, 9, 19, 7), stage: 'asleep' as const },
    ],
  };
  const plain = { start: at(2026, 9, 18, 22), end: at(2026, 9, 19, 7), origin: 'garmin' };

  it('prefers the device with sleep stages', () => {
    const [night] = sleepNights([plain, staged]);
    expect(night).toMatchObject({ dateKey: '2026-09-19', origin: 'zepp', asleepMin: 450, deepMin: 90, remMin: 120, lightMin: 240, awakeMin: 30 });
  });
  it('uses the chosen device when it has that night', () => {
    expect(sleepNights([plain, staged], 'garmin')[0]).toMatchObject({ origin: 'garmin', asleepMin: 540, deepMin: null });
    expect(sleepNights([staged], 'garmin')[0].origin).toBe('zepp');
  });
  it('treats unsplit sleep as having no stages', () => {
    const night = { start: at(2026, 9, 18, 23), end: at(2026, 9, 19, 6), stages: [{ start: at(2026, 9, 18, 23), end: at(2026, 9, 19, 6), stage: 'asleep' as const }] };
    expect(sleepNights([night])[0]).toMatchObject({ asleepMin: 420, deepMin: null, awakeMin: null });
  });
});

describe('origins', () => {
  const samples = [
    { at: at(2026, 9, 19, 7), value: 50, origin: 'garmin' },
    { at: at(2026, 9, 19, 8), value: 60, origin: 'zepp' },
    { at: at(2026, 9, 20, 7), value: 52, origin: 'garmin' },
  ];
  it('reads from the app with the most data unless one is chosen', () => {
    expect(pickOrigin(samples)).toBe('garmin');
    expect(pickOrigin(samples, 'zepp')).toBe('zepp');
    expect(pickOrigin(samples, 'fitbit')).toBe('garmin');
    expect(pickOrigin([])).toBeNull();
  });
  it('takes each day from one app, falling back when the main one has no reading', () => {
    expect(dailyAverageFrom(samples)).toEqual({ '2026-09-19': { value: 50, origin: 'garmin' }, '2026-09-20': { value: 52, origin: 'garmin' } });
    expect(dailyAverageFrom(samples, 'zepp')).toEqual({ '2026-09-19': { value: 60, origin: 'zepp' }, '2026-09-20': { value: 52, origin: 'garmin' } });
  });
});

describe('watchSessionFor', () => {
  it('keeps cardio kinds and labels strength and yoga', () => {
    expect(watchSessionFor('health_connect', 56)).toEqual({ kind: 'run', label: null, strength: false });
    expect(watchSessionFor('health_connect', 70)).toEqual({ kind: 'other', label: 'Strength training', strength: true });
    expect(watchSessionFor('apple_health', 57)).toEqual({ kind: 'other', label: 'Yoga', strength: false });
    expect(watchSessionFor('health_connect', 33)).toBeNull();
  });
});
