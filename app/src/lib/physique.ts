import type { Sex } from './energy';
import type { Experience, GoalType } from './goals';

export interface PhysiqueInput {
  sex: Sex;
  heightCm: number;
  weightKg: number;
  bodyFatPct: number;
  experience: Experience;
  targetBodyFatPct: number;
  /** Optional; when omitted, the target keeps today's lean mass. */
  targetWeightKg?: number | null;
}

export interface PlannedPhase {
  goal: GoalType;
  startKg: number;
  endKg: number;
  startBf: number;
  endBf: number;
  weeks: number;
  ratePctWeek: number;
}

export interface PhysiquePlan {
  currentLeanKg: number;
  targetLeanKg: number;
  targetWeightKg: number;
  leanToGainKg: number;
  targetFfmi: number;
  feasible: boolean;
  note: string | null;
  phases: PlannedPhase[];
  totalWeeks: number;
}

/** Monthly lean mass a lifter can typically add on a lean bulk. */
const LEAN_GAIN_PER_MONTH: Record<Sex, Record<Experience, number>> = {
  male: { beginner: 0.9, intermediate: 0.45, advanced: 0.2 },
  female: { beginner: 0.45, intermediate: 0.22, advanced: 0.1 },
};

/** Body fat below which starting a bulk makes sense. */
const BULK_START_BF: Record<Sex, number> = { male: 15, female: 25 };
const FFMI_LIMIT: Record<Sex, number> = { male: 25, female: 22 };

const CUT_RATE = 0.75;
const MINI_CUT_RATE = 1.0;
const WEEKS_PER_MONTH = 4.345;

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Weeks to go from start to end losing a fixed % of current weight each week. */
function cutWeeks(startKg: number, endKg: number, ratePct: number): number {
  let w = startKg;
  let weeks = 0;
  while (w > endKg && weeks < 260) {
    w -= (w * ratePct) / 100;
    weeks += 1;
  }
  return weeks;
}

/**
 * Turns a target physique into a phase sequence: cut to a sensible starting point,
 * lean bulk for any muscle still needed (roughly equal lean and fat gain), then cut
 * to the target body fat and maintain.
 */
export function planPhysique(input: PhysiqueInput): PhysiquePlan {
  const { sex, heightCm, weightKg, bodyFatPct, experience, targetBodyFatPct } = input;
  const currentLean = weightKg * (1 - bodyFatPct / 100);
  const targetWeight = input.targetWeightKg ?? currentLean / (1 - targetBodyFatPct / 100);
  const targetLean = targetWeight * (1 - targetBodyFatPct / 100);
  const leanToGain = Math.max(0, targetLean - currentLean);
  const h = heightCm / 100;
  const targetFfmi = targetLean / (h * h) + 6.1 * (1.8 - h);
  const feasible = targetFfmi <= FFMI_LIMIT[sex];

  const phases: PlannedPhase[] = [];
  let weight = weightKg;
  let bf = bodyFatPct;
  let lean = currentLean;

  const pushCut = (goal: GoalType, toBf: number, rate: number) => {
    const endKg = lean / (1 - toBf / 100);
    const weeks = cutWeeks(weight, endKg, rate);
    if (weeks === 0) return;
    phases.push({ goal, startKg: round1(weight), endKg: round1(endKg), startBf: round1(bf), endBf: round1(toBf), weeks, ratePctWeek: rate });
    weight = endKg;
    bf = toBf;
  };

  if (leanToGain < 1) {
    if (bf > targetBodyFatPct + 1) pushCut('cut', targetBodyFatPct, CUT_RATE);
    else if (leanToGain > 0) {
      phases.push({ goal: 'recomp', startKg: round1(weight), endKg: round1(targetWeight), startBf: round1(bf), endBf: round1(targetBodyFatPct), weeks: 12, ratePctWeek: 0 });
      weight = targetWeight;
      bf = targetBodyFatPct;
    }
  } else {
    const bulkStartBf = Math.max(targetBodyFatPct, BULK_START_BF[sex] - 3);
    if (bf > BULK_START_BF[sex] || bf > targetBodyFatPct + 5) pushCut('cut', bulkStartBf, CUT_RATE);

    const months = leanToGain / LEAN_GAIN_PER_MONTH[sex][experience];
    const weeks = Math.ceil(months * WEEKS_PER_MONTH);
    const fat = weight - lean + leanToGain;
    lean += leanToGain;
    const endKg = lean + fat;
    const endBf = (fat / endKg) * 100;
    const ratePct = ((endKg - weight) / weight / weeks) * 100;
    phases.push({ goal: 'lean_bulk', startKg: round1(weight), endKg: round1(endKg), startBf: round1(bf), endBf: round1(endBf), weeks, ratePctWeek: Math.round(ratePct * 100) / 100 });
    weight = endKg;
    bf = endBf;

    const gap = bf - targetBodyFatPct;
    if (gap > 0.5) pushCut(gap > 4 ? 'cut' : 'mini_cut', targetBodyFatPct, gap > 4 ? CUT_RATE : MINI_CUT_RATE);
  }

  phases.push({ goal: 'maintain', startKg: round1(weight), endKg: round1(weight), startBf: round1(bf), endBf: round1(bf), weeks: 0, ratePctWeek: 0 });

  let note: string | null = null;
  if (!feasible) note = 'This target needs more muscle than is typical without enhancement. Consider a leaner, lighter target.';
  else if (targetBodyFatPct < (sex === 'male' ? 8 : 16)) note = 'Very low body fat is hard to hold. Plan to maintain a few percent higher.';

  return {
    currentLeanKg: round1(currentLean),
    targetLeanKg: round1(targetLean),
    targetWeightKg: round1(targetWeight),
    leanToGainKg: round1(leanToGain),
    targetFfmi: round1(targetFfmi),
    feasible,
    note,
    phases,
    totalWeeks: phases.reduce((s, p) => s + p.weeks, 0),
  };
}
