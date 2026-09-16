import { describe, expect, it } from 'vitest';

import { ageGroup, heightBand, histogram, holdUntil, percentile, scoreRows, validateName, validateProfile, weightClass } from '../src/rules';

describe('buckets', () => {
  it('groups age, weight and height', () => {
    expect(ageGroup(17)).toBe('u20');
    expect(ageGroup(31)).toBe('30-39');
    expect(ageGroup(64)).toBe('60+');
    expect(weightClass('male', 80)).toBe('83');
    expect(weightClass('male', 130)).toBe('120+');
    expect(weightClass('female', 47)).toBe('47');
    expect(heightBand(177.9)).toBe('175');
  });
});

describe('profile validation', () => {
  it('accepts sensible profiles', () => {
    expect(validateProfile({ displayName: 'Iron Falcon', country: 'IN', sex: 'male', age: 31, weightKg: 80, heightCm: 175 })).toBeNull();
  });
  it('rejects bad names and values', () => {
    expect(validateName('ab')).toMatch(/3–20/);
    expect(validateName('bad<name>')).toMatch(/letters/);
    expect(validateName('Metakai Admin')).toMatch(/different/);
    expect(validateProfile({ displayName: 'Runner', country: 'india', sex: 'male', age: 31, weightKg: 80, heightCm: 175 })).toMatch(/country/);
    expect(validateProfile({ displayName: 'Runner', country: null, sex: 'male', age: 8, weightKg: 80, heightCm: 175 })).toMatch(/age/);
  });
});

describe('score rows', () => {
  it('keeps plausible, verified data only', () => {
    const rows = scoreRows(
      {
        physique: {
          overall: 40,
          groups: {
            chest: { score: 55, multiple: 1.8, sessions: 6 },
            back: { score: 70, multiple: 2.2, sessions: 1 },
            quads: { score: 99, multiple: 9, sessions: 12 },
          },
        },
        run: {
          overall: 35,
          efforts: {
            '5k': { timeSec: 1500, ageGrade: 51.3, verified: true },
            '10k': { timeSec: 3000, ageGrade: 52.8, verified: false },
            '1k': { timeSec: 90, ageGrade: 99, verified: true },
          },
        },
      },
      'male',
    );
    expect(rows.map((r) => r.board).sort()).toEqual(['group:chest', 'physique', 'run', 'run:5k']);
    expect(rows.find((r) => r.board === 'run:5k')).toMatchObject({ score: 51.3, value: 1500 });
  });

  it('skips overall boards without any valid entries', () => {
    expect(scoreRows({ physique: { overall: 40, groups: {} }, run: { overall: 30, efforts: {} } }, 'female')).toEqual([]);
  });
});

describe('holds and ranking', () => {
  const now = Date.UTC(2026, 8, 17);
  it('holds big jumps and very high first scores', () => {
    expect(holdUntil(null, 50, now)).toBeNull();
    expect(holdUntil(null, 80, now)).toBe('2026-09-24T00:00:00.000Z');
    expect(holdUntil({ score: 40, heldUntil: null }, 60, now)).toBeNull();
    expect(holdUntil({ score: 40, heldUntil: null }, 70, now)).not.toBeNull();
    expect(holdUntil({ score: 40, heldUntil: '2026-09-20T00:00:00.000Z' }, 45, now)).toBe('2026-09-20T00:00:00.000Z');
  });

  it('computes percentiles and histograms', () => {
    expect(percentile(1, 1)).toBe(100);
    expect(percentile(1, 11)).toBe(100);
    expect(percentile(11, 11)).toBe(0);
    expect(percentile(3, 11)).toBe(80);
    expect(histogram([0, 5, 15, 99, 100, 55])).toEqual([2, 1, 0, 0, 0, 1, 0, 0, 0, 2]);
  });
});
