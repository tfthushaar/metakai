-- Rep ranges carried into workouts (for progression), routine weekdays (training split) and food barcodes.
alter table public.workout_exercises add column rep_min integer;
alter table public.workout_exercises add column rep_max integer;
alter table public.routines add column weekdays text not null default '[]';
alter table public.custom_foods add column barcode text;
