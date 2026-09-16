import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { dependents, PRESETS, withDependencies, type ModuleId, type PresetId } from '../features/registry';
import type { AccentId, Appearance, DarkStyle } from '../theme/palette';
import type { UnitSystem } from '../../lib/units';
import { kvStorage } from './kvStorage';

export type AuthMode = 'none' | 'guest' | 'account';

export interface GymSettings {
  barKg: number;
  /** Plate weights (kg) and how many pairs are available. */
  plates: { weight: number; pairs: number }[];
  restSeconds: number;
  /** Smallest jump for barbell loading, used when rounding warm-ups. */
  incrementKg: number;
  keepAwake: boolean;
}

export const DEFAULT_GYM: GymSettings = {
  barKg: 20,
  plates: [25, 20, 15, 10, 5, 2.5, 1.25].map((weight) => ({ weight, pairs: 4 })),
  restSeconds: 90,
  incrementKg: 2.5,
  keepAwake: true,
};

interface SettingsState {
  appearance: Appearance;
  accent: AccentId;
  darkStyle: DarkStyle;
  units: UnitSystem;
  haptics: boolean;
  enabledModules: ModuleId[];
  preset: PresetId | 'custom';
  authMode: AuthMode;
  onboarded: boolean;
  waterGoalMl: number;
  gym: GymSettings;

  set: (patch: Partial<Omit<SettingsState, 'set' | 'toggleModule' | 'applyPreset'>>) => void;
  toggleModule: (id: ModuleId, on: boolean) => void;
  applyPreset: (id: PresetId) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set, get) => ({
      appearance: 'dark',
      accent: 'crimson',
      darkStyle: 'black',
      units: 'metric',
      haptics: true,
      enabledModules: PRESETS.cut.modules,
      preset: 'cut',
      authMode: 'none',
      onboarded: false,
      waterGoalMl: 3000,
      gym: DEFAULT_GYM,

      set: (patch) => set(patch),
      toggleModule: (id, on) => {
        const current = get().enabledModules;
        const next = on
          ? withDependencies([...current, id])
          : current.filter((m) => m !== id && !dependents(id, current).includes(m));
        set({ enabledModules: next, preset: 'custom' });
      },
      applyPreset: (id) => set({ enabledModules: withDependencies(PRESETS[id].modules), preset: id }),
    }),
    {
      name: 'metakai.settings',
      storage: createJSONStorage(() => kvStorage),
      version: 2,
      migrate: (state, version) => {
        const s = state as Record<string, unknown>;
        if (version < 2) {
          s.gym = DEFAULT_GYM;
          const modules = (s.enabledModules as string[]) ?? [];
          if (!modules.includes('workouts')) s.enabledModules = [...modules, 'workouts'];
        }
        return s as never;
      },
    },
  ),
);

export function useFeature(id: ModuleId): boolean {
  return useSettings((s) => s.enabledModules.includes(id));
}
