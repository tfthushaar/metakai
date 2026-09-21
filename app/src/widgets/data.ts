import { addWater, listLog, waterTotal } from '../core/db/repo';
import { readBody } from '../core/goals/useBody';
import { LAYOUTS, visibleSections, EMPTY_LAYOUT } from '../core/store/layouts';
import { useSettings } from '../core/store/settings';
import { buildTheme, themeIsDark, type Colors } from '../core/theme/palette';
import { dateKey } from '../lib/dates';
import { sumMacros } from '../modules/food/parse';
import { readinessFor } from '../modules/recovery/repo';
import { sleepNight, watchSleep } from '../modules/wearables/repo';
import type { WidgetIcon } from './icons';

/** Everything the home screen widgets show, read straight from the database. */

export interface CaloriesData {
  kcalLeft: number;
  kcalTarget: number;
  eatenKcal: number;
  protein: { eaten: number; target: number };
  carbs: { eaten: number; target: number };
  fat: { eaten: number; target: number };
}

export function caloriesData(): CaloriesData | null {
  if (!useSettings.getState().enabledModules.includes('food')) return null;
  const { targets } = readBody();
  if (!targets) return null;
  const eaten = sumMacros(listLog(dateKey()));
  return {
    kcalLeft: Math.round(targets.kcal - eaten.kcal),
    kcalTarget: Math.round(targets.kcal),
    eatenKcal: Math.round(eaten.kcal),
    protein: { eaten: Math.round(eaten.protein), target: Math.round(targets.protein) },
    carbs: { eaten: Math.round(eaten.carbs), target: Math.round(targets.carbs) },
    fat: { eaten: Math.round(eaten.fat), target: Math.round(targets.fat) },
  };
}

export interface ReadinessData {
  score: number;
  band: 'high' | 'moderate' | 'low';
  label: string;
  sleepHours: number | null;
  /** The main reason for the score, like "HRV below your normal". */
  note: string | null;
}

export function readinessData(): ReadinessData | null {
  const today = dateKey();
  const r = readinessFor(today);
  if (!r) return null;
  const night = sleepNight(today);
  return {
    score: r.score,
    band: r.band,
    label: r.band === 'high' ? 'Ready to push' : r.band === 'moderate' ? 'Train smart' : 'Take it easy',
    sleepHours: night ? night.asleepMin / 60 : watchSleep(today),
    note: r.flags[0] ?? null,
  };
}

export interface QuickAction {
  id: string;
  label: string;
  icon: WidgetIcon;
  /** Deep link the action opens, or null when the widget does it without opening the app. */
  uri: string | null;
}

/** The + menu's shortcuts, as the widget shows them: short labels and a link for each. */
const ACTIONS: Record<string, Omit<QuickAction, 'id'>> = {
  logFood: { label: 'Food', icon: 'utensils', uri: 'metakai://log-food' },
  weighIn: { label: 'Weigh in', icon: 'scale', uri: 'metakai://log-weight' },
  quickAdd: { label: 'Calories', icon: 'flame', uri: 'metakai://quick-add' },
  recipes: { label: 'Recipes', icon: 'sparkles', uri: 'metakai://recipes' },
  water: { label: '+250 ml', icon: 'droplet', uri: null },
  workout: { label: 'Workout', icon: 'dumbbell', uri: 'metakai://start-workout' },
  logWorkout: { label: 'Log lift', icon: 'check', uri: 'metakai://quick-workout' },
  record: { label: 'Record', icon: 'navigation', uri: 'metakai://record' },
  logCardio: { label: 'Cardio', icon: 'footprints', uri: 'metakai://log-cardio' },
  intervals: { label: 'Intervals', icon: 'timer', uri: 'metakai://interval-timer' },
  checkIn: { label: 'Check in', icon: 'heartPulse', uri: 'metakai://recovery' },
  logMarker: { label: 'Health', icon: 'heartPulse', uri: 'metakai://log-marker' },
  photo: { label: 'Photo', icon: 'user', uri: 'metakai://photos' },
  measure: { label: 'Measure', icon: 'ruler', uri: 'metakai://log-measurements' },
};

/** The user's own quick actions, in their order, as arranged in You → Layout. */
export function quickActions(): QuickAction[] {
  const { layouts, enabledModules } = useSettings.getState();
  return visibleSections('quick', layouts.quick ?? EMPTY_LAYOUT, enabledModules)
    .filter((id) => ACTIONS[id] && LAYOUTS.quick.sections.some((s) => s.id === id))
    .map((id) => ({ id, ...ACTIONS[id] }));
}

export function waterToday(): number {
  return waterTotal(dateKey());
}

export function addGlassOfWater() {
  addWater(dateKey(), 250);
}

export interface WidgetTheme {
  light: Colors;
  /** Null when the app is set to one appearance. */
  dark: Colors | null;
}

/** The app's colours for widgets: both light and dark when it follows the system. */
export function widgetTheme(): WidgetTheme {
  const { appearance, accent, darkStyle, customColors } = useSettings.getState();
  const make = (dark: boolean) => buildTheme(themeIsDark(dark, accent, customColors), accent, darkStyle, customColors).colors;
  if (appearance === 'system' && !(accent === 'custom' && customColors.background)) return { light: make(false), dark: make(true) };
  return { light: make(appearance === 'dark'), dark: null };
}
