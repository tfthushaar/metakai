import { weeklyCheckin } from '../checkin';
import { addDays } from '../dates';
import { doubleProgression, incrementFor, liftForExercise, strengthStandard, volumeStatus, weeklyVolume } from '../training';

describe('double progression', () => {
  it('adds weight when every set hits the top of the range', () => {
    const advice = doubleProgression({
      history: [[{ weightKg: 60, reps: 12 }, { weightKg: 60, reps: 12 }, { weightKg: 60, reps: 12 }]],
      repMin: 8,
      repMax: 12,
      increment: 2.5,
    });
    expect(advice).toMatchObject({ kind: 'increase', weightKg: 62.5, reps: 8 });
  });

  it('repeats the weight and chases reps otherwise', () => {
    const advice = doubleProgression({
      history: [[{ weightKg: 60, reps: 12 }, { weightKg: 60, reps: 10 }, { weightKg: 60, reps: 9 }]],
      repMin: 8,
      repMax: 12,
      increment: 2.5,
    });
    expect(advice).toMatchObject({ kind: 'repeat', weightKg: 60, reps: 10 });
  });

  it('suggests a deload after three stalled sessions', () => {
    const session = [{ weightKg: 100, reps: 5 }];
    const advice = doubleProgression({ history: [session, session, session, session], repMin: 5, repMax: 8, increment: 2.5 });
    expect(advice.kind).toBe('deload');
    expect(advice.weightKg).toBe(90);
  });

  it('starts fresh without history', () => {
    expect(doubleProgression({ history: [], repMin: 8, repMax: 12, increment: 2.5 }).kind).toBe('start');
  });

  it('uses bigger jumps for lower-body barbell lifts', () => {
    expect(incrementFor(['quadriceps'], 'barbell', 2.5)).toBe(5);
    expect(incrementFor(['chest'], 'barbell', 2.5)).toBe(2.5);
  });
});

describe('weekly volume', () => {
  it('counts primary fully and secondary at half', () => {
    const v = weeklyVolume([
      { primary: ['chest'], secondary: ['triceps', 'shoulders'], sets: 4 },
      { primary: ['triceps'], secondary: [], sets: 3 },
    ]);
    expect(v.chest).toBe(4);
    expect(v.triceps).toBe(5);
    expect(v.shoulders).toBe(2);
    expect(volumeStatus(v.chest)).toBe('low');
    expect(volumeStatus(0)).toBe('none');
    expect(volumeStatus(24)).toBe('high');
  });
});

describe('strength standards', () => {
  it('places a lift on the ladder', () => {
    const r = strengthStandard('male', 'bench', 110, 80);
    expect(r.level).toBe('Intermediate');
    expect(r.nextLevel).toBe('Advanced');
    expect(r.nextKg).toBeCloseTo(140);
    expect(r.progress).toBeGreaterThan(0);
    expect(r.progress).toBeLessThan(1);
    expect(strengthStandard('female', 'squat', 20, 60).level).toBe('Untrained');
    expect(liftForExercise('Barbell_Deadlift')).toBe('deadlift');
    expect(liftForExercise('Plank')).toBeNull();
  });
});

describe('weekly check-in', () => {
  const weekEnd = '2026-09-20';
  const days = Array.from({ length: 14 }, (_, i) => addDays(weekEnd, i - 13));
  const base = {
    weekEnd,
    targetKcal: 2000,
    targetProtein: 150,
    proteinByDay: days.map((date) => ({ date, protein: 160 })),
    workouts: 3,
    plannedWorkouts: 4,
  };

  it('asks for more data when logging is sparse', () => {
    const c = weeklyCheckin({ ...base, intake: [], trend: [], plannedWeeklyKg: -0.5 });
    expect(c.verdict).toBe('not_enough_data');
  });

  it('flags a cut that is too slow and suggests fewer calories', () => {
    const c = weeklyCheckin({
      ...base,
      intake: days.map((date) => ({ date, kcal: 2000 })),
      trend: days.map((date, i) => ({ date, kg: null, trend: 80 - i * 0.01 })),
      plannedWeeklyKg: -0.6,
    });
    expect(c.verdict).toBe('too_slow');
    expect(c.kcalAdjustment).toBe(-100);
    expect(c.proteinDaysHit).toBe(7);
  });

  it('recognises an on-track cut', () => {
    const c = weeklyCheckin({
      ...base,
      intake: days.map((date) => ({ date, kcal: 2050 })),
      trend: days.map((date, i) => ({ date, kg: null, trend: 80 - (i * 0.6) / 7 })),
      plannedWeeklyKg: -0.6,
    });
    expect(c.verdict).toBe('on_track');
    expect(c.kcalAdjustment).toBe(0);
  });

  it('handles maintenance drift', () => {
    const c = weeklyCheckin({
      ...base,
      intake: days.map((date) => ({ date, kcal: 2000 })),
      trend: days.map((date, i) => ({ date, kg: null, trend: 70 + (i * 0.5) / 7 })),
      plannedWeeklyKg: 0,
    });
    expect(c.verdict).toBe('drifting');
    expect(c.kcalAdjustment).toBe(-100);
  });
});
