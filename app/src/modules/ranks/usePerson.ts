import { useBody } from '../../core/goals/useBody';
import { ageFromBirthDate } from '../../lib/energy';
import type { Person } from '../../lib/ranks';

/** The user's sex, age and size for rank comparisons, or null until a profile and weight exist. */
export function usePerson(): Person | null {
  const { profile, currentKg } = useBody();
  if (!profile || currentKg == null) return null;
  return { sex: profile.sex, age: ageFromBirthDate(profile.birthDate), weightKg: currentKg, heightCm: profile.heightCm };
}
