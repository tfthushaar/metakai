export type ModuleId =
  | 'food'
  | 'water'
  | 'recipes'
  | 'predictions'
  | 'workouts'
  | 'measurements'
  | 'body_comp'
  | 'photos'
  | 'milestones'
  | 'habits'
  | 'cardio'
  | 'gps'
  | 'recovery'
  | 'health'
  | 'rank_physique'
  | 'rank_run'
  | 'achievements'
  | 'coach'
  | 'wearables';

export type ModuleGroup = 'Nutrition' | 'Body' | 'Training' | 'Lifestyle' | 'Motivation' | 'Coaching' | 'Devices';

export type Permission = 'camera' | 'microphone' | 'location' | 'health' | 'bluetooth';

export interface ModuleDef {
  id: ModuleId;
  name: string;
  description: string;
  group: ModuleGroup;
  requires: ModuleId[];
  permissions: Permission[];
  /** Planned modules are hidden until built. */
  status: 'available' | 'planned';
}

export const MODULES: Record<ModuleId, ModuleDef> = {
  food: {
    id: 'food',
    name: 'Food logging',
    description: 'Log meals in plain language and track calories and macros.',
    group: 'Nutrition',
    requires: [],
    permissions: [],
    status: 'available',
  },
  water: {
    id: 'water',
    name: 'Water',
    description: 'Track daily water intake.',
    group: 'Nutrition',
    requires: [],
    permissions: [],
    status: 'available',
  },
  recipes: {
    id: 'recipes',
    name: 'Recipe ideas',
    description: 'Recipes from the ingredients you have, matched to your targets. Uses your own AI key.',
    group: 'Nutrition',
    requires: ['food'],
    permissions: ['camera'],
    status: 'available',
  },
  predictions: {
    id: 'predictions',
    name: 'Predictions',
    description: 'Predicted weight curve, goal date and adaptive calorie targets.',
    group: 'Body',
    requires: [],
    permissions: [],
    status: 'available',
  },
  measurements: {
    id: 'measurements',
    name: 'Measurements',
    description: 'Waist, arms, chest and more over time.',
    group: 'Body',
    requires: [],
    permissions: [],
    status: 'available',
  },
  body_comp: {
    id: 'body_comp',
    name: 'Body composition',
    description: 'Body fat %, lean mass and FFMI.',
    group: 'Body',
    requires: [],
    permissions: [],
    status: 'available',
  },
  photos: {
    id: 'photos',
    name: 'Progress photos',
    description: 'Private photo timeline with side-by-side comparisons.',
    group: 'Body',
    requires: [],
    permissions: ['camera'],
    status: 'available',
  },
  milestones: {
    id: 'milestones',
    name: 'Milestone cards',
    description: 'Checkpoints with your next target and predicted date.',
    group: 'Body',
    requires: [],
    permissions: [],
    status: 'available',
  },
  workouts: {
    id: 'workouts',
    name: 'Workouts',
    description: 'Gym logger, rest timer, personal records and routines.',
    group: 'Training',
    requires: [],
    permissions: [],
    status: 'available',
  },
  cardio: {
    id: 'cardio',
    name: 'Cardio',
    description: 'Log runs, rides and other cardio, plus a Tabata, HIIT and EMOM timer.',
    group: 'Training',
    requires: [],
    permissions: [],
    status: 'available',
  },
  gps: {
    id: 'gps',
    name: 'GPS tracking',
    description: 'Record runs, walks, hikes and rides with live pace, splits, route and best efforts.',
    group: 'Training',
    requires: ['cardio'],
    permissions: ['location'],
    status: 'available',
  },
  recovery: {
    id: 'recovery',
    name: 'Recovery',
    description: 'Daily readiness check-in with sleep, soreness and stress, plus muscle recovery.',
    group: 'Lifestyle',
    requires: [],
    permissions: [],
    status: 'available',
  },
  health: {
    id: 'health',
    name: 'Health & supplements',
    description: 'Supplement checklist, blood pressure, resting heart rate, steps and lab results.',
    group: 'Lifestyle',
    requires: [],
    permissions: [],
    status: 'available',
  },
  habits: {
    id: 'habits',
    name: 'Habits',
    description: 'Daily checklist tied to your goal.',
    group: 'Lifestyle',
    requires: [],
    permissions: [],
    status: 'available',
  },
  rank_physique: {
    id: 'rank_physique',
    name: 'Physique pass',
    description: 'Ranks every muscle group from your strength and consistency, compared with people like you.',
    group: 'Motivation',
    requires: ['workouts'],
    permissions: [],
    status: 'available',
  },
  rank_run: {
    id: 'rank_run',
    name: 'Run pass',
    description: 'Age-graded ranks for your 1K to marathon times from GPS runs.',
    group: 'Motivation',
    requires: ['gps'],
    permissions: [],
    status: 'available',
  },
  achievements: {
    id: 'achievements',
    name: 'Achievements',
    description: 'Badges for milestones across the app, shareable as cards.',
    group: 'Motivation',
    requires: [],
    permissions: [],
    status: 'available',
  },
  coach: {
    id: 'coach',
    name: 'AI coach',
    description: 'Short notes on your weekly check-in from your own AI key.',
    group: 'Coaching',
    requires: ['food'],
    permissions: [],
    status: 'available',
  },
  wearables: {
    id: 'wearables',
    name: 'Watches & health apps',
    description: 'Steps, sleep, heart rate, weigh-ins and workouts from your watch, plus live heart rate while you train.',
    group: 'Devices',
    requires: [],
    permissions: ['health', 'bluetooth'],
    status: 'available',
  },
};

export const GROUP_ORDER: ModuleGroup[] = ['Nutrition', 'Body', 'Training', 'Lifestyle', 'Motivation', 'Coaching', 'Devices'];

export const isAvailable = (id: ModuleId) => MODULES[id].status === 'available';

export type PresetId = 'cut' | 'lean_bulk' | 'recomp' | 'maintain' | 'minimal' | 'everything';

export const PRESETS: Record<PresetId, { name: string; modules: ModuleId[] }> = {
  cut: { name: 'Cut', modules: ['food', 'water', 'predictions', 'measurements', 'body_comp', 'photos', 'milestones', 'workouts', 'cardio', 'habits', 'rank_physique', 'achievements', 'wearables'] },
  lean_bulk: { name: 'Lean bulk', modules: ['food', 'predictions', 'workouts', 'recovery', 'measurements', 'photos', 'milestones', 'rank_physique', 'achievements', 'wearables'] },
  recomp: { name: 'Recomp', modules: ['food', 'predictions', 'workouts', 'cardio', 'recovery', 'measurements', 'body_comp', 'photos', 'milestones', 'rank_physique', 'achievements', 'wearables'] },
  maintain: { name: 'Maintain', modules: ['food', 'workouts', 'habits', 'achievements', 'wearables'] },
  minimal: { name: 'Minimal', modules: ['food'] },
  everything: { name: 'Everything', modules: Object.keys(MODULES) as ModuleId[] },
};

/** Adds every module the given set depends on. */
export function withDependencies(ids: ModuleId[]): ModuleId[] {
  const out = new Set<ModuleId>();
  const visit = (id: ModuleId) => {
    if (out.has(id)) return;
    out.add(id);
    MODULES[id].requires.forEach(visit);
  };
  ids.forEach(visit);
  return [...out];
}

/** Enabled modules that would lose a requirement if `id` were turned off. */
export function dependents(id: ModuleId, enabled: ModuleId[]): ModuleId[] {
  return enabled.filter((m) => m !== id && MODULES[m].requires.includes(id));
}
