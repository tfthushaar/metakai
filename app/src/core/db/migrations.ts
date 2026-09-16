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
];
