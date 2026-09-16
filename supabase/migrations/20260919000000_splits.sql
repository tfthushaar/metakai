-- Training splits, routine muscle groups and workout calories.
create table public.splits (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  preset text,
  active integer not null default 0,
  created_at text not null,
  updated_at text not null,
  deleted_at text
);
create index splits_user_updated on public.splits (user_id, updated_at);
alter table public.splits enable row level security;
create policy "own rows select" on public.splits for select using (user_id = auth.uid());
create policy "own rows insert" on public.splits for insert with check (user_id = auth.uid());
create policy "own rows update" on public.splits for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows delete" on public.splits for delete using (user_id = auth.uid());

alter table public.routines add column split_id uuid;
alter table public.routines add column muscle_groups text not null default '[]';
alter table public.workouts add column kcal real;
