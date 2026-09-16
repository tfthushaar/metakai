import { getDb, newId, notify, nowIso, type TableName } from '../../core/db/database';
import { dateKey } from '../../lib/dates';
import { useSettings } from '../../core/store/settings';
import { estimate1RM } from '../../lib/strength';
import { doubleProgression, incrementFor, type ProgressionAdvice, type SessionSet } from '../../lib/training';
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
  const routines = db().getAllSync<RoutineRow>('SELECT id, name, notes, weekdays FROM routines WHERE deleted_at IS NULL ORDER BY position, created_at');
  const items = db().getAllSync<RoutineItemRow>('SELECT * FROM routine_items WHERE deleted_at IS NULL ORDER BY position');
  return routines.map((r) => ({
    id: r.id,
    name: r.name,
    notes: r.notes,
    weekdays: JSON.parse(r.weekdays || '[]'),
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
      db().runSync('UPDATE workouts SET ended_at = ?, notes = COALESCE(?, notes), updated_at = ? WHERE id = ?', [now, notes ?? null, now, id]);
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
