export type UnitSystem = 'metric' | 'imperial';

export const KG_PER_LB = 0.45359237;
export const CM_PER_IN = 2.54;

export const kgToLb = (kg: number) => kg / KG_PER_LB;
export const lbToKg = (lb: number) => lb * KG_PER_LB;

export function displayWeight(kg: number, units: UnitSystem, digits = 1): string {
  const v = units === 'metric' ? kg : kgToLb(kg);
  return v.toFixed(digits);
}

export const weightUnit = (units: UnitSystem) => (units === 'metric' ? 'kg' : 'lb');

export function toKg(value: number, units: UnitSystem): number {
  return units === 'metric' ? value : lbToKg(value);
}

export function cmToFtIn(cm: number): { ft: number; inches: number } {
  const total = cm / CM_PER_IN;
  let ft = Math.floor(total / 12);
  let inches = Math.round(total - ft * 12);
  if (inches === 12) {
    ft += 1;
    inches = 0;
  }
  return { ft, inches };
}

export const ftInToCm = (ft: number, inches: number) => (ft * 12 + inches) * CM_PER_IN;

export function formatNumber(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}
