-- Metakai initial schema.
-- Rows mirror the app's local SQLite tables. Timestamps are ISO-8601 text written by the
-- client so last-write-wins comparisons behave identically on both sides.

create table public.profile (
  id uuid primary key,
  user_id uuid not null unique references auth.users (id) on delete cascade,
  name text,
  sex text not null check (sex in ('male', 'female')),
  birth_date text not null,
  height_cm real not null,
  activity text not null,
  experience text not null,
  body_fat_pct real,
  dietary_prefs text not null default '[]',
  created_at text not null,
  updated_at text not null,
  deleted_at text
);

create table public.phases (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  goal_type text not null,
  status text not null,
  start_date text not null,
  end_date text,
  start_kg real not null,
  target_kg real,
  rate_pct_week real not null,
  overrides text not null default '{}',
  created_at text not null,
  updated_at text not null,
  deleted_at text
);

create table public.weight_entries (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  date_key text not null,
  measured_at text not null,
  kg real not null,
  source text not null default 'manual',
  note text,
  created_at text not null,
  updated_at text not null,
  deleted_at text
);

create table public.log_entries (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  date_key text not null,
  meal_slot text not null,
  food_ref text,
  name text not null,
  quantity real not null,
  unit text not null,
  grams real,
  kcal real not null,
  protein real not null,
  carbs real not null,
  fat real not null,
  fiber real not null default 0,
  source text not null,
  raw_input text,
  created_at text not null,
  updated_at text not null,
  deleted_at text
);

create table public.custom_foods (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  kcal real not null,
  protein real not null,
  carbs real not null,
  fat real not null,
  fiber real not null default 0,
  serving_name text,
  serving_grams real,
  created_at text not null,
  updated_at text not null,
  deleted_at text
);

create table public.water_entries (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  date_key text not null,
  ml real not null,
  created_at text not null,
  updated_at text not null,
  deleted_at text
);

-- Per-user daily AI call counter, written only by edge functions (service role).
create table public.ai_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  calls integer not null default 0,
  primary key (user_id, day)
);

create index phases_user_updated on public.phases (user_id, updated_at);
create index weight_entries_user_updated on public.weight_entries (user_id, updated_at);
create index log_entries_user_updated on public.log_entries (user_id, updated_at);
create index custom_foods_user_updated on public.custom_foods (user_id, updated_at);
create index water_entries_user_updated on public.water_entries (user_id, updated_at);
create index profile_user_updated on public.profile (user_id, updated_at);

-- Row Level Security: every user sees and writes only their own rows.
do $$
declare t text;
begin
  foreach t in array array['profile', 'phases', 'weight_entries', 'log_entries', 'custom_foods', 'water_entries'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "own rows select" on public.%I for select using (user_id = auth.uid())', t);
    execute format('create policy "own rows insert" on public.%I for insert with check (user_id = auth.uid())', t);
    execute format('create policy "own rows update" on public.%I for update using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
    execute format('create policy "own rows delete" on public.%I for delete using (user_id = auth.uid())', t);
  end loop;
end $$;

alter table public.ai_usage enable row level security;
create policy "own usage select" on public.ai_usage for select using (user_id = auth.uid());

-- Atomically increments today's AI usage and returns the new count.
create or replace function public.increment_ai_usage(p_user uuid)
returns integer
language sql
security definer
set search_path = public
as $$
  insert into public.ai_usage (user_id, day, calls)
  values (p_user, (now() at time zone 'utc')::date, 1)
  on conflict (user_id, day) do update set calls = public.ai_usage.calls + 1
  returning calls;
$$;

revoke all on function public.increment_ai_usage(uuid) from public, anon, authenticated;

-- Lightweight endpoint for the keep-alive workflow.
create or replace function public.ping()
returns text
language sql
stable
as $$ select 'ok'::text $$;

grant execute on function public.ping() to anon, authenticated;
