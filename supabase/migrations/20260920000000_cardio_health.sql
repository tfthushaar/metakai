-- Cardio, recovery check-ins, health markers and supplements.
create table public.cardio_sessions (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  date_key text not null,
  kind text not null,
  duration_min real not null,
  distance_km real,
  avg_hr real,
  rpe integer,
  kcal real,
  intervals text,
  note text,
  created_at text not null,
  updated_at text not null,
  deleted_at text
);

create table public.recovery_checkins (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  date_key text not null,
  sleep_hours real,
  sleep_quality integer,
  soreness integer,
  stress integer,
  energy integer,
  mood integer,
  note text,
  created_at text not null,
  updated_at text not null,
  deleted_at text
);

create table public.health_markers (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  date_key text not null,
  kind text not null,
  label text,
  value real not null,
  value2 real,
  unit text,
  note text,
  created_at text not null,
  updated_at text not null,
  deleted_at text
);

create table public.supplements (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  dose text,
  timing text,
  position integer not null default 0,
  created_at text not null,
  updated_at text not null,
  deleted_at text
);

create table public.supplement_logs (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  supplement_id uuid not null,
  date_key text not null,
  created_at text not null,
  updated_at text not null,
  deleted_at text
);

do $$
declare t text;
begin
  foreach t in array array['cardio_sessions', 'recovery_checkins', 'health_markers', 'supplements', 'supplement_logs'] loop
    execute format('create index %I on public.%I (user_id, updated_at)', t || '_user_updated', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "own rows select" on public.%I for select using (user_id = auth.uid())', t);
    execute format('create policy "own rows insert" on public.%I for insert with check (user_id = auth.uid())', t);
    execute format('create policy "own rows update" on public.%I for update using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
    execute format('create policy "own rows delete" on public.%I for delete using (user_id = auth.uid())', t);
  end loop;
end $$;
