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

export interface Reminder {
  on: boolean;
  hour: number;
  minute: number;
  /** 1 = Sunday … 7 = Saturday; only for weekly reminders. */
  weekday?: number;
}

export type ReminderId = 'weighIn' | 'logFood' | 'photos';

export const DEFAULT_REMINDERS: Record<ReminderId, Reminder> = {
  weighIn: { on: false, hour: 7, minute: 30 },
  logFood: { on: false, hour: 21, minute: 0 },
  photos: { on: false, hour: 8, minute: 0, weekday: 1 },
};

export type TodayCardId = 'macros' | 'logPrompt' | 'weight' | 'habits' | 'training' | 'water';

export const TODAY_CARDS: { id: TodayCardId; name: string; module?: ModuleId }[] = [
  { id: 'macros', name: 'Calories & macros', module: 'food' },
  { id: 'logPrompt', name: 'Log food & meals', module: 'food' },
  { id: 'weight', name: 'Weight & goal' },
  { id: 'habits', name: 'Habits', module: 'habits' },
  { id: 'training', name: 'Training', module: 'workouts' },
  { id: 'water', name: 'Water', module: 'water' },
];

/** Saved order plus any cards added in later versions. */
export function orderedTodayCards(order: TodayCardId[]): TodayCardId[] {
  const known = order.filter((id) => TODAY_CARDS.some((c) => c.id === id));
  return [...known, ...TODAY_CARDS.map((c) => c.id).filter((id) => !known.includes(id))];
}

export const DEFAULT_GYM: GymSettings = {
  barKg: 20,
  plates: [25, 20, 15, 10, 5, 2.5, 1.25].map((weight) => ({ weight, pairs: 4 })),
  restSeconds: 90,
  incrementKg: 2.5,
  keepAwake: true,
};

export interface DriveSettings {
  enabled: boolean;
  email: string | null;
  lastSyncedAt: string | null;
  /** modifiedTime of the Drive data file after our last upload or download. */
  remoteVersion: string | null;
}

export const DEFAULT_DRIVE: DriveSettings = { enabled: false, email: null, lastSyncedAt: null, remoteVersion: null };

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
  appLock: boolean;
  reminders: Record<ReminderId, Reminder>;
  todayOrder: TodayCardId[];
  todayHidden: TodayCardId[];
  adaptiveTargets: boolean;
  carbCycling: boolean;
  drive: DriveSettings;

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
      appLock: false,
      reminders: DEFAULT_REMINDERS,
      todayOrder: TODAY_CARDS.map((c) => c.id),
      todayHidden: [],
      adaptiveTargets: true,
      carbCycling: false,
      drive: DEFAULT_DRIVE,

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
      version: 5,
      migrate: (state, version) => {
        const s = state as Record<string, unknown>;
        if (version < 2) {
          s.gym = DEFAULT_GYM;
          const modules = (s.enabledModules as string[]) ?? [];
          if (!modules.includes('workouts')) s.enabledModules = [...modules, 'workouts'];
        }
        if (version < 3) {
          s.appLock = false;
          s.reminders = DEFAULT_REMINDERS;
          s.todayOrder = TODAY_CARDS.map((c) => c.id);
          s.todayHidden = [];
        }
        if (version < 4) {
          s.adaptiveTargets = true;
          s.carbCycling = false;
        }
        if (version < 5) s.drive = DEFAULT_DRIVE;
        return s as never;
      },
    },
  ),
);

export function useFeature(id: ModuleId): boolean {
  return useSettings((s) => s.enabledModules.includes(id));
}
