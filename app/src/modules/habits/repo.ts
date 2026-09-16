import { getDb, newId, notify, nowIso } from '../../core/db/database';
import { addDays } from '../../lib/dates';

/** Automatic habits check themselves off from data the app already has. */
export type HabitKind = 'manual' | 'protein' | 'calories' | 'water' | 'workout' | 'weigh_in';

export interface Habit {
  id: string;
  name: string;
  kind: HabitKind;
  position: number;
}

export const AUTO_HABITS: { kind: Exclude<HabitKind, 'manual'>; name: string; description: string }[] = [
  { kind: 'protein', name: 'Hit protein', description: 'Done when you log your protein target' },
  { kind: 'calories', name: 'Stay on calories', description: 'Within 10% of your calorie target' },
  { kind: 'water', name: 'Drink water', description: 'Reach your water goal' },
  { kind: 'workout', name: 'Train', description: 'Finish a workout or log cardio' },
  { kind: 'weigh_in', name: 'Weigh in', description: 'Log your weight' },
];

export const SUGGESTED_MANUAL = ['Sleep 7+ hours', '8,000+ steps', 'Take creatine', 'No late snacking', 'Stretch 10 minutes'];

export function listHabits(): Habit[] {
  return getDb()
    .getAllSync<Habit>('SELECT id, name, kind, position FROM habits WHERE deleted_at IS NULL AND archived_at IS NULL ORDER BY position, created_at');
}

export function addHabit(name: string, kind: HabitKind = 'manual') {
  const now = nowIso();
  const position = listHabits().length;
  getDb().runSync('INSERT INTO habits (id, name, kind, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)', [newId(), name.trim(), kind, position, now, now]);
  notify('habits');
}

export function removeHabit(id: string) {
  const now = nowIso();
  getDb().runSync('UPDATE habits SET deleted_at = ?, updated_at = ? WHERE id = ?', [now, now, id]);
  notify('habits');
}

/** Creates a sensible starting set the first time habits are opened. */
export function seedHabits(goalIsCutOrBulk: boolean) {
  if (getDb().getFirstSync<{ n: number }>('SELECT COUNT(*) AS n FROM habits')!.n > 0) return;
  addHabit('Hit protein', 'protein');
  if (goalIsCutOrBulk) addHabit('Stay on calories', 'calories');
  addHabit('Weigh in', 'weigh_in');
  addHabit('Train', 'workout');
  addHabit('Sleep 7+ hours');
}

export function manualDone(dateKey: string): Set<string> {
  const rows = getDb().getAllSync<{ habit_id: string }>('SELECT habit_id FROM habit_logs WHERE date_key = ? AND deleted_at IS NULL', [dateKey]);
  return new Set(rows.map((r) => r.habit_id));
}

export function setManualDone(habitId: string, dateKey: string, done: boolean) {
  const db = getDb();
  const now = nowIso();
  if (done) {
    db.runSync('INSERT INTO habit_logs (id, habit_id, date_key, created_at, updated_at) VALUES (?, ?, ?, ?, ?)', [newId(), habitId, dateKey, now, now]);
  } else {
    db.runSync('UPDATE habit_logs SET deleted_at = ?, updated_at = ? WHERE habit_id = ? AND date_key = ? AND deleted_at IS NULL', [now, now, habitId, dateKey]);
  }
  notify('habit_logs');
}

export interface DayFacts {
  protein: number;
  kcal: number;
  waterMl: number;
  workouts: number;
  weighIns: number;
}

export function dayFacts(dateKey: string): DayFacts {
  const db = getDb();
  const food = db.getFirstSync<{ p: number | null; k: number | null }>(
    'SELECT SUM(protein) AS p, SUM(kcal) AS k FROM log_entries WHERE date_key = ? AND deleted_at IS NULL',
    [dateKey],
  );
  const water = db.getFirstSync<{ ml: number | null }>('SELECT SUM(ml) AS ml FROM water_entries WHERE date_key = ? AND deleted_at IS NULL', [dateKey]);
  const workouts = db.getFirstSync<{ n: number }>(
    `SELECT (SELECT COUNT(*) FROM workouts WHERE date_key = ?1 AND ended_at IS NOT NULL AND deleted_at IS NULL)
          + (SELECT COUNT(*) FROM cardio_sessions WHERE date_key = ?1 AND deleted_at IS NULL) AS n`,
    [dateKey],
  );
  const weighIns = db.getFirstSync<{ n: number }>('SELECT COUNT(*) AS n FROM weight_entries WHERE date_key = ? AND deleted_at IS NULL', [dateKey]);
  return { protein: food?.p ?? 0, kcal: food?.k ?? 0, waterMl: water?.ml ?? 0, workouts: workouts?.n ?? 0, weighIns: weighIns?.n ?? 0 };
}

export interface HabitTargets {
  protein: number;
  kcal: number;
  waterMl: number;
}

export function isDone(habit: Habit, facts: DayFacts, manual: Set<string>, t: HabitTargets | null): boolean {
  switch (habit.kind) {
    case 'manual':
      return manual.has(habit.id);
    case 'protein':
      return !!t && facts.protein >= t.protein * 0.95;
    case 'calories':
      return !!t && facts.kcal > 0 && Math.abs(facts.kcal - t.kcal) <= t.kcal * 0.1;
    case 'water':
      return !!t && facts.waterMl >= t.waterMl;
    case 'workout':
      return facts.workouts > 0;
    case 'weigh_in':
      return facts.weighIns > 0;
  }
}

/** Consecutive days (ending today, or yesterday if today is not done yet) the habit was completed. */
export function streak(habit: Habit, today: string, t: HabitTargets | null, maxDays = 60): number {
  let count = 0;
  for (let i = 0; i < maxDays; i++) {
    const day = addDays(today, -i);
    const done = isDone(habit, dayFacts(day), manualDone(day), t);
    if (done) count += 1;
    else if (i === 0) continue;
    else break;
  }
  return count;
}
