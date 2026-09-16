-- Workouts: custom exercises, routines and logged sessions.

create table public.custom_exercises (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  primary_muscles text not null default '[]',
  secondary_muscles text not null default '[]',
  equipment text not null,
  created_at text not null,
  updated_at text not null,
  deleted_at text
);

create table public.routines (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  notes text,
  position integer not null default 0,
  created_at text not null,
  updated_at text not null,
  deleted_at text
);

create table public.routine_items (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  routine_id uuid not null,
  exercise_id text not null,
  position integer not null,
  sets integer not null default 3,
  rep_min integer not null default 8,
  rep_max integer not null default 12,
  rest_s integer,
  created_at text not null,
  updated_at text not null,
  deleted_at text
);

create table public.workouts (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  routine_id uuid,
  date_key text not null,
  started_at text not null,
  ended_at text,
  notes text,
  rating integer,
  created_at text not null,
  updated_at text not null,
  deleted_at text
);

create table public.workout_exercises (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  workout_id uuid not null,
  exercise_id text not null,
  position integer not null,
  rest_s integer,
  notes text,
  created_at text not null,
  updated_at text not null,
  deleted_at text
);

create table public.workout_sets (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  workout_id uuid not null,
  workout_exercise_id uuid not null,
  position integer not null,
  kind text not null default 'working',
  weight_kg real,
  reps integer,
  rpe real,
  completed_at text,
  created_at text not null,
  updated_at text not null,
  deleted_at text
);

do $$
declare t text;
begin
  foreach t in array array['custom_exercises', 'routines', 'routine_items', 'workouts', 'workout_exercises', 'workout_sets'] loop
    execute format('create index %I on public.%I (user_id, updated_at)', t || '_user_updated', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "own rows select" on public.%I for select using (user_id = auth.uid())', t);
    execute format('create policy "own rows insert" on public.%I for insert with check (user_id = auth.uid())', t);
    execute format('create policy "own rows update" on public.%I for update using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
    execute format('create policy "own rows delete" on public.%I for delete using (user_id = auth.uid())', t);
  end loop;
end $$;
