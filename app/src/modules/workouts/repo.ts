import { getDb, newId, notify, nowIso, type TableName } from '../../core/db/database';
import { dateKey } from '../../lib/dates';
import { useSettings } from '../../core/store/settings';
import { estimate1RM } from '../../lib/strength';
import { doubleProgression, incrementFor, type ProgressionAdvice, type SessionSet } from '../../lib/training';
import { estimateDurationMin, overloadStatus, workoutCalories, type OverloadResult } from '../../lib/workoutEnergy';
import { exercisesForDay, SPLIT_PRESETS, type SplitDayTemplate, type SplitGroup } from './splits';
import { BUILTIN_EXERCISES, builtinExercise, type Equipment, type Exercise } from './exercises';

export type SetKind = 'warmup' | 'working' | 'drop' | 'failure';

export interface WorkoutSet {
  id: string;
  workoutExerciseId: string;
  position: number;
  kind: SetKind;
  weightKg: number | null;
  reps: number | null;
  rpe: number | null;
  completedAt: string | null;
}

export interface WorkoutExercise {
  id: string;
  exerciseId: string;
  position: number;
  repMin: number | null;
  repMax: number | null;
  restS: number | null;
  notes: string | null;
  sets: WorkoutSet[];
}

export interface Workout {
  id: string;
  name: string;
  routineId: string | null;
  dateKey: string;
  startedAt: string;
  endedAt: string | null;
  notes: string | null;
  rating: number | null;
  kcal: number | null;
}

export interface WorkoutDetail extends Workout {
  exercises: WorkoutExercise[];
}

export interface RoutineItem {
  id: string;
  exerciseId: string;
  position: number;
  sets: number;
  repMin: number;
  repMax: number;
  restS: number | null;
}

export interface Routine {
  id: string;
  name: string;
  notes: string | null;
  /** 0 = Sunday … 6 = Saturday. */
  weekdays: number[];
  splitId: string | null;
  muscleGroups: SplitGroup[];
  items: RoutineItem[];
}

const db = () => getDb();
const changed = (...t: TableName[]) => notify(...t);

/* ---------------- exercises ---------------- */

interface CustomExerciseRow {
  id: string;
  name: string;
  primary_muscles: string;
  secondary_muscles: string;
  equipment: Equipment;
}

export function listCustomExercises(): Exercise[] {
  return db()
    .getAllSync<CustomExerciseRow>('SELECT * FROM custom_exercises WHERE deleted_at IS NULL ORDER BY name')
    .map((r) => ({
      id: `custom:${r.id}`,
      name: r.name,
      primary: JSON.parse(r.primary_muscles),
      secondary: JSON.parse(r.secondary_muscles),
      equipment: r.equipment,
      category: 'strength',
      mechanic: '',
      level: '',
      instructions: [],
      imageCount: 0,
      custom: true,
    }));
}

export function addCustomExercise(name: string, primary: string[], equipment: Equipment): string {
  const id = newId();
  const now = nowIso();
  db().runSync(
    'INSERT INTO custom_exercises (id, name, primary_muscles, secondary_muscles, equipment, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [id, name.trim(), JSON.stringify(primary), '[]', equipment, now, now],
  );
  changed('custom_exercises');
  return `custom:${id}`;
}

export function allExercises(): Exercise[] {
  return [...listCustomExercises(), ...BUILTIN_EXERCISES];
}

export function getExercise(id: string): Exercise {
  if (id.startsWith('custom:')) {
    const found = listCustomExercises().find((e) => e.id === id);
    if (found) return found;
  }
  return (
    builtinExercise(id) ?? {
      id,
      name: 'Unknown exercise',
      primary: [],
      secondary: [],
      equipment: 'other',
      category: 'strength',
      mechanic: '',
      level: '',
      instructions: [],
      imageCount: 0,
    }
  );
}

/* ---------------- routines ---------------- */

interface RoutineRow {
  id: string;
  name: string;
  notes: string | null;
  weekdays: string;
  split_id: string | null;
  muscle_groups: string;
}
interface RoutineItemRow {
  id: string;
  routine_id: string;
  exercise_id: string;
  position: number;
  sets: number;
  rep_min: number;
  rep_max: number;
  rest_s: number | null;
}

const toItem = (r: RoutineItemRow): RoutineItem => ({
  id: r.id,
  exerciseId: r.exercise_id,
  position: r.position,
  sets: r.sets,
  repMin: r.rep_min,
  repMax: r.rep_max,
  restS: r.rest_s,
});

export function listRoutines(): Routine[] {
  const routines = db().getAllSync<RoutineRow>('SELECT id, name, notes, weekdays, split_id, muscle_groups FROM routines WHERE deleted_at IS NULL ORDER BY position, created_at');
  const items = db().getAllSync<RoutineItemRow>('SELECT * FROM routine_items WHERE deleted_at IS NULL ORDER BY position');
  return routines.map((r) => ({
    id: r.id,
    name: r.name,
    notes: r.notes,
    weekdays: JSON.parse(r.weekdays || '[]'),
    splitId: r.split_id,
    muscleGroups: JSON.parse(r.muscle_groups || '[]'),
    items: items.filter((i) => i.routine_id === r.id).map(toItem),
  }));
}

export function getRoutine(id: string): Routine | null {
  return listRoutines().find((r) => r.id === id) ?? null;
}

export function createRoutine(name: string, exerciseIds: string[] = []): string {
  const id = newId();
  const now = nowIso();
  const position = db().getFirstSync<{ n: number }>('SELECT COUNT(*) AS n FROM routines WHERE deleted_at IS NULL')?.n ?? 0;
  db().withTransactionSync(() => {
    db().runSync('INSERT INTO routines (id, name, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?)', [id, name.trim(), position, now, now]);
    insertRoutineItems(id, exerciseIds, 0);
  });
  changed('routines', 'routine_items');
  return id;
}

function insertRoutineItems(routineId: string, exerciseIds: string[], startPosition: number) {
  const now = nowIso();
  exerciseIds.forEach((exerciseId, i) => {
    db().runSync(
      'INSERT INTO routine_items (id, routine_id, exercise_id, position, sets, rep_min, rep_max, created_at, updated_at) VALUES (?, ?, ?, ?, 3, 8, 12, ?, ?)',
      [newId(), routineId, exerciseId, startPosition + i, now, now],
    );
  });
}

export function addRoutineItems(routineId: string, exerciseIds: string[]) {
  const max = db().getFirstSync<{ m: number | null }>('SELECT MAX(position) AS m FROM routine_items WHERE routine_id = ? AND deleted_at IS NULL', [routineId])?.m ?? -1;
  db().withTransactionSync(() => insertRoutineItems(routineId, exerciseIds, max + 1));
  touchRoutine(routineId);
  changed('routine_items');
}

function touchRoutine(id: string) {
  db().runSync('UPDATE routines SET updated_at = ? WHERE id = ?', [nowIso(), id]);
  changed('routines');
}

export function setRoutineWeekdays(id: string, weekdays: number[]) {
  db().runSync('UPDATE routines SET weekdays = ?, updated_at = ? WHERE id = ?', [JSON.stringify([...new Set(weekdays)].sort()), nowIso(), id]);
  changed('routines');
}

/** Routines scheduled for a weekday (0 = Sunday). */
export function routinesForWeekday(weekday: number): Routine[] {
  return listRoutines().filter((r) => r.weekdays.includes(weekday));
}

export function renameRoutine(id: string, name: string) {
  db().runSync('UPDATE routines SET name = ?, updated_at = ? WHERE id = ?', [name.trim(), nowIso(), id]);
  changed('routines');
}

export function updateRoutineItem(id: string, patch: Partial<Pick<RoutineItem, 'sets' | 'repMin' | 'repMax' | 'restS'>>) {
  const r = db().getFirstSync<RoutineItemRow>('SELECT * FROM routine_items WHERE id = ?', [id]);
  if (!r) return;
  const next = { ...toItem(r), ...patch };
  db().runSync('UPDATE routine_items SET sets = ?, rep_min = ?, rep_max = ?, rest_s = ?, updated_at = ? WHERE id = ?', [
    Math.max(1, next.sets),
    Math.max(1, next.repMin),
    Math.max(next.repMin, next.repMax),
    next.restS,
    nowIso(),
    id,
  ]);
  changed('routine_items');
}

export function removeRoutineItem(id: string) {
  const now = nowIso();
  db().runSync('UPDATE routine_items SET deleted_at = ?, updated_at = ? WHERE id = ?', [now, now, id]);
  changed('routine_items');
}

export function moveRoutineItem(routineId: string, itemId: string, delta: -1 | 1) {
  const items = getRoutine(routineId)?.items ?? [];
  const index = items.findIndex((i) => i.id === itemId);
  const target = index + delta;
  if (index < 0 || target < 0 || target >= items.length) return;
  const reordered = [...items];
  [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
  const now = nowIso();
  db().withTransactionSync(() => {
    reordered.forEach((item, i) => db().runSync('UPDATE routine_items SET position = ?, updated_at = ? WHERE id = ?', [i, now, item.id]));
  });
  changed('routine_items');
}

export function deleteRoutine(id: string) {
  const now = nowIso();
  db().withTransactionSync(() => {
    db().runSync('UPDATE routines SET deleted_at = ?, updated_at = ? WHERE id = ?', [now, now, id]);
    db().runSync('UPDATE routine_items SET deleted_at = ?, updated_at = ? WHERE routine_id = ? AND deleted_at IS NULL', [now, now, id]);
  });
  changed('routines', 'routine_items');
}

/* ---------------- workouts ---------------- */

interface WorkoutRow {
  id: string;
  name: string;
  routine_id: string | null;
  date_key: string;
  started_at: string;
  ended_at: string | null;
  notes: string | null;
  rating: number | null;
  kcal: number | null;
}
interface WorkoutExerciseRow {
  id: string;
  workout_id: string;
  exercise_id: string;
  position: number;
  rep_min: number | null;
  rep_max: number | null;
  rest_s: number | null;
  notes: string | null;
}
interface SetRow {
  id: string;
  workout_id: string;
  workout_exercise_id: string;
  position: number;
  kind: SetKind;
  weight_kg: number | null;
  reps: number | null;
  rpe: number | null;
  completed_at: string | null;
}

const toWorkout = (r: WorkoutRow): Workout => ({
  id: r.id,
  name: r.name,
  routineId: r.routine_id,
  dateKey: r.date_key,
  startedAt: r.started_at,
  endedAt: r.ended_at,
  notes: r.notes,
  rating: r.rating,
  kcal: r.kcal,
});

const toSet = (r: SetRow): WorkoutSet => ({
  id: r.id,
  workoutExerciseId: r.workout_exercise_id,
  position: r.position,
  kind: r.kind,
  weightKg: r.weight_kg,
  reps: r.reps,
  rpe: r.rpe,
  completedAt: r.completed_at,
});

const WORKOUT_TABLES: TableName[] = ['workouts', 'workout_exercises', 'workout_sets'];

export function activeWorkout(): Workout | null {
  const r = db().getFirstSync<WorkoutRow>('SELECT * FROM workouts WHERE ended_at IS NULL AND deleted_at IS NULL ORDER BY started_at DESC LIMIT 1');
  return r ? toWorkout(r) : null;
}

export function getWorkout(id: string): WorkoutDetail | null {
  const w = db().getFirstSync<WorkoutRow>('SELECT * FROM workouts WHERE id = ? AND deleted_at IS NULL', [id]);
  if (!w) return null;
  const exercises = db().getAllSync<WorkoutExerciseRow>(
    'SELECT * FROM workout_exercises WHERE workout_id = ? AND deleted_at IS NULL ORDER BY position',
    [id],
  );
  const sets = db().getAllSync<SetRow>('SELECT * FROM workout_sets WHERE workout_id = ? AND deleted_at IS NULL ORDER BY position', [id]);
  return {
    ...toWorkout(w),
    exercises: exercises.map((e) => ({
      id: e.id,
      exerciseId: e.exercise_id,
      position: e.position,
      repMin: e.rep_min,
      repMax: e.rep_max,
      restS: e.rest_s,
      notes: e.notes,
      sets: sets.filter((s) => s.workout_exercise_id === e.id).map(toSet),
    })),
  };
}

/** Completed sets from the most recent finished session of an exercise. */
export function previousSets(exerciseId: string, excludeWorkoutId?: string): WorkoutSet[] {
  const last = db().getFirstSync<{ id: string }>(
    `SELECT we.id FROM workout_exercises we JOIN workouts w ON w.id = we.workout_id
     WHERE we.exercise_id = ? AND we.deleted_at IS NULL AND w.deleted_at IS NULL AND w.ended_at IS NOT NULL AND w.id != ?
       AND EXISTS (SELECT 1 FROM workout_sets s WHERE s.workout_exercise_id = we.id AND s.completed_at IS NOT NULL AND s.deleted_at IS NULL)
     ORDER BY w.started_at DESC LIMIT 1`,
    [exerciseId, excludeWorkoutId ?? ''],
  );
  if (!last) return [];
  return db()
    .getAllSync<SetRow>(
      'SELECT * FROM workout_sets WHERE workout_exercise_id = ? AND completed_at IS NOT NULL AND deleted_at IS NULL ORDER BY position',
      [last.id],
    )
    .map(toSet);
}

function insertSet(workoutId: string, weId: string, position: number, kind: SetKind, weightKg: number | null, reps: number | null) {
  const now = nowIso();
  db().runSync(
    'INSERT INTO workout_sets (id, workout_id, workout_exercise_id, position, kind, weight_kg, reps, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [newId(), workoutId, weId, position, kind, weightKg, reps, now, now],
  );
}

/** Working sets from the most recent finished sessions of an exercise, newest first. */
export function recentSessions(exerciseId: string, excludeWorkoutId?: string, limit = 4): SessionSet[][] {
  return exerciseHistory(exerciseId, limit + 1)
    .filter((s) => s.workoutId !== excludeWorkoutId)
    .slice(0, limit)
    .map((s) => s.sets.filter((x) => x.kind !== 'warmup').map((x) => ({ weightKg: x.weightKg, reps: x.reps })));
}

export function progressionAdvice(exerciseId: string, repMin: number, repMax: number, excludeWorkoutId?: string): ProgressionAdvice {
  const exercise = getExercise(exerciseId);
  const increment = incrementFor(exercise.primary, exercise.equipment, useSettings.getState().gym.incrementKg);
  return doubleProgression({ history: recentSessions(exerciseId, excludeWorkoutId), repMin, repMax, increment });
}

function insertExercise(
  workoutId: string,
  exerciseId: string,
  position: number,
  setCount: number,
  range: { repMin: number; repMax: number } | null,
  restS: number | null,
) {
  const weId = newId();
  const now = nowIso();
  db().runSync(
    'INSERT INTO workout_exercises (id, workout_id, exercise_id, position, rep_min, rep_max, rest_s, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [weId, workoutId, exerciseId, position, range?.repMin ?? null, range?.repMax ?? null, restS, now, now],
  );
  const prev = previousSets(exerciseId, workoutId).filter((s) => s.kind !== 'warmup');
  const advice = range ? progressionAdvice(exerciseId, range.repMin, range.repMax, workoutId) : null;
  for (let i = 0; i < setCount; i++) {
    const p = prev[i] ?? prev[prev.length - 1];
    const useAdvice = advice && advice.kind !== 'start';
    insertSet(workoutId, weId, i, 'working', useAdvice ? advice.weightKg : (p?.weightKg ?? null), useAdvice ? advice.reps : (p?.reps ?? range?.repMin ?? null));
  }
}

export function startWorkout(opts: { name?: string; routineId?: string } = {}): string {
  const existing = activeWorkout();
  if (existing) return existing.id;
  const routine = opts.routineId ? getRoutine(opts.routineId) : null;
  const id = newId();
  const now = nowIso();
  const name = opts.name ?? routine?.name ?? defaultWorkoutName();
  db().withTransactionSync(() => {
    db().runSync('INSERT INTO workouts (id, name, routine_id, date_key, started_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [
      id,
      name,
      routine?.id ?? null,
      dateKey(),
      now,
      now,
      now,
    ]);
    routine?.items.forEach((item, i) => insertExercise(id, item.exerciseId, i, item.sets, { repMin: item.repMin, repMax: item.repMax }, item.restS));
  });
  changed(...WORKOUT_TABLES);
  return id;
}

function defaultWorkoutName() {
  const h = new Date().getHours();
  if (h < 12) return 'Morning workout';
  if (h < 17) return 'Afternoon workout';
  return 'Evening workout';
}

export function addExercisesToWorkout(workoutId: string, exerciseIds: string[]) {
  const max = db().getFirstSync<{ m: number | null }>('SELECT MAX(position) AS m FROM workout_exercises WHERE workout_id = ? AND deleted_at IS NULL', [workoutId])?.m ?? -1;
  db().withTransactionSync(() => exerciseIds.forEach((ex, i) => insertExercise(workoutId, ex, max + 1 + i, 3, null, null)));
  changed(...WORKOUT_TABLES);
}

export function addSet(workoutId: string, weId: string, kind: SetKind = 'working') {
  const sets = db().getAllSync<SetRow>('SELECT * FROM workout_sets WHERE workout_exercise_id = ? AND deleted_at IS NULL ORDER BY position', [weId]);
  const last = sets[sets.length - 1];
  insertSet(workoutId, weId, (last?.position ?? -1) + 1, kind, last?.weight_kg ?? null, last?.reps ?? null);
  changed('workout_sets');
}

export function addWarmupSets(workoutId: string, weId: string, warmups: { weight: number; reps: number }[]) {
  const now = nowIso();
  db().withTransactionSync(() => {
    db().runSync('UPDATE workout_sets SET position = position + ?, updated_at = ? WHERE workout_exercise_id = ? AND deleted_at IS NULL', [
      warmups.length,
      now,
      weId,
    ]);
    warmups.forEach((w, i) => insertSet(workoutId, weId, i, 'warmup', w.weight, w.reps));
  });
  changed('workout_sets');
}

export function updateSet(id: string, patch: Partial<Pick<WorkoutSet, 'weightKg' | 'reps' | 'rpe' | 'kind'>>) {
  const r = db().getFirstSync<SetRow>('SELECT * FROM workout_sets WHERE id = ?', [id]);
  if (!r) return;
  const next = { ...toSet(r), ...patch };
  db().runSync('UPDATE workout_sets SET weight_kg = ?, reps = ?, rpe = ?, kind = ?, updated_at = ? WHERE id = ?', [
    next.weightKg,
    next.reps,
    next.rpe,
    next.kind,
    nowIso(),
    id,
  ]);
  changed('workout_sets');
}

export function setCompleted(id: string, done: boolean) {
  const now = nowIso();
  db().runSync('UPDATE workout_sets SET completed_at = ?, updated_at = ? WHERE id = ?', [done ? now : null, now, id]);
  changed('workout_sets');
}

export function deleteSet(id: string) {
  const now = nowIso();
  db().runSync('UPDATE workout_sets SET deleted_at = ?, updated_at = ? WHERE id = ?', [now, now, id]);
  changed('workout_sets');
}

export function removeWorkoutExercise(weId: string) {
  const now = nowIso();
  db().withTransactionSync(() => {
    db().runSync('UPDATE workout_exercises SET deleted_at = ?, updated_at = ? WHERE id = ?', [now, now, weId]);
    db().runSync('UPDATE workout_sets SET deleted_at = ?, updated_at = ? WHERE workout_exercise_id = ? AND deleted_at IS NULL', [now, now, weId]);
  });
  changed('workout_exercises', 'workout_sets');
}

export function moveWorkoutExercise(workoutId: string, weId: string, delta: -1 | 1) {
  const list = getWorkout(workoutId)?.exercises ?? [];
  const index = list.findIndex((e) => e.id === weId);
  const target = index + delta;
  if (index < 0 || target < 0 || target >= list.length) return;
  const reordered = [...list];
  [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
  const now = nowIso();
  db().withTransactionSync(() =>
    reordered.forEach((e, i) => db().runSync('UPDATE workout_exercises SET position = ?, updated_at = ? WHERE id = ?', [i, now, e.id])),
  );
  changed('workout_exercises');
}

export function renameWorkout(id: string, name: string) {
  db().runSync('UPDATE workouts SET name = ?, updated_at = ? WHERE id = ?', [name.trim() || 'Workout', nowIso(), id]);
  changed('workouts');
}

/** Ends the workout, dropping unfinished sets and empty exercises. Returns false if nothing was done. */
export function finishWorkout(id: string, notes?: string): boolean {
  const now = nowIso();
  let hadWork = false;
  db().withTransactionSync(() => {
    db().runSync('UPDATE workout_sets SET deleted_at = ?, updated_at = ? WHERE workout_id = ? AND completed_at IS NULL AND deleted_at IS NULL', [now, now, id]);
    db().runSync(
      `UPDATE workout_exercises SET deleted_at = ?, updated_at = ?
       WHERE workout_id = ? AND deleted_at IS NULL
         AND NOT EXISTS (SELECT 1 FROM workout_sets s WHERE s.workout_exercise_id = workout_exercises.id AND s.deleted_at IS NULL)`,
      [now, now, id],
    );
    hadWork = (db().getFirstSync<{ n: number }>('SELECT COUNT(*) AS n FROM workout_sets WHERE workout_id = ? AND deleted_at IS NULL', [id])?.n ?? 0) > 0;
    if (hadWork) {
      const w = db().getFirstSync<{ started_at: string }>('SELECT started_at FROM workouts WHERE id = ?', [id]);
      const durationMin = w ? (Date.parse(now) - Date.parse(w.started_at)) / 60000 : 0;
      const kcal = caloriesFor(id, durationMin);
      db().runSync('UPDATE workouts SET ended_at = ?, kcal = ?, notes = COALESCE(?, notes), updated_at = ? WHERE id = ?', [now, kcal, notes ?? null, now, id]);
    } else {
      db().runSync('UPDATE workouts SET deleted_at = ?, updated_at = ? WHERE id = ?', [now, now, id]);
    }
  });
  changed(...WORKOUT_TABLES);
  return hadWork;
}

export function discardWorkout(id: string) {
  const now = nowIso();
  db().withTransactionSync(() => {
    for (const t of ['workout_sets', 'workout_exercises'] as const) {
      db().runSync(`UPDATE ${t} SET deleted_at = ?, updated_at = ? WHERE workout_id = ? AND deleted_at IS NULL`, [now, now, id]);
    }
    db().runSync('UPDATE workouts SET deleted_at = ?, updated_at = ? WHERE id = ?', [now, now, id]);
  });
  changed(...WORKOUT_TABLES);
}

export function rateWorkout(id: string, rating: number) {
  db().runSync('UPDATE workouts SET rating = ?, updated_at = ? WHERE id = ?', [rating, nowIso(), id]);
  changed('workouts');
}

/** Saves a finished workout's exercises and set counts as a routine. */
export function saveWorkoutAsRoutine(workoutId: string): string | null {
  const w = getWorkout(workoutId);
  if (!w) return null;
  const routineId = createRoutine(w.name, []);
  const now = nowIso();
  db().withTransactionSync(() => {
    w.exercises.forEach((e, i) => {
      const working = e.sets.filter((s) => s.kind !== 'warmup');
      const reps = working.map((s) => s.reps ?? 0).filter((r) => r > 0);
      db().runSync(
        'INSERT INTO routine_items (id, routine_id, exercise_id, position, sets, rep_min, rep_max, rest_s, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [newId(), routineId, e.exerciseId, i, Math.max(1, working.length), reps.length ? Math.min(...reps) : 8, reps.length ? Math.max(...reps) : 12, e.restS, now, now],
      );
    });
  });
  changed('routines', 'routine_items');
  return routineId;
}

/* ---------------- history & stats ---------------- */

export interface WorkoutSummary extends Workout {
  exerciseCount: number;
  setCount: number;
  volumeKg: number;
  exerciseIds: string[];
}

export function listWorkouts(limit = 30): WorkoutSummary[] {
  const rows = db().getAllSync<WorkoutRow & { exercise_count: number; set_count: number; volume: number | null; exercise_ids: string | null }>(
    `SELECT w.*,
       (SELECT COUNT(*) FROM workout_exercises we WHERE we.workout_id = w.id AND we.deleted_at IS NULL) AS exercise_count,
       (SELECT COUNT(*) FROM workout_sets s WHERE s.workout_id = w.id AND s.deleted_at IS NULL AND s.completed_at IS NOT NULL AND s.kind != 'warmup') AS set_count,
       (SELECT SUM(COALESCE(s.weight_kg, 0) * COALESCE(s.reps, 0)) FROM workout_sets s WHERE s.workout_id = w.id AND s.deleted_at IS NULL AND s.completed_at IS NOT NULL AND s.kind != 'warmup') AS volume,
       (SELECT GROUP_CONCAT(exercise_id, '|') FROM (SELECT exercise_id FROM workout_exercises we WHERE we.workout_id = w.id AND we.deleted_at IS NULL ORDER BY position)) AS exercise_ids
     FROM workouts w WHERE w.deleted_at IS NULL AND w.ended_at IS NOT NULL
     ORDER BY w.started_at DESC LIMIT ?`,
    [limit],
  );
  return rows.map((r) => ({
    ...toWorkout(r),
    exerciseCount: r.exercise_count,
    setCount: r.set_count,
    volumeKg: r.volume ?? 0,
    exerciseIds: r.exercise_ids ? r.exercise_ids.split('|') : [],
  }));
}

export function workoutsSince(fromDateKey: string): number {
  return (
    db().getFirstSync<{ n: number }>('SELECT COUNT(*) AS n FROM workouts WHERE deleted_at IS NULL AND ended_at IS NOT NULL AND date_key >= ?', [fromDateKey])?.n ?? 0
  );
}

export interface ExerciseSession {
  workoutId: string;
  dateKey: string;
  startedAt: string;
  sets: WorkoutSet[];
}

export function exerciseHistory(exerciseId: string, limit = 50): ExerciseSession[] {
  const rows = db().getAllSync<SetRow & { date_key: string; started_at: string }>(
    `SELECT s.*, w.date_key, w.started_at FROM workout_sets s
     JOIN workout_exercises we ON we.id = s.workout_exercise_id
     JOIN workouts w ON w.id = s.workout_id
     WHERE we.exercise_id = ? AND s.deleted_at IS NULL AND we.deleted_at IS NULL AND w.deleted_at IS NULL
       AND w.ended_at IS NOT NULL AND s.completed_at IS NOT NULL
     ORDER BY w.started_at DESC, s.position`,
    [exerciseId],
  );
  const sessions: ExerciseSession[] = [];
  for (const r of rows) {
    let session = sessions[sessions.length - 1];
    if (!session || session.workoutId !== r.workout_id) {
      if (sessions.length >= limit) break;
      session = { workoutId: r.workout_id, dateKey: r.date_key, startedAt: r.started_at, sets: [] };
      sessions.push(session);
    }
    session.sets.push(toSet(r));
  }
  return sessions;
}

export interface Records {
  best1RM: number;
  heaviest: number;
  mostVolumeSet: number;
}

/** Personal records for an exercise from sets completed before `beforeIso` (all time if omitted). */
export function exerciseRecords(exerciseId: string, beforeIso?: string, excludeWorkoutId?: string): Records {
  const rows = db().getAllSync<{ weight_kg: number; reps: number }>(
    `SELECT s.weight_kg, s.reps FROM workout_sets s
     JOIN workout_exercises we ON we.id = s.workout_exercise_id
     JOIN workouts w ON w.id = s.workout_id
     WHERE we.exercise_id = ? AND s.deleted_at IS NULL AND we.deleted_at IS NULL AND w.deleted_at IS NULL
       AND s.completed_at IS NOT NULL AND s.kind != 'warmup' AND s.weight_kg IS NOT NULL AND s.reps > 0
       AND w.started_at < ? AND w.id != ?`,
    [exerciseId, beforeIso ?? '9999', excludeWorkoutId ?? ''],
  );
  const rec: Records = { best1RM: 0, heaviest: 0, mostVolumeSet: 0 };
  for (const r of rows) {
    rec.best1RM = Math.max(rec.best1RM, estimate1RM(r.weight_kg, r.reps));
    rec.heaviest = Math.max(rec.heaviest, r.weight_kg);
    rec.mostVolumeSet = Math.max(rec.mostVolumeSet, r.weight_kg * r.reps);
  }
  return rec;
}

export interface PrHit {
  exerciseId: string;
  kind: '1rm' | 'weight' | 'volume';
  value: number;
  previous: number;
}

/** PRs set in a workout, compared against everything before it started. */
export function workoutPrs(w: WorkoutDetail): PrHit[] {
  const hits: PrHit[] = [];
  for (const e of w.exercises) {
    const before = exerciseRecords(e.exerciseId, w.startedAt, w.id);
    const done = e.sets.filter((s) => s.completedAt && s.kind !== 'warmup' && s.weightKg != null && (s.reps ?? 0) > 0);
    if (done.length === 0 || before.best1RM === 0) continue;
    const best1RM = Math.max(...done.map((s) => estimate1RM(s.weightKg!, s.reps!)));
    const heaviest = Math.max(...done.map((s) => s.weightKg!));
    const volume = Math.max(...done.map((s) => s.weightKg! * s.reps!));
    if (heaviest > before.heaviest) hits.push({ exerciseId: e.exerciseId, kind: 'weight', value: heaviest, previous: before.heaviest });
    else if (best1RM > before.best1RM + 0.01) hits.push({ exerciseId: e.exerciseId, kind: '1rm', value: best1RM, previous: before.best1RM });
    else if (volume > before.mostVolumeSet) hits.push({ exerciseId: e.exerciseId, kind: 'volume', value: volume, previous: before.mostVolumeSet });
  }
  return hits;
}

/* ---------------- calories ---------------- */

function latestBodyweightKg(): number | null {
  return db().getFirstSync<{ kg: number }>('SELECT kg FROM weight_entries WHERE deleted_at IS NULL ORDER BY measured_at DESC LIMIT 1')?.kg ?? null;
}

function workingSetCount(workoutId: string): number {
  return (
    db().getFirstSync<{ n: number }>("SELECT COUNT(*) AS n FROM workout_sets WHERE workout_id = ? AND deleted_at IS NULL AND completed_at IS NOT NULL AND kind != 'warmup'", [workoutId])?.n ?? 0
  );
}

/** Estimated calories for a workout, using the latest bodyweight (75 kg if none logged). */
function caloriesFor(workoutId: string, durationMin: number): number {
  const sets = workingSetCount(workoutId);
  const minutes = durationMin >= 5 ? durationMin : estimateDurationMin(sets);
  return workoutCalories({ bodyweightKg: latestBodyweightKg() ?? 75, durationMin: minutes, workingSets: sets });
}

/** Fills in calorie estimates for finished workouts saved before kcal was tracked. */
export function backfillWorkoutCalories() {
  const rows = db().getAllSync<{ id: string; started_at: string; ended_at: string }>(
    'SELECT id, started_at, ended_at FROM workouts WHERE deleted_at IS NULL AND ended_at IS NOT NULL AND kcal IS NULL',
  );
  if (rows.length === 0) return;
  db().withTransactionSync(() => {
    for (const r of rows) {
      const minutes = (Date.parse(r.ended_at) - Date.parse(r.started_at)) / 60000;
      db().runSync('UPDATE workouts SET kcal = ?, updated_at = ? WHERE id = ?', [caloriesFor(r.id, minutes), new Date().toISOString(), r.id]);
    }
  });
}

/* ---------------- quick log ---------------- */

export interface QuickLogExercise {
  exerciseId: string;
  sets: { weightKg: number | null; reps: number }[];
}

/** Saves an already-finished workout in one go. Returns the workout id. */
export function logCompletedWorkout(opts: {
  name: string;
  dateKey: string;
  durationMin: number;
  exercises: QuickLogExercise[];
  routineId?: string | null;
}): string {
  const id = newId();
  const now = nowIso();
  // Place the session at the end of the chosen day, or now if it is today.
  const end = opts.dateKey === dateKey() ? new Date() : new Date(`${opts.dateKey}T19:00:00`);
  const start = new Date(end.getTime() - opts.durationMin * 60000);
  db().withTransactionSync(() => {
    db().runSync('INSERT INTO workouts (id, name, routine_id, date_key, started_at, ended_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [
      id,
      opts.name.trim() || 'Workout',
      opts.routineId ?? null,
      opts.dateKey,
      start.toISOString(),
      end.toISOString(),
      now,
      now,
    ]);
    opts.exercises.forEach((ex, position) => {
      const weId = newId();
      db().runSync('INSERT INTO workout_exercises (id, workout_id, exercise_id, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)', [
        weId,
        id,
        ex.exerciseId,
        position,
        now,
        now,
      ]);
      ex.sets.forEach((set, i) => {
        db().runSync(
          "INSERT INTO workout_sets (id, workout_id, workout_exercise_id, position, kind, weight_kg, reps, completed_at, created_at, updated_at) VALUES (?, ?, ?, ?, 'working', ?, ?, ?, ?, ?)",
          [newId(), id, weId, i, set.weightKg, set.reps, end.toISOString(), now, now],
        );
      });
    });
    db().runSync('UPDATE workouts SET kcal = ? WHERE id = ?', [caloriesFor(id, opts.durationMin), id]);
  });
  changed(...WORKOUT_TABLES);
  return id;
}

/* ---------------- weekly stats & overload ---------------- */

export interface TrainingStats {
  workouts: number;
  sets: number;
  volumeKg: number;
  kcal: number;
  minutes: number;
}

export function trainingStats(fromDateKey: string, toDateKey = '9999'): TrainingStats {
  const w = db().getFirstSync<{ n: number; kcal: number | null; minutes: number | null }>(
    `SELECT COUNT(*) AS n, SUM(kcal) AS kcal,
       SUM((julianday(ended_at) - julianday(started_at)) * 1440) AS minutes
     FROM workouts WHERE deleted_at IS NULL AND ended_at IS NOT NULL AND date_key >= ? AND date_key <= ?`,
    [fromDateKey, toDateKey],
  );
  const s = db().getFirstSync<{ sets: number; volume: number | null }>(
    `SELECT COUNT(*) AS sets, SUM(COALESCE(s.weight_kg, 0) * COALESCE(s.reps, 0)) AS volume
     FROM workout_sets s JOIN workouts w ON w.id = s.workout_id
     WHERE s.deleted_at IS NULL AND w.deleted_at IS NULL AND w.ended_at IS NOT NULL
       AND s.completed_at IS NOT NULL AND s.kind != 'warmup' AND w.date_key >= ? AND w.date_key <= ?`,
    [fromDateKey, toDateKey],
  );
  return { workouts: w?.n ?? 0, kcal: Math.round(w?.kcal ?? 0), minutes: Math.round(w?.minutes ?? 0), sets: s?.sets ?? 0, volumeKg: s?.volume ?? 0 };
}

export interface ExerciseOverload extends OverloadResult {
  exerciseId: string;
  lastDate: string;
  sessions: number;
}

/** Overload status for every exercise trained since a date, most recently trained first. */
export function overloadSummary(sinceDateKey: string): ExerciseOverload[] {
  const ids = db().getAllSync<{ exercise_id: string; last: string }>(
    `SELECT we.exercise_id, MAX(w.date_key) AS last FROM workout_exercises we JOIN workouts w ON w.id = we.workout_id
     WHERE we.deleted_at IS NULL AND w.deleted_at IS NULL AND w.ended_at IS NOT NULL AND w.date_key >= ?
     GROUP BY we.exercise_id ORDER BY last DESC`,
    [sinceDateKey],
  );
  return ids.map((r) => {
    const history = exerciseHistory(r.exercise_id, 8);
    const result = overloadStatus(
      history.map((h) => ({ date: h.dateKey, sets: h.sets.filter((x) => x.kind !== 'warmup').map((x) => ({ weightKg: x.weightKg, reps: x.reps })) })),
    );
    return { ...result, exerciseId: r.exercise_id, lastDate: r.last, sessions: history.length };
  });
}

/* ---------------- splits ---------------- */

export interface Split {
  id: string;
  name: string;
  preset: string | null;
  active: boolean;
  days: Routine[];
}

export function listSplits(): Split[] {
  const rows = db().getAllSync<{ id: string; name: string; preset: string | null; active: number }>(
    'SELECT id, name, preset, active FROM splits WHERE deleted_at IS NULL ORDER BY active DESC, created_at DESC',
  );
  const routines = listRoutines();
  return rows.map((r) => ({ id: r.id, name: r.name, preset: r.preset, active: r.active === 1, days: routines.filter((x) => x.splitId === r.id) }));
}

export function activeSplit(): Split | null {
  return listSplits().find((s) => s.active) ?? null;
}

function insertSplitDay(splitId: string, day: SplitDayTemplate, position: number, exerciseIds: string[]) {
  const routineId = newId();
  const now = nowIso();
  db().runSync(
    'INSERT INTO routines (id, name, position, weekdays, split_id, muscle_groups, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [routineId, day.name, position, JSON.stringify(day.weekdays), splitId, JSON.stringify(day.groups), now, now],
  );
  exerciseIds.forEach((exerciseId, i) => {
    db().runSync(
      'INSERT INTO routine_items (id, routine_id, exercise_id, position, sets, rep_min, rep_max, created_at, updated_at) VALUES (?, ?, ?, ?, 3, ?, ?, ?, ?)',
      [newId(), routineId, exerciseId, i, day.repMin, day.repMax, now, now],
    );
  });
  return routineId;
}

function deactivateSplits() {
  const now = nowIso();
  db().runSync('UPDATE splits SET active = 0, updated_at = ? WHERE active = 1 AND deleted_at IS NULL', [now]);
  // Only the active split's days keep a weekly schedule.
  db().runSync("UPDATE routines SET weekdays = '[]', updated_at = ? WHERE split_id IS NOT NULL AND weekdays != '[]' AND deleted_at IS NULL", [now]);
}

/** Creates a split (preset or custom) with one routine per day and makes it active. */
export function createSplit(name: string, days: SplitDayTemplate[], preset: string | null = null): string {
  const id = newId();
  const now = nowIso();
  const base = db().getFirstSync<{ n: number }>('SELECT COUNT(*) AS n FROM routines WHERE deleted_at IS NULL')?.n ?? 0;
  db().withTransactionSync(() => {
    deactivateSplits();
    db().runSync('INSERT INTO splits (id, name, preset, active, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)', [id, name.trim(), preset, now, now]);
    days.forEach((day, i) => insertSplitDay(id, day, base + i, exercisesForDay(day)));
  });
  changed('splits', 'routines', 'routine_items');
  return id;
}

export function createSplitFromPreset(presetId: string): string | null {
  const preset = SPLIT_PRESETS.find((p) => p.id === presetId);
  return preset ? createSplit(preset.name, preset.days, preset.id) : null;
}

export function activateSplit(id: string) {
  const split = listSplits().find((s) => s.id === id);
  if (!split) return;
  const preset = SPLIT_PRESETS.find((p) => p.id === split.preset);
  const now = nowIso();
  db().withTransactionSync(() => {
    deactivateSplits();
    db().runSync('UPDATE splits SET active = 1, updated_at = ? WHERE id = ?', [now, id]);
    // Restore preset weekdays; custom splits get an even spread.
    split.days.forEach((d, i) => {
      const weekdays = preset?.days.find((p) => p.name === d.name)?.weekdays ?? [((i * 2) % 6) + 1];
      db().runSync('UPDATE routines SET weekdays = ?, updated_at = ? WHERE id = ?', [JSON.stringify(weekdays), now, d.id]);
    });
  });
  changed('splits', 'routines');
}

export function renameSplit(id: string, name: string) {
  db().runSync('UPDATE splits SET name = ?, updated_at = ? WHERE id = ?', [name.trim(), nowIso(), id]);
  changed('splits');
}

function deleteRoutineInTx(routineId: string, now: string) {
  db().runSync('UPDATE routines SET deleted_at = ?, updated_at = ? WHERE id = ?', [now, now, routineId]);
  db().runSync('UPDATE routine_items SET deleted_at = ?, updated_at = ? WHERE routine_id = ? AND deleted_at IS NULL', [now, now, routineId]);
}

export function deleteSplit(id: string) {
  const now = nowIso();
  db().withTransactionSync(() => {
    const days = db().getAllSync<{ id: string }>('SELECT id FROM routines WHERE split_id = ? AND deleted_at IS NULL', [id]);
    for (const d of days) deleteRoutineInTx(d.id, now);
    db().runSync('UPDATE splits SET deleted_at = ?, updated_at = ? WHERE id = ?', [now, now, id]);
  });
  changed('splits', 'routines', 'routine_items');
}

export function addSplitDay(splitId: string, name: string, groups: SplitGroup[], weekdays: number[]): string {
  const position = db().getFirstSync<{ n: number }>('SELECT COUNT(*) AS n FROM routines WHERE deleted_at IS NULL')?.n ?? 0;
  const id = insertSplitDay(splitId, { name, groups, weekdays, repMin: 8, repMax: 12, perGroup: 2 }, position, exercisesForDay({ groups, perGroup: 2 }));
  changed('routines', 'routine_items');
  return id;
}

/** Changes a day's muscle groups, adding default exercises for newly added groups. */
export function setDayGroups(routineId: string, groups: SplitGroup[]) {
  const routine = getRoutine(routineId);
  if (!routine) return;
  const added = groups.filter((g) => !routine.muscleGroups.includes(g));
  db().runSync('UPDATE routines SET muscle_groups = ?, updated_at = ? WHERE id = ?', [JSON.stringify(groups), nowIso(), routineId]);
  const newIds = exercisesForDay({ groups: added, perGroup: 2 }).filter((e) => !routine.items.some((i) => i.exerciseId === e));
  if (newIds.length) addRoutineItems(routineId, newIds);
  changed('routines');
}

export function deleteSplitDay(routineId: string) {
  db().withTransactionSync(() => deleteRoutineInTx(routineId, nowIso()));
  changed('routines', 'routine_items');
}
