import type { ModuleId } from '../features/registry';
import { useSettings } from './settings';

/** Screens whose sections can be reordered and hidden. */
export type LayoutScreen = 'today' | 'train' | 'progress' | 'quick';

export interface SectionDef {
  id: string;
  name: string;
  /** Hidden while this feature is off. */
  module?: ModuleId;
  /** Any of these features being on is enough. */
  anyModule?: ModuleId[];
  /** Hidden until the user turns it on. */
  hiddenByDefault?: boolean;
}

export const LAYOUTS: Record<LayoutScreen, { title: string; description: string; sections: SectionDef[] }> = {
  today: {
    title: 'Today',
    description: 'Cards on the Today screen.',
    sections: [
      { id: 'macros', name: 'Calories & macros', module: 'food' },
      { id: 'logPrompt', name: 'Log food & meals', module: 'food', hiddenByDefault: true },
      { id: 'weight', name: 'Weight & goal' },
      { id: 'readiness', name: 'Readiness', module: 'recovery' },
      { id: 'watch', name: 'Watch', module: 'wearables' },
      { id: 'ranks', name: 'Ranks', anyModule: ['rank_physique', 'rank_run'], hiddenByDefault: true },
      { id: 'habits', name: 'Habits', module: 'habits' },
      { id: 'training', name: 'Training', module: 'workouts' },
      { id: 'supplements', name: 'Supplements', module: 'health' },
      { id: 'water', name: 'Water', module: 'water' },
    ],
  },
  train: {
    title: 'Train',
    description: 'Sections on the Train tab.',
    sections: [
      { id: 'week', name: 'Last 7 days', anyModule: ['workouts', 'cardio'] },
      { id: 'today', name: 'Today’s workout', module: 'workouts' },
      { id: 'split', name: 'Split', module: 'workouts' },
      { id: 'overload', name: 'Progressive overload', module: 'workouts', hiddenByDefault: true },
      { id: 'cardio', name: 'Cardio & GPS', module: 'cardio' },
      { id: 'routines', name: 'Routines', module: 'workouts' },
      { id: 'tools', name: 'Tools', module: 'workouts' },
      { id: 'history', name: 'History', module: 'workouts' },
    ],
  },
  progress: {
    title: 'Progress',
    description: 'Sections on the Progress tab.',
    sections: [
      { id: 'chart', name: 'Weight chart' },
      { id: 'stats', name: 'Weight stats' },
      { id: 'ranks', name: 'Ranks & achievements', anyModule: ['rank_physique', 'rank_run', 'achievements'] },
      { id: 'body', name: 'Body & progress' },
      { id: 'health', name: 'Health & recovery', anyModule: ['recovery', 'health'] },
      { id: 'calories', name: 'Calories', module: 'food' },
      { id: 'weighins', name: 'Weigh-ins' },
    ],
  },
  quick: {
    title: 'Quick actions',
    description: 'Shortcuts in the + menu.',
    sections: [
      { id: 'logFood', name: 'Log food', module: 'food' },
      { id: 'weighIn', name: 'Weigh in' },
      { id: 'quickAdd', name: 'Quick add calories', module: 'food' },
      { id: 'recipes', name: 'Recipe ideas', module: 'recipes' },
      { id: 'water', name: 'Add a glass of water', module: 'water', hiddenByDefault: true },
      { id: 'workout', name: 'Start workout', module: 'workouts' },
      { id: 'logWorkout', name: 'Log finished workout', module: 'workouts' },
      { id: 'record', name: 'Record run or ride', module: 'gps' },
      { id: 'logCardio', name: 'Log cardio', module: 'cardio' },
      { id: 'intervals', name: 'Interval timer', module: 'cardio', hiddenByDefault: true },
      { id: 'checkIn', name: 'Readiness check-in', module: 'recovery', hiddenByDefault: true },
      { id: 'logMarker', name: 'Log health marker', module: 'health' },
      { id: 'photo', name: 'Progress photo', module: 'photos', hiddenByDefault: true },
      { id: 'measure', name: 'Measurements', module: 'measurements', hiddenByDefault: true },
    ],
  },
};

export interface LayoutPrefs {
  order: string[];
  /** Explicitly hidden sections. */
  hidden: string[];
  /** Sections hidden by default that the user turned on. */
  shown: string[];
}

export const EMPTY_LAYOUT: LayoutPrefs = { order: [], hidden: [], shown: [] };

/** Saved order; sections added in later versions slot in after their default neighbour. */
export function orderedSections(screen: LayoutScreen, order: string[]): SectionDef[] {
  const all = LAYOUTS[screen].sections;
  const result = order.map((id) => all.find((s) => s.id === id)).filter((s): s is SectionDef => s != null);
  all.forEach((s, i) => {
    if (result.includes(s)) return;
    let at = 0;
    for (let j = i - 1; j >= 0; j--) {
      const k = result.indexOf(all[j]);
      if (k >= 0) {
        at = k + 1;
        break;
      }
    }
    result.splice(at, 0, s);
  });
  return result;
}

export const featureOn = (s: SectionDef, modules: ModuleId[]) =>
  (!s.module || modules.includes(s.module)) && (!s.anyModule || s.anyModule.some((m) => modules.includes(m)));

export const isShown = (s: SectionDef, prefs: LayoutPrefs) => (s.hiddenByDefault ? prefs.shown.includes(s.id) : !prefs.hidden.includes(s.id));

/** Visible section ids for a screen, in the user's order. */
export function visibleSections(screen: LayoutScreen, prefs: LayoutPrefs, modules: ModuleId[]): string[] {
  return orderedSections(screen, prefs.order)
    .filter((s) => featureOn(s, modules) && isShown(s, prefs))
    .map((s) => s.id);
}

export function useLayout(screen: LayoutScreen): string[] {
  const prefs = useSettings((s) => s.layouts[screen]) ?? EMPTY_LAYOUT;
  const modules = useSettings((s) => s.enabledModules);
  return visibleSections(screen, prefs, modules);
}

/** True while any feature that fills this screen is on, whatever the user has hidden. */
export function useScreenAvailable(screen: LayoutScreen): boolean {
  const modules = useSettings((s) => s.enabledModules);
  return LAYOUTS[screen].sections.some((s) => featureOn(s, modules));
}

export type TabName = 'index' | 'food' | 'train' | 'progress' | 'you';

/** Tabs with nothing to show leave the tab bar. */
export function useHiddenTabs(): TabName[] {
  const foodOn = useSettings((s) => s.enabledModules.includes('food'));
  const trainOn = useLayout('train').length > 0;
  const hidden: TabName[] = [];
  if (!foodOn) hidden.push('food');
  if (!trainOn) hidden.push('train');
  return hidden;
}
