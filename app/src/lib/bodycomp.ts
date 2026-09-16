import type { Sex } from './energy';

/** Siri equation: body density → body fat %. */
export const siri = (density: number) => 495 / density - 450;

/** US Navy tape method. All measurements in cm. */
export function navyBodyFat(sex: Sex, heightCm: number, neckCm: number, waistCm: number, hipCm?: number | null): number | null {
  if (sex === 'male') {
    if (waistCm <= neckCm) return null;
    return 495 / (1.0324 - 0.19077 * Math.log10(waistCm - neckCm) + 0.15456 * Math.log10(heightCm)) - 450;
  }
  if (hipCm == null || waistCm + hipCm <= neckCm) return null;
  return 495 / (1.29579 - 0.35004 * Math.log10(waistCm + hipCm - neckCm) + 0.221 * Math.log10(heightCm)) - 450;
}

/** Jackson-Pollock 3-site. Men: chest, abdomen, thigh. Women: triceps, suprailiac, thigh. Skinfolds in mm. */
export function jp3BodyFat(sex: Sex, age: number, sumMm: number): number {
  const s = sumMm;
  const density =
    sex === 'male'
      ? 1.10938 - 0.0008267 * s + 0.0000016 * s * s - 0.0002574 * age
      : 1.0994921 - 0.0009929 * s + 0.0000023 * s * s - 0.0001392 * age;
  return siri(density);
}

/** Jackson-Pollock 7-site: chest, midaxillary, triceps, subscapular, abdomen, suprailiac, thigh. */
export function jp7BodyFat(sex: Sex, age: number, sumMm: number): number {
  const s = sumMm;
  const density =
    sex === 'male'
      ? 1.112 - 0.00043499 * s + 0.00000055 * s * s - 0.00028826 * age
      : 1.097 - 0.00046971 * s + 0.00000056 * s * s - 0.00012828 * age;
  return siri(density);
}

export const JP3_SITES: Record<Sex, string[]> = {
  male: ['chest', 'abdomen', 'thigh'],
  female: ['triceps', 'suprailiac', 'thigh'],
};

export interface Composition {
  leanKg: number;
  fatKg: number;
  ffmi: number;
  normalizedFfmi: number;
}

export function composition(weightKg: number, heightCm: number, bodyFatPct: number): Composition {
  const fatKg = (weightKg * bodyFatPct) / 100;
  const leanKg = weightKg - fatKg;
  const h = heightCm / 100;
  const ffmi = leanKg / (h * h);
  return { leanKg, fatKg, ffmi, normalizedFfmi: ffmi + 6.1 * (1.8 - h) };
}

export function waistToHeight(waistCm: number, heightCm: number): number {
  return waistCm / heightCm;
}

export function ffmiLabel(normalized: number, sex: Sex): string {
  const offset = sex === 'female' ? -3 : 0;
  if (normalized < 18 + offset) return 'Below average';
  if (normalized < 20 + offset) return 'Average';
  if (normalized < 22 + offset) return 'Above average';
  if (normalized < 23.5 + offset) return 'Excellent';
  if (normalized < 25 + offset) return 'Superior';
  return 'Near natural limit';
}

/** Rough visual ranges shown when the user has no measurement. */
export const BODY_FAT_BANDS: Record<Sex, { max: number; label: string }[]> = {
  male: [
    { max: 8, label: 'Very lean, veins visible on abs' },
    { max: 12, label: 'Lean, clear abs' },
    { max: 16, label: 'Fit, some ab outline' },
    { max: 20, label: 'Average, soft midsection' },
    { max: 25, label: 'Above average' },
    { max: 100, label: 'High' },
  ],
  female: [
    { max: 16, label: 'Very lean' },
    { max: 20, label: 'Lean, some ab outline' },
    { max: 25, label: 'Fit' },
    { max: 30, label: 'Average' },
    { max: 35, label: 'Above average' },
    { max: 100, label: 'High' },
  ],
};

export function bodyFatBand(sex: Sex, pct: number): string {
  return BODY_FAT_BANDS[sex].find((b) => pct <= b.max)!.label;
}
