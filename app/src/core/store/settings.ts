import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { dependents, PRESETS, withDependencies, type ModuleId, type PresetId } from '../features/registry';
import type { AccentId, Appearance, DarkStyle } from '../theme/palette';
import type { UnitSystem } from '../../lib/units';
import type { LayoutPrefs, LayoutScreen } from './layouts';
import { kvStorage } from './kvStorage';

/** 'none' shows the welcome screen; 'guest' means the user has started (all data is local). */
export type AuthMode = 'none' | 'guest';

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

export type StartTab = 'index' | 'food' | 'train' | 'progress';
export type TextScale = 'small' | 'default' | 'large' | 'xlarge';
export const TEXT_SCALE: Record<TextScale, number> = { small: 0.92, default: 1, large: 1.1, xlarge: 1.22 };

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

export interface LeaderboardSettings {
  joined: boolean;
  displayName: string | null;
  country: string | null;
  lastUploadAt: string | null;
  /** Fingerprint of the last uploaded scores, to skip unchanged uploads. */
  lastUploadKey: string | null;
  /** Rounded body stats last sent, so bucket changes (e.g. weight class) are re-sent. */
  lastProfileKey: string | null;
}

export const DEFAULT_LEADERBOARD: LeaderboardSettings = { joined: false, displayName: null, country: null, lastUploadAt: null, lastUploadKey: null, lastProfileKey: null };

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
  /** Section order and visibility per screen. */
  layouts: Partial<Record<LayoutScreen, LayoutPrefs>>;
  /** Tab the app opens on. */
  startTab: StartTab;
  textScale: TextScale;
  /** Skips entrance and layout animations. */
  reduceMotion: boolean;
  leaderboard: LeaderboardSettings;
  adaptiveTargets: boolean;
  carbCycling: boolean;
  /** Pregnant or breastfeeding: targets stay at maintenance. */
  pregnant: boolean;
  /** The low-calorie notice has been shown once. */
  lowCalorieNoticeShown: boolean;
  /** Ingredients kept for recipe ideas. */
  pantry: string[];
  drive: DriveSettings;
  /** Spoken split announcements while recording GPS activities. */
  gpsVoice: boolean;

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
      layouts: {},
      startTab: 'index',
      textScale: 'default',
      reduceMotion: false,
      leaderboard: DEFAULT_LEADERBOARD,
      adaptiveTargets: true,
      carbCycling: false,
      pregnant: false,
      lowCalorieNoticeShown: false,
      pantry: [],
      drive: DEFAULT_DRIVE,
      gpsVoice: true,

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
      version: 9,
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
        }
        if (version < 4) {
          s.adaptiveTargets = true;
          s.carbCycling = false;
        }
        if (version < 5) s.drive = DEFAULT_DRIVE;
        if (version < 6) s.gpsVoice = true;
        if (version < 7 && s.authMode === 'account') s.authMode = 'guest';
        if (version < 8) {
          s.layouts = { today: { order: (s.todayOrder as string[]) ?? [], hidden: (s.todayHidden as string[]) ?? [], shown: [] } };
          delete s.todayOrder;
          delete s.todayHidden;
          s.startTab = 'index';
          s.textScale = 'default';
          s.reduceMotion = false;
        }
        if (version < 9) s.leaderboard = DEFAULT_LEADERBOARD;
        return s as never;
      },
    },
  ),
);

export function useFeature(id: ModuleId): boolean {
  return useSettings((s) => s.enabledModules.includes(id));
}
