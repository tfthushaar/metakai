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
  /** Pregnant or breastfeeding: no deficit or surplus. */
  pregnant?: boolean;
}

/** Under 18: deficits stay within 10% of maintenance and surpluses small. */
export const MINOR_MAX_DEFICIT = 0.1;
export const MINOR_MAX_SURPLUS_KCAL = 250;

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

  if (input.pregnant) {
    dailyAdjustment = 0;
    warnings.push('Targets stay at maintenance while pregnant or breastfeeding. Check them with your doctor or midwife.');
  } else if (input.age < 18) {
    const capped = Math.max(-MINOR_MAX_DEFICIT * tdee, Math.min(MINOR_MAX_SURPLUS_KCAL, dailyAdjustment));
    if (Math.round(capped) !== Math.round(dailyAdjustment)) warnings.push('Under 18, targets stay close to maintenance while you’re still growing.');
    dailyAdjustment = capped;
  } else if (def.direction !== 0 && input.ratePctWeek > def.warnRate) {
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

  return {
    kcal: round5(kcal),
    ...macrosFor(input, kcal),
    tdee: Math.round(tdee),
    bmr: Math.round(baseBmr),
    dailyAdjustment: Math.round(dailyAdjustment),
    floored,
    warnings,
  };
}

/** Protein, fat, carbs and fiber for a daily calorie target. */
export function macrosFor(input: BodyInput & { goal: GoalType }, kcal: number): Omit<MacroTargets, 'kcal'> {
  const def = GOALS[input.goal];
  const lean = leanMass(input.weightKg, input.bodyFatPct);
  const proteinPerKg = def.direction < 0 || input.goal === 'recomp' ? 2.0 : 1.8;
  const protein = lean != null ? lean * (proteinPerKg + 0.3) : input.weightKg * proteinPerKg;
  const fat = Math.max(input.weightKg * 0.6, (kcal * 0.25) / 9);
  const carbs = Math.max(0, (kcal - protein * 4 - fat * 9) / 4);
  const fiber = (kcal / 1000) * 14;
  return { protein: Math.round(protein), carbs: Math.round(carbs), fat: Math.round(fat), fiber: Math.round(fiber) };
}

/** Expected weekly weight change in kg when eating `kcal` a day against maintenance `tdee`. */
export const weeklyChangeAt = (kcal: number, tdee: number) => ((kcal - tdee) * 7) / KCAL_PER_KG;

/** Lowest daily calories anyone can set, including a custom target. */
export function calorieFloor(input: Pick<TargetInput, 'sex' | 'age' | 'pregnant'>, tdee: number): number {
  if (input.pregnant) return round5(tdee);
  if (input.age < 18) return round5(Math.max(HARD_MIN_KCAL[input.sex], tdee * (1 - MINOR_MAX_DEFICIT)));
  return HARD_MIN_KCAL[input.sex];
}

/** Targets for calories the user chose instead of a pace. Macros follow the chosen calories as they are. */
export function withCustomCalories(recommended: TargetResult, input: TargetInput, chosenKcal: number): TargetResult {
  const kcal = Math.max(0, Math.round(chosenKcal));
  return { ...recommended, kcal, ...macrosFor(input, kcal), dailyAdjustment: Math.round(kcal - recommended.tdee), floored: false, warnings: [] };
}

/** The one-time notice shown the first time someone sets calories below the usual minimum. */
export function lowCalorieNotice(input: Pick<TargetInput, 'sex' | 'age' | 'pregnant'>, tdee: number, kcal: number): string | null {
  const floor = calorieFloor(input, tdee);
  if (kcal >= floor) return null;
  if (input.pregnant) return 'Eating below maintenance while pregnant or breastfeeding isn’t usually recommended. Check with your doctor or midwife.';
  if (input.age < 18) return 'Large deficits aren’t recommended while you’re still growing. Consider staying closer to maintenance.';
  return `Below ${floor.toLocaleString('en-US')} kcal a day it’s hard to get enough nutrients and keep muscle. Metakai will use your number, and won’t warn you again.`;
}
