import { adaptiveTdee } from '../adaptiveTdee';
import { addDays, daysBetween } from '../dates';
import { ageFromBirthDate, estimateTdee, mifflinStJeor, type BodyInput } from '../energy';
import { recommendGoal } from '../goals';
import { expectedOn, predict } from '../prediction';
import { calorieFloor, computeTargets, HARD_MIN_KCAL, lowCalorieNotice, macrosFor, weeklyChangeAt, withCustomCalories } from '../targets';
import { computeTrend, weeklyTrendChange } from '../trend';
import { cmToFtIn, ftInToCm, kgToLb } from '../units';

const body: BodyInput = { sex: 'male', weightKg: 85, heightCm: 178, age: 22, activity: 'moderate' };

describe('energy', () => {
  it('computes Mifflin-St Jeor', () => {
    expect(mifflinStJeor('male', 85, 178, 22)).toBeCloseTo(1857.5);
    expect(mifflinStJeor('female', 60, 165, 30)).toBeCloseTo(1320.25);
  });

  it('uses Katch-McArdle when body fat is known', () => {
    const withBf = estimateTdee({ ...body, bodyFatPct: 20 });
    expect(withBf).toBeCloseTo((370 + 21.6 * 68) * 1.55);
  });

  it('computes age around birthdays', () => {
    expect(ageFromBirthDate('2004-09-16', new Date(2026, 8, 15))).toBe(21);
    expect(ageFromBirthDate('2004-09-15', new Date(2026, 8, 15))).toBe(22);
  });
});

describe('targets', () => {
  it('creates a deficit on a cut', () => {
    const t = computeTargets({ ...body, goal: 'cut', ratePctWeek: 0.75 });
    expect(t.kcal).toBeLessThan(t.tdee);
    expect(t.dailyAdjustment).toBe(Math.round((-0.0075 * 85 * 7700) / 7));
    expect(t.protein).toBe(170);
    expect(t.fat).toBeGreaterThanOrEqual(51);
  });

  it('creates a surplus on a lean bulk', () => {
    const t = computeTargets({ ...body, goal: 'lean_bulk', ratePctWeek: 0.25 });
    expect(t.kcal).toBeGreaterThan(t.tdee);
  });

  it('keeps maintenance at TDEE', () => {
    const t = computeTargets({ ...body, goal: 'maintain', ratePctWeek: 0 });
    expect(Math.abs(t.kcal - t.tdee)).toBeLessThanOrEqual(3);
  });

  it('uses custom calories for macros, pace and warnings', () => {
    const input = { ...body, goal: 'cut' as const, ratePctWeek: 0.5 };
    const recommended = computeTargets(input);
    const custom = withCustomCalories(recommended, input, 2000);
    expect(custom.kcal).toBe(2000);
    expect(custom.dailyAdjustment).toBe(2000 - recommended.tdee);
    expect(custom).toMatchObject(macrosFor(input, 2000));
    expect(custom.protein).toBe(recommended.protein);
    expect(Math.abs(custom.protein * 4 + custom.carbs * 4 + custom.fat * 9 - 2000)).toBeLessThanOrEqual(15);
    expect(weeklyChangeAt(2000, 2770)).toBeCloseTo(-0.7, 5);
    expect(custom.warnings).toEqual([]);
  });

  it('uses custom calories as chosen and only builds a notice for very low ones', () => {
    const input = { ...body, goal: 'cut' as const, ratePctWeek: 0.5 };
    const low = withCustomCalories(computeTargets(input), input, 900);
    expect(low.kcal).toBe(900);
    expect(low.floored).toBe(false);
    expect(low.warnings).toEqual([]);
    expect(lowCalorieNotice(input, 2700, 900)).toMatch(/Below 1,500 kcal/);
    expect(lowCalorieNotice(input, 2700, 1800)).toBeNull();

    expect(calorieFloor({ sex: 'female', age: 30 }, 2200)).toBe(HARD_MIN_KCAL.female);
    expect(calorieFloor({ sex: 'female', age: 16 }, 2200)).toBe(1980);
    expect(calorieFloor({ sex: 'female', age: 30, pregnant: true }, 2203)).toBe(2205);
    expect(lowCalorieNotice({ sex: 'female', age: 30, pregnant: true }, 2200, 2000)).toMatch(/pregnant/);
  });

  it('keeps under-18 targets close to maintenance', () => {
    const cut = computeTargets({ ...body, age: 16, goal: 'cut', ratePctWeek: 1 });
    expect(cut.dailyAdjustment).toBe(Math.round(-0.1 * cut.tdee));
    expect(cut.warnings.join(' ')).toMatch(/Under 18/);
    const bulk = computeTargets({ ...body, age: 16, goal: 'bulk', ratePctWeek: 0.5 });
    expect(bulk.dailyAdjustment).toBe(250);
  });

  it('removes deficits and surpluses when pregnant', () => {
    const t = computeTargets({ ...body, sex: 'female', goal: 'cut', ratePctWeek: 0.75, pregnant: true });
    expect(t.dailyAdjustment).toBe(0);
    expect(Math.abs(t.kcal - t.tdee)).toBeLessThanOrEqual(3);
  });

  it('never drops below the safety floor', () => {
    const t = computeTargets({
      sex: 'female',
      weightKg: 50,
      heightCm: 155,
      age: 25,
      activity: 'sedentary',
      goal: 'cut',
      ratePctWeek: 1.25,
    });
    expect(t.floored).toBe(true);
    expect(t.kcal).toBeGreaterThanOrEqual(HARD_MIN_KCAL.female);
    expect(t.warnings.length).toBeGreaterThan(0);
  });

  it('macros add up to roughly the calorie target', () => {
    const t = computeTargets({ ...body, goal: 'cut', ratePctWeek: 0.5 });
    const fromMacros = t.protein * 4 + t.carbs * 4 + t.fat * 9;
    expect(Math.abs(fromMacros - t.kcal)).toBeLessThan(20);
  });
});

describe('trend', () => {
  it('smooths weigh-ins and carries across gaps', () => {
    const trend = computeTrend([
      { date: '2026-09-01', kg: 80 },
      { date: '2026-09-02', kg: 81 },
      { date: '2026-09-04', kg: 79 },
    ]);
    expect(trend).toHaveLength(4);
    expect(trend[0].trend).toBe(80);
    // Bias-corrected: the second weigh-in counts almost as much as the first.
    expect(trend[1].trend).toBeCloseTo((0.9 * 80 + 81) / 1.9);
    expect(trend[2].kg).toBeNull();
    expect(trend[2].trend).toBeCloseTo(trend[1].trend);
    expect(trend[3].trend).toBeCloseTo((0.81 * 80 + 0.9 * 81 + 79) / (0.81 + 0.9 + 1));
  });

  it('keeps the trend close to recent weigh-ins early on', () => {
    const trend = computeTrend([
      { date: '2026-09-17', kg: 75 },
      { date: '2026-09-18', kg: 74.2 },
    ]);
    expect(trend[1].trend).toBeCloseTo(74.58, 2);
  });

  it('matches a plain moving average once there is plenty of data', () => {
    const pts = Array.from({ length: 120 }, (_, i) => ({ date: addDays('2026-01-01', i), kg: 80 }));
    const trend = computeTrend([...pts, { date: addDays('2026-01-01', 120), kg: 70 }]);
    expect(trend[trend.length - 1].trend).toBeCloseTo(80 + 0.1 * (70 - 80), 3);
  });

  it('averages multiple weigh-ins on one day', () => {
    const trend = computeTrend([
      { date: '2026-09-01', kg: 80 },
      { date: '2026-09-01', kg: 82 },
    ]);
    expect(trend[0].kg).toBe(81);
  });

  it('reports weekly change', () => {
    const pts = Array.from({ length: 30 }, (_, i) => ({ date: addDays('2026-08-01', i), kg: 90 - i * 0.1 }));
    const change = weeklyTrendChange(computeTrend(pts, 1));
    expect(change).toBeCloseTo(-0.7);
  });
});

describe('prediction', () => {
  it('flattens a cut over time and finds an ETA', () => {
    const targets = computeTargets({ ...body, goal: 'cut', ratePctWeek: 0.75 });
    const p = predict({ ...body, goal: 'cut', startDate: '2026-09-15', targetKg: 78, intakeKcal: targets.kcal });
    expect(p.etaDate).not.toBeNull();
    const first = p.points[0].expected - p.points[1].expected;
    const later = p.points[5].expected - p.points[6].expected;
    expect(first).toBeGreaterThan(later);
    for (const pt of p.points) {
      expect(pt.low).toBeLessThanOrEqual(pt.expected + 1e-9);
      expect(pt.high).toBeGreaterThanOrEqual(pt.expected - 1e-9);
    }
  });

  it('gains on a bulk', () => {
    const targets = computeTargets({ ...body, goal: 'lean_bulk', ratePctWeek: 0.25 });
    const p = predict({ ...body, goal: 'lean_bulk', startDate: '2026-09-15', targetKg: 88, intakeKcal: targets.kcal });
    expect(p.points[4].expected).toBeGreaterThan(body.weightKg);
    expect(p.etaDate).not.toBeNull();
  });

  it('returns a flat band for maintenance', () => {
    const p = predict({ ...body, goal: 'maintain', startDate: '2026-09-15', intakeKcal: 2800 });
    expect(p.points.every((pt) => pt.expected === 85)).toBe(true);
    expect(p.etaDate).toBeNull();
  });

  it('interpolates between weekly points', () => {
    const targets = computeTargets({ ...body, goal: 'cut', ratePctWeek: 0.75 });
    const p = predict({ ...body, goal: 'cut', startDate: '2026-09-15', targetKg: 78, intakeKcal: targets.kcal });
    const mid = expectedOn(p, addDays('2026-09-15', 3))!;
    expect(mid).toBeLessThan(p.points[0].expected);
    expect(mid).toBeGreaterThan(p.points[1].expected);
  });
});

describe('adaptive TDEE', () => {
  it('derives TDEE from intake and weight change', () => {
    const days = 28;
    const trend = Array.from({ length: days }, (_, i) => ({
      date: addDays('2026-08-01', i),
      kg: null,
      trend: 90 - (i * 0.5) / 7,
    }));
    const intake = trend.map((t) => ({ date: t.date, kcal: 2000 }));
    const r = adaptiveTdee(intake, trend, 2500)!;
    expect(daysBetween(trend[0].date, trend[days - 1].date)).toBe(27);
    // 0.5 kg/week loss ≈ 550 kcal/day deficit.
    expect(r.tdee).toBeGreaterThan(2500);
    expect(r.tdee).toBeLessThan(2600);
    expect(r.confidence).toBe(1);
  });

  it('needs enough logged days', () => {
    const trend = [
      { date: '2026-08-01', kg: 80, trend: 80 },
      { date: '2026-08-20', kg: 79, trend: 79 },
    ];
    expect(adaptiveTdee([{ date: '2026-08-10', kcal: 2000 }], trend, 2500)).toBeNull();
  });
});

describe('goal recommendation', () => {
  it('suggests a cut at higher body fat', () => {
    expect(recommendGoal({ sex: 'male', bodyFatPct: 24, experience: 'intermediate' }).goal).toBe('cut');
  });
  it('suggests a lean bulk when lean', () => {
    expect(recommendGoal({ sex: 'female', bodyFatPct: 20, experience: 'advanced' }).goal).toBe('lean_bulk');
  });
  it('suggests recomp for beginners in the middle', () => {
    expect(recommendGoal({ sex: 'male', bodyFatPct: 17, experience: 'beginner' }).goal).toBe('recomp');
  });
});

describe('units', () => {
  it('converts', () => {
    expect(kgToLb(100)).toBeCloseTo(220.46, 1);
    expect(cmToFtIn(180)).toEqual({ ft: 5, inches: 11 });
    expect(ftInToCm(6, 0)).toBeCloseTo(182.88);
  });
});
