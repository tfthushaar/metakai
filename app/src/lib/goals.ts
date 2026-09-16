import type { Sex } from './energy';

export type GoalType =
  | 'cut'
  | 'lean_bulk'
  | 'bulk'
  | 'recomp'
  | 'maintain'
  | 'reverse'
  | 'diet_break'
  | 'mini_cut'
  | 'strength'
  | 'event_prep';

export type Experience = 'beginner' | 'intermediate' | 'advanced';

export type RateDirection = -1 | 0 | 1;

export interface GoalDefinition {
  type: GoalType;
  title: string;
  tagline: string;
  direction: RateDirection;
  /** % body weight per week, absolute value. */
  minRate: number;
  maxRate: number;
  defaultRate: number;
  /** Rate above which the app warns. */
  warnRate: number;
  /** Goals available in the current build. */
  available: boolean;
}

export const GOALS: Record<GoalType, GoalDefinition> = {
  cut: {
    type: 'cut',
    title: 'Cut',
    tagline: 'Lose fat, keep muscle',
    direction: -1,
    minRate: 0.25,
    maxRate: 1.25,
    defaultRate: 0.75,
    warnRate: 1.0,
    available: true,
  },
  lean_bulk: {
    type: 'lean_bulk',
    title: 'Lean bulk',
    tagline: 'Build muscle, limit fat',
    direction: 1,
    minRate: 0.1,
    maxRate: 0.5,
    defaultRate: 0.25,
    warnRate: 0.5,
    available: true,
  },
  bulk: {
    type: 'bulk',
    title: 'Bulk',
    tagline: 'Gain faster, accept some fat',
    direction: 1,
    minRate: 0.25,
    maxRate: 1.0,
    defaultRate: 0.5,
    warnRate: 0.75,
    available: true,
  },
  recomp: {
    type: 'recomp',
    title: 'Recomp',
    tagline: 'Lose fat and gain muscle together',
    direction: 0,
    minRate: 0,
    maxRate: 0,
    defaultRate: 0,
    warnRate: 0,
    available: true,
  },
  maintain: {
    type: 'maintain',
    title: 'Maintain',
    tagline: 'Hold your physique',
    direction: 0,
    minRate: 0,
    maxRate: 0,
    defaultRate: 0,
    warnRate: 0,
    available: true,
  },
  reverse: {
    type: 'reverse',
    title: 'Reverse diet',
    tagline: 'Raise calories after a cut',
    direction: 0,
    minRate: 0,
    maxRate: 0,
    defaultRate: 0,
    warnRate: 0,
    available: true,
  },
  diet_break: {
    type: 'diet_break',
    title: 'Diet break',
    tagline: 'Rest from dieting for 1–2 weeks',
    direction: 0,
    minRate: 0,
    maxRate: 0,
    defaultRate: 0,
    warnRate: 0,
    available: true,
  },
  mini_cut: {
    type: 'mini_cut',
    title: 'Mini cut',
    tagline: 'Short, fast cut during a bulk',
    direction: -1,
    minRate: 0.75,
    maxRate: 1.25,
    defaultRate: 1.0,
    warnRate: 1.25,
    available: true,
  },
  strength: {
    type: 'strength',
    title: 'Strength',
    tagline: 'Get stronger first',
    direction: 0,
    minRate: 0,
    maxRate: 0,
    defaultRate: 0,
    warnRate: 0,
    available: true,
  },
  event_prep: {
    type: 'event_prep',
    title: 'Event prep',
    tagline: 'Be ready by a date',
    direction: -1,
    minRate: 0.25,
    maxRate: 1.25,
    defaultRate: 0.75,
    warnRate: 1.0,
    available: true,
  },
};

export const AVAILABLE_GOALS = Object.values(GOALS).filter((g) => g.available);

/** The everyday goals offered during onboarding; the rest are phases chosen later. */
export const CORE_GOALS = (['cut', 'lean_bulk', 'bulk', 'recomp', 'maintain'] as GoalType[]).map((g) => GOALS[g]);

/** Goals that run for a fixed length of time. */
export const TIMED_GOALS: Partial<Record<GoalType, number[]>> = {
  diet_break: [7, 14],
  mini_cut: [14, 28, 42],
};

/** Suggested lean-bulk rate by training experience (% body weight / week). */
export const BULK_RATE_BY_EXPERIENCE: Record<Experience, number> = {
  beginner: 0.35,
  intermediate: 0.25,
  advanced: 0.15,
};

export interface Recommendation {
  goal: GoalType;
  reason: string;
}

export function recommendGoal(input: {
  sex: Sex;
  bodyFatPct?: number | null;
  experience: Experience;
}): Recommendation {
  const { sex, bodyFatPct, experience } = input;
  if (bodyFatPct == null) {
    return experience === 'beginner'
      ? { goal: 'recomp', reason: 'New lifters can lose fat and build muscle at the same time.' }
      : { goal: 'maintain', reason: 'Add a body fat estimate for a more specific recommendation.' };
  }
  const high = sex === 'male' ? 20 : 30;
  const lean = sex === 'male' ? 15 : 24;
  if (bodyFatPct >= high) {
    return { goal: 'cut', reason: 'Dropping body fat first makes later muscle gain leaner and easier to see.' };
  }
  if (bodyFatPct <= lean) {
    return { goal: 'lean_bulk', reason: 'You are lean enough to gain muscle with a small surplus.' };
  }
  if (experience === 'beginner') {
    return { goal: 'recomp', reason: 'At your body fat and experience, recomposition works well.' };
  }
  return { goal: 'cut', reason: 'A short cut will put you in a better position to bulk.' };
}

/** Signed weekly rate as a fraction of body weight. */
export function signedRate(goal: GoalType, ratePctWeek: number): number {
  return (GOALS[goal].direction * ratePctWeek) / 100;
}
