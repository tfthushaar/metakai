-- Body tracking, progress photos, habits and saved meals.

create table public.measurements (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  date_key text not null,
  site text not null,
  cm real not null,
  created_at text not null,
  updated_at text not null,
  deleted_at text
);

create table public.body_comp_entries (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  date_key text not null,
  method text not null,
  bf_pct real not null,
  data text not null default '{}',
  created_at text not null,
  updated_at text not null,
  deleted_at text
);

-- Photo files stay on the device; local_path is device-specific and storage_path is reserved for cloud copies.
create table public.progress_photos (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  date_key text not null,
  pose text not null,
  local_path text,
  storage_path text,
  weight_kg real,
  note text,
  created_at text not null,
  updated_at text not null,
  deleted_at text
);

create table public.habits (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  kind text not null default 'manual',
  position integer not null default 0,
  archived_at text,
  created_at text not null,
  updated_at text not null,
  deleted_at text
);

create table public.habit_logs (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  habit_id uuid not null,
  date_key text not null,
  created_at text not null,
  updated_at text not null,
  deleted_at text
);

create table public.saved_meals (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  items text not null,
  created_at text not null,
  updated_at text not null,
  deleted_at text
);

do $$
declare t text;
begin
  foreach t in array array['measurements', 'body_comp_entries', 'progress_photos', 'habits', 'habit_logs', 'saved_meals'] loop
    execute format('create index %I on public.%I (user_id, updated_at)', t || '_user_updated', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "own rows select" on public.%I for select using (user_id = auth.uid())', t);
    execute format('create policy "own rows insert" on public.%I for insert with check (user_id = auth.uid())', t);
    execute format('create policy "own rows update" on public.%I for update using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
    execute format('create policy "own rows delete" on public.%I for delete using (user_id = auth.uid())', t);
  end loop;
end $$;
