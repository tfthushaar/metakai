import { bestSet, estimate1RM, formatDuration, plateLoad, setVolume, warmupSets, weightForReps } from '../strength';

const PLATES = [25, 20, 15, 10, 5, 2.5, 1.25].map((weight) => ({ weight, pairs: 2 }));

describe('estimate1RM', () => {
  it('is exact at one rep and grows with reps', () => {
    expect(estimate1RM(100, 1)).toBe(100);
    expect(estimate1RM(100, 5)).toBeCloseTo(112.5);
    expect(estimate1RM(100, 12)).toBeCloseTo(140);
    expect(estimate1RM(0, 5)).toBe(0);
  });

  it('inverts cleanly', () => {
    for (const reps of [1, 3, 5, 8, 10, 12, 15]) {
      expect(weightForReps(estimate1RM(80, reps), reps)).toBeCloseTo(80);
    }
  });
});

describe('plateLoad', () => {
  it('loads a standard barbell', () => {
    const r = plateLoad(100, 20, PLATES);
    expect(r.perSide).toEqual([25, 15]);
    expect(r.achieved).toBe(100);
    expect(r.remainder).toBe(0);
  });

  it('uses small plates and reports what cannot be loaded', () => {
    expect(plateLoad(62.5, 20, PLATES).perSide).toEqual([20, 1.25]);
    const r = plateLoad(61, 20, PLATES);
    expect(r.achieved).toBe(60);
    expect(r.remainder).toBeCloseTo(1);
  });

  it('respects plate counts', () => {
    const r = plateLoad(300, 20, [{ weight: 25, pairs: 2 }]);
    expect(r.perSide).toEqual([25, 25]);
    expect(r.achieved).toBe(120);
  });

  it('handles targets below the bar', () => {
    expect(plateLoad(10, 20, PLATES)).toEqual({ perSide: [], achieved: 20, remainder: 0 });
  });
});

describe('warmupSets', () => {
  it('ramps to the working weight', () => {
    expect(warmupSets(100, 20, 2.5)).toEqual([
      { weight: 20, reps: 10 },
      { weight: 50, reps: 5 },
      { weight: 70, reps: 3 },
      { weight: 85, reps: 1 },
    ]);
  });

  it('keeps light work short', () => {
    expect(warmupSets(22.5, 20, 2.5)).toEqual([{ weight: 20, reps: 10 }]);
    const light = warmupSets(40, 20, 2.5);
    expect(light[0].weight).toBe(20);
    expect(light.every((s) => s.weight < 40)).toBe(true);
    expect(new Set(light.map((s) => s.weight)).size).toBe(light.length);
  });
});

describe('volume and best set', () => {
  const sets = [
    { weight: 100, reps: 5 },
    { weight: 110, reps: 2 },
    { weight: 80, reps: 12 },
  ];
  it('sums volume', () => expect(setVolume(sets)).toBe(1680));
  it('finds the best estimated set', () => expect(bestSet(sets)).toEqual({ weight: 110, reps: 2 }));
  it('returns null when empty', () => expect(bestSet([])).toBeNull());
});

describe('formatDuration', () => {
  it('formats', () => {
    expect(formatDuration(65_000)).toBe('1:05');
    expect(formatDuration(3_725_000)).toBe('1:02:05');
  });
});
