import type { ActivityLevel, Sex } from '../../lib/energy';
import type { Experience, GoalType } from '../../lib/goals';
import type { MacroTargets } from '../../lib/targets';
import { getDb, newId, notify, nowIso } from './database';

export interface Profile {
  id: string;
  name: string | null;
  sex: Sex;
  birthDate: string;
  heightCm: number;
  activity: ActivityLevel;
  experience: Experience;
  bodyFatPct: number | null;
  dietaryPrefs: string[];
}

/** Manual macro targets plus goal-specific settings stored with a phase. */
export type PhaseOverrides = Partial<MacroTargets> & {
  reverseStartKcal?: number;
  reverseStepKcal?: number;
};

export const MACRO_KEYS = ['kcal', 'protein', 'carbs', 'fat', 'fiber'] as const;

export interface Phase {
  id: string;
  goalType: GoalType;
  status: 'active' | 'completed' | 'planned';
  startDate: string;
  endDate: string | null;
  startKg: number;
  targetKg: number | null;
  ratePctWeek: number;
  overrides: PhaseOverrides;
}

export interface WeightEntry {
  id: string;
  dateKey: string;
  measuredAt: string;
  kg: number;
  note: string | null;
}

export type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snacks';

export const MEAL_SLOTS: { id: MealSlot; title: string }[] = [
  { id: 'breakfast', title: 'Breakfast' },
  { id: 'lunch', title: 'Lunch' },
  { id: 'dinner', title: 'Dinner' },
  { id: 'snacks', title: 'Snacks' },
];

export interface LogEntry {
  id: string;
  dateKey: string;
  mealSlot: MealSlot;
  foodRef: string | null;
  name: string;
  quantity: number;
  unit: string;
  grams: number | null;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  source: 'local' | 'ai' | 'custom' | 'quick';
  rawInput: string | null;
  createdAt: string;
}

export interface CustomFood {
  id: string;
  name: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  servingName: string | null;
  servingGrams: number | null;
  barcode?: string | null;
}

/* ---------------- profile ---------------- */

interface ProfileRow {
  id: string;
  name: string | null;
  sex: Sex;
  birth_date: string;
  height_cm: number;
  activity: ActivityLevel;
  experience: Experience;
  body_fat_pct: number | null;
  dietary_prefs: string;
}

export function getProfile(): Profile | null {
  const r = getDb().getFirstSync<ProfileRow>('SELECT * FROM profile WHERE deleted_at IS NULL LIMIT 1');
  if (!r) return null;
  return {
    id: r.id,
    name: r.name,
    sex: r.sex,
    birthDate: r.birth_date,
    heightCm: r.height_cm,
    activity: r.activity,
    experience: r.experience,
    bodyFatPct: r.body_fat_pct,
    dietaryPrefs: JSON.parse(r.dietary_prefs),
  };
}

export function saveProfile(p: Omit<Profile, 'id'> & { id?: string }): Profile {
  const db = getDb();
  const existing = getProfile();
  const id = p.id ?? existing?.id ?? newId();
  const now = nowIso();
  db.runSync(
    `INSERT INTO profile (id, name, sex, birth_date, height_cm, activity, experience, body_fat_pct, dietary_prefs, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, sex = excluded.sex, birth_date = excluded.birth_date,
       height_cm = excluded.height_cm, activity = excluded.activity, experience = excluded.experience,
       body_fat_pct = excluded.body_fat_pct, dietary_prefs = excluded.dietary_prefs, updated_at = excluded.updated_at`,
    [id, p.name, p.sex, p.birthDate, p.heightCm, p.activity, p.experience, p.bodyFatPct, JSON.stringify(p.dietaryPrefs), now, now],
  );
  notify('profile');
  return { ...p, id };
}

/* ---------------- phases ---------------- */

interface PhaseRow {
  id: string;
  goal_type: GoalType;
  status: Phase['status'];
  start_date: string;
  end_date: string | null;
  start_kg: number;
  target_kg: number | null;
  rate_pct_week: number;
  overrides: string;
}

const toPhase = (r: PhaseRow): Phase => ({
  id: r.id,
  goalType: r.goal_type,
  status: r.status,
  startDate: r.start_date,
  endDate: r.end_date,
  startKg: r.start_kg,
  targetKg: r.target_kg,
  ratePctWeek: r.rate_pct_week,
  overrides: JSON.parse(r.overrides),
});

export function getActivePhase(): Phase | null {
  const r = getDb().getFirstSync<PhaseRow>(
    "SELECT * FROM phases WHERE status = 'active' AND deleted_at IS NULL ORDER BY start_date DESC LIMIT 1",
  );
  return r ? toPhase(r) : null;
}

export function listPhases(): Phase[] {
  return getDb()
    .getAllSync<PhaseRow>('SELECT * FROM phases WHERE deleted_at IS NULL ORDER BY start_date DESC')
    .map(toPhase);
}

/** Starts a new active phase, completing the previous one. */
export function startPhase(p: Omit<Phase, 'id' | 'status' | 'endDate'> & { endDate?: string | null }): Phase {
  const db = getDb();
  const id = newId();
  const now = nowIso();
  db.withTransactionSync(() => {
    db.runSync(
      "UPDATE phases SET status = 'completed', end_date = ?, updated_at = ? WHERE status = 'active' AND deleted_at IS NULL",
      [p.startDate, now],
    );
    db.runSync(
      `INSERT INTO phases (id, goal_type, status, start_date, end_date, start_kg, target_kg, rate_pct_week, overrides, created_at, updated_at)
       VALUES (?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, p.goalType, p.startDate, p.endDate ?? null, p.startKg, p.targetKg, p.ratePctWeek, JSON.stringify(p.overrides), now, now],
    );
  });
  notify('phases');
  return { ...p, id, status: 'active', endDate: p.endDate ?? null };
}

export function updatePhase(id: string, patch: Partial<Pick<Phase, 'targetKg' | 'ratePctWeek' | 'overrides'>>) {
  const current = getDb().getFirstSync<PhaseRow>('SELECT * FROM phases WHERE id = ?', [id]);
  if (!current) return;
  const merged = { ...toPhase(current), ...patch };
  getDb().runSync('UPDATE phases SET target_kg = ?, rate_pct_week = ?, overrides = ?, updated_at = ? WHERE id = ?', [
    merged.targetKg,
    merged.ratePctWeek,
    JSON.stringify(merged.overrides),
    nowIso(),
    id,
  ]);
  notify('phases');
}

/* ---------------- weight ---------------- */

interface WeightRow {
  id: string;
  date_key: string;
  measured_at: string;
  kg: number;
  note: string | null;
}

const toWeight = (r: WeightRow): WeightEntry => ({
  id: r.id,
  dateKey: r.date_key,
  measuredAt: r.measured_at,
  kg: r.kg,
  note: r.note,
});

export function listWeights(): WeightEntry[] {
  return getDb()
    .getAllSync<WeightRow>('SELECT * FROM weight_entries WHERE deleted_at IS NULL ORDER BY measured_at ASC')
    .map(toWeight);
}

export function latestWeight(): WeightEntry | null {
  const r = getDb().getFirstSync<WeightRow>(
    'SELECT * FROM weight_entries WHERE deleted_at IS NULL ORDER BY measured_at DESC LIMIT 1',
  );
  return r ? toWeight(r) : null;
}

export function addWeight(dateKey: string, kg: number, note: string | null = null): WeightEntry {
  const id = newId();
  const now = nowIso();
  getDb().runSync(
    'INSERT INTO weight_entries (id, date_key, measured_at, kg, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [id, dateKey, now, kg, note, now, now],
  );
  notify('weight_entries');
  return { id, dateKey, measuredAt: now, kg, note };
}

export function deleteWeight(id: string) {
  const now = nowIso();
  getDb().runSync('UPDATE weight_entries SET deleted_at = ?, updated_at = ? WHERE id = ?', [now, now, id]);
  notify('weight_entries');
}

export function restoreWeight(id: string) {
  getDb().runSync('UPDATE weight_entries SET deleted_at = NULL, updated_at = ? WHERE id = ?', [nowIso(), id]);
  notify('weight_entries');
}

/* ---------------- food log ---------------- */

interface LogRow {
  id: string;
  date_key: string;
  meal_slot: MealSlot;
  food_ref: string | null;
  name: string;
  quantity: number;
  unit: string;
  grams: number | null;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  source: LogEntry['source'];
  raw_input: string | null;
  created_at: string;
}

const toLog = (r: LogRow): LogEntry => ({
  id: r.id,
  dateKey: r.date_key,
  mealSlot: r.meal_slot,
  foodRef: r.food_ref,
  name: r.name,
  quantity: r.quantity,
  unit: r.unit,
  grams: r.grams,
  kcal: r.kcal,
  protein: r.protein,
  carbs: r.carbs,
  fat: r.fat,
  fiber: r.fiber,
  source: r.source,
  rawInput: r.raw_input,
  createdAt: r.created_at,
});

export function listLog(dateKey: string): LogEntry[] {
  return getDb()
    .getAllSync<LogRow>('SELECT * FROM log_entries WHERE date_key = ? AND deleted_at IS NULL ORDER BY created_at ASC', [
      dateKey,
    ])
    .map(toLog);
}

export type NewLogEntry = Omit<LogEntry, 'id' | 'createdAt'>;

export function addLogEntries(entries: NewLogEntry[]) {
  const db = getDb();
  const now = nowIso();
  db.withTransactionSync(() => {
    for (const e of entries) {
      db.runSync(
        `INSERT INTO log_entries (id, date_key, meal_slot, food_ref, name, quantity, unit, grams, kcal, protein, carbs, fat, fiber, source, raw_input, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          newId(),
          e.dateKey,
          e.mealSlot,
          e.foodRef,
          e.name,
          e.quantity,
          e.unit,
          e.grams,
          e.kcal,
          e.protein,
          e.carbs,
          e.fat,
          e.fiber,
          e.source,
          e.rawInput,
          now,
          now,
        ],
      );
    }
  });
  notify('log_entries');
}

export function deleteLogEntry(id: string) {
  const now = nowIso();
  getDb().runSync('UPDATE log_entries SET deleted_at = ?, updated_at = ? WHERE id = ?', [now, now, id]);
  notify('log_entries');
}

export function restoreLogEntry(id: string) {
  getDb().runSync('UPDATE log_entries SET deleted_at = NULL, updated_at = ? WHERE id = ?', [nowIso(), id]);
  notify('log_entries');
}

export interface DayTotals {
  dateKey: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
}

export function dailyTotals(fromDateKey: string): DayTotals[] {
  return getDb().getAllSync<DayTotals>(
    `SELECT date_key AS dateKey, SUM(kcal) AS kcal, SUM(protein) AS protein, SUM(carbs) AS carbs, SUM(fat) AS fat, SUM(fiber) AS fiber
     FROM log_entries WHERE deleted_at IS NULL AND date_key >= ? GROUP BY date_key ORDER BY date_key`,
    [fromDateKey],
  );
}

/** Most frequently logged items, newest wins on ties. */
export function frequentFoods(limit = 12): LogEntry[] {
  return getDb()
    .getAllSync<LogRow>(
      `SELECT l.* FROM log_entries l
       JOIN (
         SELECT id,
                ROW_NUMBER() OVER (PARTITION BY lower(name) ORDER BY created_at DESC) AS rn,
                COUNT(*) OVER (PARTITION BY lower(name)) AS cnt
         FROM log_entries WHERE deleted_at IS NULL
       ) x ON x.id = l.id
       WHERE x.rn = 1
       ORDER BY x.cnt DESC, l.created_at DESC
       LIMIT ?`,
      [limit],
    )
    .map(toLog);
}

/* ---------------- custom foods ---------------- */

interface CustomFoodRow {
  id: string;
  name: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  serving_name: string | null;
  serving_grams: number | null;
  barcode: string | null;
}

export function listCustomFoods(): CustomFood[] {
  return getDb()
    .getAllSync<CustomFoodRow>('SELECT * FROM custom_foods WHERE deleted_at IS NULL ORDER BY name')
    .map((r) => ({
      id: r.id,
      name: r.name,
      kcal: r.kcal,
      protein: r.protein,
      carbs: r.carbs,
      fat: r.fat,
      fiber: r.fiber,
      servingName: r.serving_name,
      servingGrams: r.serving_grams,
      barcode: r.barcode,
    }));
}

export function addCustomFood(f: Omit<CustomFood, 'id'>): CustomFood {
  const id = newId();
  const now = nowIso();
  getDb().runSync(
    `INSERT INTO custom_foods (id, name, kcal, protein, carbs, fat, fiber, serving_name, serving_grams, barcode, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, f.name, f.kcal, f.protein, f.carbs, f.fat, f.fiber, f.servingName, f.servingGrams, f.barcode ?? null, now, now],
  );
  notify('custom_foods');
  return { ...f, id };
}

/* ---------------- water ---------------- */

export function waterTotal(dateKey: string): number {
  const r = getDb().getFirstSync<{ total: number | null }>(
    'SELECT SUM(ml) AS total FROM water_entries WHERE date_key = ? AND deleted_at IS NULL',
    [dateKey],
  );
  return r?.total ?? 0;
}

export function addWater(dateKey: string, ml: number) {
  const now = nowIso();
  getDb().runSync('INSERT INTO water_entries (id, date_key, ml, created_at, updated_at) VALUES (?, ?, ?, ?, ?)', [
    newId(),
    dateKey,
    ml,
    now,
    now,
  ]);
  notify('water_entries');
}

export function undoLastWater(dateKey: string) {
  const now = nowIso();
  getDb().runSync(
    `UPDATE water_entries SET deleted_at = ?, updated_at = ? WHERE id = (
       SELECT id FROM water_entries WHERE date_key = ? AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1)`,
    [now, now, dateKey],
  );
  notify('water_entries');
}
