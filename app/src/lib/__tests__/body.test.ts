import { bodyFatBand, composition, ffmiLabel, jp3BodyFat, jp7BodyFat, navyBodyFat } from '../bodycomp';
import { addDays } from '../dates';
import { milestoneTargets, timeMilestones, weightMilestones } from '../milestones';

describe('body fat formulas', () => {
  it('Navy method gives plausible values', () => {
    const male = navyBodyFat('male', 178, 38, 85)!;
    expect(male).toBeGreaterThan(14);
    expect(male).toBeLessThan(20);
    const female = navyBodyFat('female', 165, 33, 72, 98)!;
    expect(female).toBeGreaterThan(22);
    expect(female).toBeLessThan(32);
  });

  it('Navy method rejects impossible input', () => {
    expect(navyBodyFat('male', 178, 40, 38)).toBeNull();
    expect(navyBodyFat('female', 165, 33, 72)).toBeNull();
  });

  it('Jackson-Pollock rises with skinfold sum', () => {
    expect(jp3BodyFat('male', 25, 30)).toBeLessThan(jp3BodyFat('male', 25, 60));
    expect(jp3BodyFat('male', 25, 45)).toBeGreaterThan(10);
    expect(jp3BodyFat('male', 25, 45)).toBeLessThan(16);
    expect(jp7BodyFat('female', 30, 120)).toBeGreaterThan(18);
  });

  it('computes composition and FFMI', () => {
    const c = composition(80, 180, 15);
    expect(c.fatKg).toBeCloseTo(12);
    expect(c.leanKg).toBeCloseTo(68);
    expect(c.ffmi).toBeCloseTo(20.99, 1);
    expect(c.normalizedFfmi).toBeCloseTo(c.ffmi);
    expect(ffmiLabel(c.normalizedFfmi, 'male')).toBe('Above average');
  });

  it('labels body fat bands', () => {
    expect(bodyFatBand('male', 11)).toMatch(/Lean/);
    expect(bodyFatBand('female', 40)).toBe('High');
  });
});

describe('milestones', () => {
  it('spaces checkpoints evenly and ends on the goal', () => {
    expect(milestoneTargets(80, 72)).toEqual([78, 76, 74, 72]);
    expect(milestoneTargets(70, 73)).toEqual([71.5, 73]);
    expect(milestoneTargets(80, 80.2)).toEqual([80.2]);
    const big = milestoneTargets(120, 80);
    expect(big).toHaveLength(8);
    expect(big[big.length - 1]).toBe(80);
  });

  it('marks reached and predicted dates', () => {
    const start = '2026-09-01';
    const trend = Array.from({ length: 30 }, (_, i) => ({ date: addDays(start, i), kg: null, trend: 80 - i * 0.1 }));
    const prediction = Array.from({ length: 20 }, (_, i) => ({ date: addDays(start, i * 7), expected: 80 - i * 0.7, low: 0, high: 0 }));
    const ms = weightMilestones({ startKg: 80, targetKg: 72, startDate: start, trend, prediction });
    expect(ms).toHaveLength(4);
    expect(ms[0].reachedDate).toBe(addDays(start, 20));
    expect(ms[0].daysTaken).toBe(20);
    expect(ms[1].reachedDate).toBeNull();
    expect(ms[1].predictedDate).not.toBeNull();
    expect(ms[3].isGoal).toBe(true);
    expect(ms[1].isHalfway).toBe(true);
    expect(ms[0].deltaKg).toBe(-2);
  });

  it('builds time milestones', () => {
    const t = timeMilestones('2026-09-01', '2026-10-01');
    expect(t[0].reached).toBe(true);
    expect(t[2].reached).toBe(false);
  });
});
