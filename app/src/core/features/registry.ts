export type ModuleId =
  | 'food'
  | 'water'
  | 'predictions'
  | 'workouts'
  | 'measurements'
  | 'body_comp'
  | 'photos'
  | 'milestones'
  | 'habits'
  | 'cardio'
  | 'recovery'
  | 'coach';

export type ModuleGroup = 'Nutrition' | 'Body' | 'Training' | 'Lifestyle' | 'Coaching';

export type Permission = 'camera' | 'microphone' | 'location' | 'health';

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
    status: 'planned',
  },
  body_comp: {
    id: 'body_comp',
    name: 'Body composition',
    description: 'Body fat %, lean mass and FFMI.',
    group: 'Body',
    requires: [],
    permissions: [],
    status: 'planned',
  },
  photos: {
    id: 'photos',
    name: 'Progress photos',
    description: 'Private photo timeline with side-by-side comparisons.',
    group: 'Body',
    requires: [],
    permissions: ['camera'],
    status: 'planned',
  },
  milestones: {
    id: 'milestones',
    name: 'Milestone cards',
    description: 'Checkpoints with your next target and predicted date.',
    group: 'Body',
    requires: [],
    permissions: [],
    status: 'planned',
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
    description: 'Cardio sessions and interval timers.',
    group: 'Training',
    requires: [],
    permissions: [],
    status: 'planned',
  },
  recovery: {
    id: 'recovery',
    name: 'Recovery',
    description: 'Readiness, soreness and sleep.',
    group: 'Lifestyle',
    requires: ['workouts'],
    permissions: [],
    status: 'planned',
  },
  habits: {
    id: 'habits',
    name: 'Habits',
    description: 'Daily checklist tied to your goal.',
    group: 'Lifestyle',
    requires: [],
    permissions: [],
    status: 'planned',
  },
  coach: {
    id: 'coach',
    name: 'AI coach',
    description: 'Weekly check-ins and suggestions.',
    group: 'Coaching',
    requires: ['food'],
    permissions: [],
    status: 'planned',
  },
};

export const GROUP_ORDER: ModuleGroup[] = ['Nutrition', 'Body', 'Training', 'Lifestyle', 'Coaching'];

export const isAvailable = (id: ModuleId) => MODULES[id].status === 'available';

export type PresetId = 'cut' | 'lean_bulk' | 'recomp' | 'maintain' | 'minimal' | 'everything';

export const PRESETS: Record<PresetId, { name: string; modules: ModuleId[] }> = {
  cut: { name: 'Cut', modules: ['food', 'water', 'predictions', 'measurements', 'body_comp', 'photos', 'milestones', 'workouts', 'habits'] },
  lean_bulk: { name: 'Lean bulk', modules: ['food', 'predictions', 'workouts', 'measurements', 'photos', 'milestones'] },
  recomp: { name: 'Recomp', modules: ['food', 'predictions', 'workouts', 'measurements', 'body_comp', 'photos', 'milestones'] },
  maintain: { name: 'Maintain', modules: ['food', 'workouts', 'habits'] },
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
