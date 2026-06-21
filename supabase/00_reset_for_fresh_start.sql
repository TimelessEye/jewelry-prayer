drop view if exists public.participant_progress;

drop table if exists public.challenge_closures cascade;
drop table if exists public.prayer_completions cascade;
drop table if exists public.prayer_images cascade;
drop table if exists public.prayer_days cascade;
drop table if exists public.participant_children cascade;
drop table if exists public.participants cascade;
drop table if exists public.teachers cascade;
drop table if exists public.students cascade;
drop table if exists public.classes cascade;

drop policy if exists public_read_prayer_images_bucket on storage.objects;
drop policy if exists public_insert_prayer_images_bucket on storage.objects;
drop policy if exists public_update_prayer_images_bucket on storage.objects;
