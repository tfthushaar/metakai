import {
  ageGrade,
  ageStrengthFactor,
  compareLift,
  matchStandardDistance,
  normalCdf,
  physiqueRank,
  runPercentile,
  runPoints,
  runRank,
  strengthPoints,
  tierFor,
  type Person,
} from '../ranks';

const REF_MAN: Person = { sex: 'male', age: 30, weightKg: 80, heightCm: 175 };

describe('tiers', () => {
  it('maps scores to tiers and divisions', () => {
    expect(tierFor(0)).toMatchObject({ label: 'Iron III', toNext: 5, nextLabel: 'Iron II' });
    expect(tierFor(47)).toMatchObject({ label: 'Gold III', toNext: 3, nextLabel: 'Gold II' });
    expect(tierFor(89.9)).toMatchObject({ label: 'Diamond I', nextLabel: 'Champion' });
    expect(tierFor(95)).toMatchObject({ label: 'Champion', division: null, toNext: null });
    expect(tierFor(-5).label).toBe('Iron III');
    expect(tierFor(120).label).toBe('Champion');
  });
});

describe('strength model', () => {
  it('compares to the untrained average', () => {
    const avg = compareLift('Barbell_Bench_Press_-_Medium_Grip', 57.6, REF_MAN)!;
    expect(avg.multiple).toBeCloseTo(1, 3);
    expect(avg.percentile).toBeCloseTo(50, 0);
    const strong = compareLift('Barbell_Bench_Press_-_Medium_Grip', 115.2, REF_MAN)!;
    expect(strong.multiple).toBeCloseTo(2, 3);
    expect(strong.percentile).toBeCloseTo(97.6, 0);
    expect(compareLift('Unknown', 100, REF_MAN)).toBeNull();
  });

  it('adjusts for age, size and cohort', () => {
    expect(ageStrengthFactor(35)).toBe(1);
    expect(ageStrengthFactor(60)).toBeCloseTo(0.772, 3);
    const older = compareLift('Barbell_Squat', 100, { ...REF_MAN, age: 60 })!;
    const younger = compareLift('Barbell_Squat', 100, REF_MAN)!;
    expect(older.multiple).toBeGreaterThan(younger.multiple);
    const heavy = compareLift('Barbell_Squat', 100, { ...REF_MAN, weightKg: 110 })!;
    expect(heavy.multiple).toBeLessThan(younger.multiple);
    const everyone = compareLift('Barbell_Squat', 100, REF_MAN, 'everyone')!;
    expect(everyone.percentile).toBeGreaterThan(younger.percentile);
  });

  it('scores strength from 1× to 3× untrained', () => {
    expect(strengthPoints(1)).toBe(0);
    expect(strengthPoints(0.5)).toBe(0);
    expect(strengthPoints(3)).toBeCloseTo(100, 5);
    expect(strengthPoints(1.736)).toBeCloseTo(50.2, 0);
  });

  it('normal CDF is accurate', () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 6);
    expect(normalCdf(1.96)).toBeCloseTo(0.975, 3);
    expect(normalCdf(-1)).toBeCloseTo(0.1587, 3);
  });
});

describe('physique pass', () => {
  it('ranks groups from strength and consistency', () => {
    const rank = physiqueRank([{ exerciseId: 'Barbell_Bench_Press_-_Medium_Grip', oneRmKg: 100, dateKey: '2026-09-01' }], { chest: 12 }, 12, REF_MAN);
    const chest = rank.groups.find((g) => g.group === 'chest')!;
    expect(chest.strengthPoints).toBeCloseTo(50.2, 0);
    expect(chest.score).toBeCloseTo(60.2, 0);
    expect(chest.tier.label).toBe('Platinum III');
    const triceps = rank.groups.find((g) => g.group === 'triceps')!;
    expect(triceps.score).toBeCloseTo(26.6, 0);
    const quads = rank.groups.find((g) => g.group === 'quads')!;
    expect(quads.best).toBeNull();
    expect(quads.score).toBe(0);
    expect(rank.rankedCount).toBe(3);
    expect(rank.strongest?.group).toBe('chest');
    // Unranked groups drag the overall down.
    expect(rank.overall).toBeLessThan(chest.score / 2);
  });

  it('returns zero overall with no lifts', () => {
    const rank = physiqueRank([], {}, 12, REF_MAN);
    expect(rank.overall).toBe(0);
    expect(rank.strongest).toBeNull();
  });
});

describe('run pass', () => {
  it('age-grades times', () => {
    expect(ageGrade('5k', 1500, 'male', 30)).toBeCloseTo(51.27, 1);
    expect(ageGrade('5k', 1500, 'male', 50)).toBeCloseTo(60.46, 1);
    expect(ageGrade('nope', 1500, 'male', 30)).toBe(0);
  });

  it('scores and ranks runs', () => {
    expect(runPoints(35)).toBe(0);
    expect(runPoints(90)).toBe(100);
    expect(runPercentile(51.27)).toBeCloseTo(76.6, 0);
    const rank = runRank(
      [
        { distanceId: '5k', timeSec: 1500, dateKey: '2026-09-01', verified: true },
        { distanceId: '5k', timeSec: 1600, dateKey: '2026-08-01', verified: true },
        { distanceId: '10k', timeSec: 3600, dateKey: '2026-09-02', verified: true },
      ],
      6,
      12,
      'male',
      30,
    );
    const fiveK = rank.distances.find((d) => d.distance.id === '5k')!;
    expect(fiveK.effort.timeSec).toBe(1500);
    expect(fiveK.tier.label).toBe('Bronze I');
    expect(rank.consistency).toBe(0.5);
    expect(rank.best?.distance.id).toBe('5k');
    expect(rank.overall).toBeCloseTo(0.8 * fiveK.points + 10, 5);
  });

  it('matches manual runs to standard distances', () => {
    expect(matchStandardDistance(5050, 1515)).toEqual({ distanceId: '5k', timeSec: 1500 });
    expect(matchStandardDistance(7000, 2000)).toBeNull();
  });
});
