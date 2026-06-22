create table if not exists public.prayer_audio (
  id uuid primary key default gen_random_uuid(),
  day_index int not null unique references public.prayer_days(day_index) on delete cascade,
  storage_path text not null,
  public_url text not null,
  uploaded_at timestamptz not null default now()
);

alter table public.prayer_audio enable row level security;

drop policy if exists public_read_prayer_audio on public.prayer_audio;
create policy public_read_prayer_audio on public.prayer_audio for select using (true);

drop policy if exists public_upsert_prayer_audio on public.prayer_audio;
create policy public_upsert_prayer_audio on public.prayer_audio for all using (true) with check (true);

insert into storage.buckets (id, name, public)
values ('prayer-audio', 'prayer-audio', true)
on conflict (id) do update set public = true;

drop policy if exists public_read_prayer_audio_bucket on storage.objects;
create policy public_read_prayer_audio_bucket
on storage.objects for select
using (bucket_id = 'prayer-audio');

drop policy if exists public_insert_prayer_audio_bucket on storage.objects;
create policy public_insert_prayer_audio_bucket
on storage.objects for insert
with check (bucket_id = 'prayer-audio');

drop policy if exists public_update_prayer_audio_bucket on storage.objects;
create policy public_update_prayer_audio_bucket
on storage.objects for update
using (bucket_id = 'prayer-audio')
with check (bucket_id = 'prayer-audio');

drop policy if exists public_delete_prayer_audio_bucket on storage.objects;
create policy public_delete_prayer_audio_bucket
on storage.objects for delete
using (bucket_id = 'prayer-audio');
