import type { Checkin } from './checkin';

/**
 * AI coach notes for the weekly check-in. Only weekly aggregates are sent, never logs, names or
 * dates of birth. The app's own calorie adjustment stays the only thing that changes targets.
 */

export interface CoachInput {
  goal: string;
  sex: 'male' | 'female';
  age: number;
  experience: string;
  weightKg: number;
  targetKcal: number;
  targetProtein: number;
  minimumKcal: number;
  maintenanceKcal: number | null;
  /** Newest week first. */
  weeks: Checkin[];
}

export interface CoachNote {
  title: string;
  detail: string;
}

export interface CoachReply {
  summary: string;
  notes: CoachNote[];
}

export const COACH_SYSTEM = `You are a calm, evidence-based coach inside a fitness tracking app. You get four weeks of aggregates.
Write a one or two sentence summary of how the goal is going, then up to 3 notes with the most useful next steps.
Rules:
- Base every point on the numbers. If data is thin, say what to log.
- Note titles are at most 6 words. Details are at most 2 short sentences.
- The app already suggests calorie changes, so don't give calorie numbers. Focus on habits: logging, protein, training, steps, sleep, consistency.
- Never suggest eating below minimumKcal, skipping meals for long periods, water or salt manipulation, diuretics, laxatives, drugs, steroids or other performance-enhancing substances.
- Nothing medical. For pain, illness, pregnancy or eating concerns, suggest a professional.
- Kind, direct and plain. No emojis, no markdown, no shaming.`;

export const COACH_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    notes: {
      type: 'array',
      items: { type: 'object', properties: { title: { type: 'string' }, detail: { type: 'string' } }, required: ['title', 'detail'] },
    },
  },
  required: ['summary', 'notes'],
};

export const COACH_SHAPE = '{"summary": string, "notes": [{"title": string, "detail": string}]}';

const round = (n: number | null, dp = 0) => (n == null ? null : Math.round(n * 10 ** dp) / 10 ** dp);

/** The compact payload sent to the model. Also used as the cache key. */
export function coachPayload(input: CoachInput): string {
  return JSON.stringify({
    goal: input.goal,
    sex: input.sex,
    age: input.age,
    experience: input.experience,
    weightKg: round(input.weightKg, 1),
    targets: { kcal: input.targetKcal, proteinG: input.targetProtein },
    minimumKcal: input.minimumKcal,
    measuredMaintenanceKcal: input.maintenanceKcal,
    weeks: input.weeks.map((w, i) => ({
      weeksAgo: i,
      daysFoodLogged: w.daysLogged,
      avgKcal: round(w.avgKcal),
      proteinTargetDays: w.proteinDaysHit,
      weightChangeKg: round(w.weeklyChangeKg, 2),
      plannedChangeKg: round(w.plannedWeeklyKg, 2),
      workouts: w.workouts,
      plannedWorkouts: w.plannedWorkouts,
      status: w.verdict,
    })),
  });
}

const UNSAFE = /diuretic|laxative|steroid|\bsarms?\b|clenbuterol|\bpeds?\b|performance[- ]enhanc|purg|water ?cut|dehydrat|starv|skip (all|every)|below (your )?minimum/i;

const clip = (s: unknown, max: number) => {
  const text = typeof s === 'string' ? s.replace(/[*_#`]/g, '').replace(/\s+/g, ' ').trim() : '';
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
};

/** Parses and cleans a model answer. Returns null if nothing usable and safe is left. */
export function parseCoachReply(raw: string): CoachReply | null {
  let data: { summary?: unknown; notes?: unknown };
  try {
    data = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
  } catch {
    return null;
  }
  const summary = clip(data.summary, 280);
  if (!summary || UNSAFE.test(summary)) return null;
  const notes = (Array.isArray(data.notes) ? data.notes : [])
    .map((n: { title?: unknown; detail?: unknown }) => ({ title: clip(n?.title, 60), detail: clip(n?.detail, 240) }))
    .filter((n) => n.title && n.detail && !UNSAFE.test(`${n.title} ${n.detail}`))
    .slice(0, 3);
  return { summary, notes };
}
