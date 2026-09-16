/** Append-only. Each entry runs once, in order, tracked by PRAGMA user_version. */
export const MIGRATIONS: string[] = [
  `
  CREATE TABLE profile (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT,
    name TEXT,
    sex TEXT NOT NULL,
    birth_date TEXT NOT NULL,
    height_cm REAL NOT NULL,
    activity TEXT NOT NULL,
    experience TEXT NOT NULL,
    body_fat_pct REAL,
    dietary_prefs TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    synced_at TEXT
  );

  CREATE TABLE phases (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT,
    goal_type TEXT NOT NULL,
    status TEXT NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT,
    start_kg REAL NOT NULL,
    target_kg REAL,
    rate_pct_week REAL NOT NULL,
    overrides TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    synced_at TEXT
  );

  CREATE TABLE weight_entries (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT,
    date_key TEXT NOT NULL,
    measured_at TEXT NOT NULL,
    kg REAL NOT NULL,
    source TEXT NOT NULL DEFAULT 'manual',
    note TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    synced_at TEXT
  );
  CREATE INDEX weight_entries_date ON weight_entries (date_key);

  CREATE TABLE log_entries (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT,
    date_key TEXT NOT NULL,
    meal_slot TEXT NOT NULL,
    food_ref TEXT,
    name TEXT NOT NULL,
    quantity REAL NOT NULL,
    unit TEXT NOT NULL,
    grams REAL,
    kcal REAL NOT NULL,
    protein REAL NOT NULL,
    carbs REAL NOT NULL,
    fat REAL NOT NULL,
    fiber REAL NOT NULL DEFAULT 0,
    source TEXT NOT NULL,
    raw_input TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    synced_at TEXT
  );
  CREATE INDEX log_entries_date ON log_entries (date_key);

  CREATE TABLE custom_foods (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT,
    name TEXT NOT NULL,
    kcal REAL NOT NULL,
    protein REAL NOT NULL,
    carbs REAL NOT NULL,
    fat REAL NOT NULL,
    fiber REAL NOT NULL DEFAULT 0,
    serving_name TEXT,
    serving_grams REAL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    synced_at TEXT
  );

  CREATE TABLE water_entries (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT,
    date_key TEXT NOT NULL,
    ml REAL NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    synced_at TEXT
  );
  CREATE INDEX water_entries_date ON water_entries (date_key);

  CREATE TABLE sync_state (
    table_name TEXT PRIMARY KEY NOT NULL,
    last_pulled_at TEXT
  );
  `,
  `
  CREATE TABLE custom_exercises (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT,
    name TEXT NOT NULL,
    primary_muscles TEXT NOT NULL DEFAULT '[]',
    secondary_muscles TEXT NOT NULL DEFAULT '[]',
    equipment TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    synced_at TEXT
  );

  CREATE TABLE routines (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT,
    name TEXT NOT NULL,
    notes TEXT,
    position INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    synced_at TEXT
  );

  CREATE TABLE routine_items (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT,
    routine_id TEXT NOT NULL,
    exercise_id TEXT NOT NULL,
    position INTEGER NOT NULL,
    sets INTEGER NOT NULL DEFAULT 3,
    rep_min INTEGER NOT NULL DEFAULT 8,
    rep_max INTEGER NOT NULL DEFAULT 12,
    rest_s INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    synced_at TEXT
  );
  CREATE INDEX routine_items_routine ON routine_items (routine_id);

  CREATE TABLE workouts (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT,
    name TEXT NOT NULL,
    routine_id TEXT,
    date_key TEXT NOT NULL,
    started_at TEXT NOT NULL,
    ended_at TEXT,
    notes TEXT,
    rating INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    synced_at TEXT
  );
  CREATE INDEX workouts_started ON workouts (started_at);

  CREATE TABLE workout_exercises (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT,
    workout_id TEXT NOT NULL,
    exercise_id TEXT NOT NULL,
    position INTEGER NOT NULL,
    rest_s INTEGER,
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    synced_at TEXT
  );
  CREATE INDEX workout_exercises_workout ON workout_exercises (workout_id);
  CREATE INDEX workout_exercises_exercise ON workout_exercises (exercise_id);

  CREATE TABLE workout_sets (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT,
    workout_id TEXT NOT NULL,
    workout_exercise_id TEXT NOT NULL,
    position INTEGER NOT NULL,
    kind TEXT NOT NULL DEFAULT 'working',
    weight_kg REAL,
    reps INTEGER,
    rpe REAL,
    completed_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    synced_at TEXT
  );
  CREATE INDEX workout_sets_we ON workout_sets (workout_exercise_id);
  CREATE INDEX workout_sets_workout ON workout_sets (workout_id);
  `,
  `
  CREATE TABLE measurements (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT,
    date_key TEXT NOT NULL,
    site TEXT NOT NULL,
    cm REAL NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    synced_at TEXT
  );
  CREATE INDEX measurements_site_date ON measurements (site, date_key);

  CREATE TABLE body_comp_entries (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT,
    date_key TEXT NOT NULL,
    method TEXT NOT NULL,
    bf_pct REAL NOT NULL,
    data TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    synced_at TEXT
  );

  CREATE TABLE progress_photos (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT,
    date_key TEXT NOT NULL,
    pose TEXT NOT NULL,
    local_path TEXT,
    storage_path TEXT,
    weight_kg REAL,
    note TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    synced_at TEXT
  );
  CREATE INDEX progress_photos_date ON progress_photos (date_key);

  CREATE TABLE habits (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT,
    name TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'manual',
    position INTEGER NOT NULL DEFAULT 0,
    archived_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    synced_at TEXT
  );

  CREATE TABLE habit_logs (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT,
    habit_id TEXT NOT NULL,
    date_key TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    synced_at TEXT
  );
  CREATE INDEX habit_logs_date ON habit_logs (date_key);

  CREATE TABLE saved_meals (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT,
    name TEXT NOT NULL,
    items TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    synced_at TEXT
  );
  `,
  `
  ALTER TABLE workout_exercises ADD COLUMN rep_min INTEGER;
  ALTER TABLE workout_exercises ADD COLUMN rep_max INTEGER;
  ALTER TABLE routines ADD COLUMN weekdays TEXT NOT NULL DEFAULT '[]';
  ALTER TABLE custom_foods ADD COLUMN barcode TEXT;
  CREATE INDEX custom_foods_barcode ON custom_foods (barcode);
  `,
  `
  CREATE TABLE splits (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT,
    name TEXT NOT NULL,
    preset TEXT,
    active INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    synced_at TEXT
  );
  ALTER TABLE routines ADD COLUMN split_id TEXT;
  ALTER TABLE routines ADD COLUMN muscle_groups TEXT NOT NULL DEFAULT '[]';
  ALTER TABLE workouts ADD COLUMN kcal REAL;
  `,
];
