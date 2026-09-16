-- GPS routes on cardio sessions.
alter table public.cardio_sessions add column route text;
alter table public.cardio_sessions add column elevation_m real;
alter table public.cardio_sessions add column elapsed_min real;
alter table public.cardio_sessions add column splits text;
alter table public.cardio_sessions add column title text;
