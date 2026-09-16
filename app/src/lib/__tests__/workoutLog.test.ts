import { estimateDurationMin, overloadStatus, resistanceMet, workoutCalories } from '../workoutEnergy';
import { parseWorkoutText } from '../workoutText';

describe('workout calories', () => {
  it('scales with intensity, bodyweight and time', () => {
    expect(resistanceMet(12, 60)).toBe(3.5);
    expect(resistanceMet(18, 60)).toBe(5.0);
    expect(resistanceMet(30, 60)).toBe(6.0);
    expect(workoutCalories({ bodyweightKg: 80, durationMin: 60, workingSets: 18 })).toBe(400);
    expect(workoutCalories({ bodyweightKg: 80, durationMin: 0, workingSets: 18 })).toBe(0);
    expect(estimateDurationMin(16)).toBe(45);
  });
});

describe('overload status', () => {
  const s = (date: string, w: number, r: number) => ({ date, sets: [{ weightKg: w, reps: r }] });

  it('detects progress, holds and slips', () => {
    expect(overloadStatus([s('d4', 105, 5), s('d3', 100, 5), s('d2', 100, 5), s('d1', 100, 5)]).status).toBe('progressing');
    expect(overloadStatus([s('d2', 100, 5), s('d1', 100, 5)]).status).toBe('holding');
    expect(overloadStatus([s('d2', 90, 5), s('d1', 100, 5)]).status).toBe('slipping');
    expect(overloadStatus([s('d1', 100, 5)]).status).toBe('new');
  });

  it('returns the series oldest first', () => {
    const r = overloadStatus([s('d2', 110, 1), s('d1', 100, 1)]);
    expect(r.series).toEqual([100, 110]);
    expect(r.changePct).toBeCloseTo(10);
  });
});

describe('quick workout text', () => {
  it('reads sets x reps with a weight', () => {
    expect(parseWorkoutText('bench 3x8 60, squat 5x5 100kg')).toEqual([
      { name: 'bench', sets: Array(3).fill({ weightKg: 60, reps: 8 }) },
      { name: 'squat', sets: Array(5).fill({ weightKg: 100, reps: 5 }) },
    ]);
  });

  it('reads weight x reps pairs', () => {
    expect(parseWorkoutText('deadlift 100x5 120x3 140x1')).toEqual([
      {
        name: 'deadlift',
        sets: [
          { weightKg: 100, reps: 5 },
          { weightKg: 120, reps: 3 },
          { weightKg: 140, reps: 1 },
        ],
      },
    ]);
  });

  it('reads "sets of", @ weights, bodyweight and lb', () => {
    const r = parseWorkoutText('pullups 3 sets of 10; curls 3x12 @ 12.5\nohp 3x5x135lb');
    expect(r[0]).toEqual({ name: 'pullups', sets: Array(3).fill({ weightKg: null, reps: 10 }) });
    expect(r[1]).toEqual({ name: 'curls', sets: Array(3).fill({ weightKg: 12.5, reps: 12 }) });
    expect(r[2].sets).toHaveLength(3);
    expect(r[2].sets[0].weightKg).toBeCloseTo(61.2, 1);
  });

  it('handles 3x8x60 and single numbers', () => {
    expect(parseWorkoutText('leg press 4x10x180')[0].sets).toEqual(Array(4).fill({ weightKg: 180, reps: 10 }));
    expect(parseWorkoutText('pushups 25')[0]).toEqual({ name: 'pushups', sets: [{ weightKg: null, reps: 25 }] });
  });

  it('uses the default unit', () => {
    expect(parseWorkoutText('bench 3x5 135', 'lb')[0].sets[0].weightKg).toBeCloseTo(61.23, 1);
  });
});
