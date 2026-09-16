-- Metakai leaderboards. Only derived, non-identifying data is stored.

CREATE TABLE users (
  -- SHA-256 of the Google account subject plus a secret pepper; the email is never stored.
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  name_key TEXT NOT NULL UNIQUE,
  country TEXT,
  sex TEXT NOT NULL,
  age_group TEXT NOT NULL,
  weight_class TEXT NOT NULL,
  height_band TEXT NOT NULL,
  friend_code TEXT NOT NULL UNIQUE,
  last_upload_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- One row per user per board. Bucket fields are copied from users so filtered boards stay index-only.
CREATE TABLE scores (
  user_id TEXT NOT NULL,
  board TEXT NOT NULL,
  score REAL NOT NULL,
  value REAL,
  held_until TEXT,
  sex TEXT NOT NULL,
  age_group TEXT NOT NULL,
  weight_class TEXT NOT NULL,
  height_band TEXT NOT NULL,
  country TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, board)
);
CREATE INDEX scores_all ON scores (board, score DESC);
CREATE INDEX scores_sex ON scores (board, sex, score DESC);
CREATE INDEX scores_age ON scores (board, sex, age_group, score DESC);
CREATE INDEX scores_weight ON scores (board, sex, weight_class, score DESC);
CREATE INDEX scores_height ON scores (board, sex, height_band, score DESC);
CREATE INDEX scores_country ON scores (board, country, score DESC);

CREATE TABLE friends (
  user_id TEXT NOT NULL,
  friend_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, friend_id)
);
CREATE INDEX friends_friend ON friends (friend_id);

-- Score distributions per board and bucket, refreshed by the scheduled job.
CREATE TABLE histograms (
  board TEXT NOT NULL,
  bucket TEXT NOT NULL,
  bins TEXT NOT NULL,
  total INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (board, bucket)
);
