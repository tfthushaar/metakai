import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { dependents, PRESETS, withDependencies, type ModuleId, type PresetId } from '../features/registry';
import type { AccentId, Appearance, DarkStyle } from '../theme/palette';
import type { UnitSystem } from '../../lib/units';
import { kvStorage } from './kvStorage';

export type AuthMode = 'none' | 'guest' | 'account';

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
      version: 1,
    },
  ),
);

export function useFeature(id: ModuleId): boolean {
  return useSettings((s) => s.enabledModules.includes(id));
}
