import { bmr, estimateTdee, KCAL_PER_KG, leanMass, type BodyInput } from './energy';
import { GOALS, signedRate, type GoalType } from './goals';

export interface MacroTargets {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
}

export interface TargetResult extends MacroTargets {
  tdee: number;
  bmr: number;
  dailyAdjustment: number;
  /** Set when a safety floor raised the calorie target. */
  floored: boolean;
  warnings: string[];
}

export const HARD_MIN_KCAL = { male: 1500, female: 1200 } as const;

export interface TargetInput extends BodyInput {
  goal: GoalType;
  ratePctWeek: number;
  /** Measured TDEE from logged data; replaces the formula estimate when present. */
  adaptiveTdee?: number | null;
  /** Reverse diet: calories start here and rise by stepKcal each week until maintenance. */
  reverse?: { startKcal: number; stepKcal: number; weeksElapsed: number } | null;
}

/** Small surplus that supports strength work without a real bulk. */
export const STRENGTH_SURPLUS_KCAL = 150;

const round5 = (n: number) => Math.round(n / 5) * 5;

export function computeTargets(input: TargetInput): TargetResult {
  const def = GOALS[input.goal];
  const warnings: string[] = [];
  const baseBmr = bmr(input);
  const tdee = input.adaptiveTdee ?? estimateTdee(input);

  const weeklyKg = signedRate(input.goal, input.ratePctWeek) * input.weightKg;
  let dailyAdjustment = (weeklyKg * KCAL_PER_KG) / 7;
  if (input.goal === 'recomp') dailyAdjustment = -0.05 * tdee;
  if (input.goal === 'strength') dailyAdjustment = STRENGTH_SURPLUS_KCAL;
  if (input.goal === 'reverse' && input.reverse) {
    const planned = input.reverse.startKcal + input.reverse.stepKcal * Math.max(0, Math.floor(input.reverse.weeksElapsed));
    dailyAdjustment = Math.min(0, planned - tdee);
  }

  if (def.direction !== 0 && input.ratePctWeek > def.warnRate) {
    warnings.push(
      def.direction < 0
        ? 'This rate of loss risks muscle and energy. Consider a slower cut.'
        : 'Gaining this fast mostly adds fat. Consider a slower bulk.',
    );
  }

  let kcal = tdee + dailyAdjustment;
  const floor = Math.max(HARD_MIN_KCAL[input.sex], def.direction < 0 ? baseBmr : 0);
  let floored = false;
  if (kcal < floor) {
    kcal = floor;
    floored = true;
    warnings.push('Calories were raised to a safe minimum. Your loss will be slower than chosen.');
  }

  const lean = leanMass(input.weightKg, input.bodyFatPct);
  const proteinPerKg = def.direction < 0 || input.goal === 'recomp' ? 2.0 : 1.8;
  const protein = lean != null ? lean * (proteinPerKg + 0.3) : input.weightKg * proteinPerKg;

  const fatMin = input.weightKg * 0.6;
  const fat = Math.max(fatMin, (kcal * 0.25) / 9);

  const carbs = Math.max(0, (kcal - protein * 4 - fat * 9) / 4);
  const fiber = (kcal / 1000) * 14;

  return {
    kcal: round5(kcal),
    protein: Math.round(protein),
    carbs: Math.round(carbs),
    fat: Math.round(fat),
    fiber: Math.round(fiber),
    tdee: Math.round(tdee),
    bmr: Math.round(baseBmr),
    dailyAdjustment: Math.round(dailyAdjustment),
    floored,
    warnings,
  };
}
