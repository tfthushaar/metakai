export type Sex = 'male' | 'female';

export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'very' | 'extra';

export const ACTIVITY_MULTIPLIER: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  very: 1.725,
  extra: 1.9,
};

export const ACTIVITY_LABEL: Record<ActivityLevel, { title: string; detail: string }> = {
  sedentary: { title: 'Sedentary', detail: 'Desk job, under 5k steps' },
  light: { title: 'Lightly active', detail: '5–8k steps or 1–3 workouts/week' },
  moderate: { title: 'Moderately active', detail: '8–12k steps or 3–5 workouts/week' },
  very: { title: 'Very active', detail: 'Hard training 6–7 days/week' },
  extra: { title: 'Extremely active', detail: 'Physical job plus hard training' },
};

/** Energy stored per kg of body weight change. Adaptive TDEE corrects the error over time. */
export const KCAL_PER_KG = 7700;

export function ageFromBirthDate(birthDate: string, today: Date = new Date()): number {
  const b = new Date(birthDate);
  let age = today.getFullYear() - b.getFullYear();
  const beforeBirthday =
    today.getMonth() < b.getMonth() ||
    (today.getMonth() === b.getMonth() && today.getDate() < b.getDate());
  if (beforeBirthday) age -= 1;
  return age;
}

export function mifflinStJeor(sex: Sex, weightKg: number, heightCm: number, age: number): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return sex === 'male' ? base + 5 : base - 161;
}

export function katchMcArdle(leanMassKg: number): number {
  return 370 + 21.6 * leanMassKg;
}

export interface BodyInput {
  sex: Sex;
  weightKg: number;
  heightCm: number;
  age: number;
  activity: ActivityLevel;
  bodyFatPct?: number | null;
}

export function leanMass(weightKg: number, bodyFatPct?: number | null): number | null {
  if (bodyFatPct == null) return null;
  return weightKg * (1 - bodyFatPct / 100);
}

/** Katch-McArdle when body fat is known, Mifflin-St Jeor otherwise. */
export function bmr(input: BodyInput): number {
  const lean = leanMass(input.weightKg, input.bodyFatPct);
  if (lean != null) return katchMcArdle(lean);
  return mifflinStJeor(input.sex, input.weightKg, input.heightCm, input.age);
}

export function estimateTdee(input: BodyInput): number {
  return bmr(input) * ACTIVITY_MULTIPLIER[input.activity];
}
