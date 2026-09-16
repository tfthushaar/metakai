import { planPhysique } from '../physique';
import { computeTargets } from '../targets';

const body = { sex: 'male' as const, weightKg: 80, heightCm: 178, age: 25, activity: 'moderate' as const };

describe('goal targets', () => {
  it('holds maintenance on a diet break', () => {
    expect(computeTargets({ ...body, goal: 'diet_break', ratePctWeek: 0 }).dailyAdjustment).toBe(0);
  });

  it('adds a small surplus for strength focus', () => {
    const t = computeTargets({ ...body, goal: 'strength', ratePctWeek: 0 });
    expect(t.kcal - t.tdee).toBeGreaterThan(140);
  });

  it('steps calories up on a reverse diet but never past maintenance', () => {
    const at = (weeksElapsed: number) =>
      computeTargets({ ...body, goal: 'reverse', ratePctWeek: 0, reverse: { startKcal: 2000, stepKcal: 100, weeksElapsed } });
    expect(at(0).kcal).toBe(2000);
    expect(at(3).kcal).toBe(2300);
    const late = at(40);
    expect(Math.abs(late.kcal - late.tdee)).toBeLessThanOrEqual(3);
  });

  it('cuts on a mini cut and event prep', () => {
    expect(computeTargets({ ...body, goal: 'mini_cut', ratePctWeek: 1 }).dailyAdjustment).toBeLessThan(0);
    expect(computeTargets({ ...body, goal: 'event_prep', ratePctWeek: 0.75 }).dailyAdjustment).toBeLessThan(0);
  });
});

describe('physique planner', () => {
  it('only cuts when the target keeps current muscle', () => {
    const plan = planPhysique({ sex: 'male', heightCm: 178, weightKg: 90, bodyFatPct: 25, experience: 'intermediate', targetBodyFatPct: 12 });
    expect(plan.leanToGainKg).toBe(0);
    expect(plan.phases.map((p) => p.goal)).toEqual(['cut', 'maintain']);
    expect(plan.targetWeightKg).toBeCloseTo(76.7, 0);
    expect(plan.phases[0].weeks).toBeGreaterThan(15);
  });

  it('cuts, bulks, then trims when more muscle is needed', () => {
    const plan = planPhysique({ sex: 'male', heightCm: 178, weightKg: 85, bodyFatPct: 22, experience: 'beginner', targetBodyFatPct: 12, targetWeightKg: 82 });
    expect(plan.leanToGainKg).toBeGreaterThan(5);
    const goals = plan.phases.map((p) => p.goal);
    expect(goals[0]).toBe('cut');
    expect(goals).toContain('lean_bulk');
    expect(goals[goals.length - 1]).toBe('maintain');
    expect(plan.totalWeeks).toBeGreaterThan(20);
    expect(plan.feasible).toBe(true);
  });

  it('flags targets beyond natural muscularity', () => {
    const plan = planPhysique({ sex: 'male', heightCm: 170, weightKg: 70, bodyFatPct: 15, experience: 'advanced', targetBodyFatPct: 8, targetWeightKg: 95 });
    expect(plan.feasible).toBe(false);
    expect(plan.note).not.toBeNull();
  });
});
