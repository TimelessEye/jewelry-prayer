create extension if not exists pgcrypto;

create table public.classes (
  id text primary key,
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table public.students (
  id text primary key,
  class_id text references public.classes(id) on delete set null,
  class_name text not null,
  name text not null,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.teachers (
  id text primary key,
  name text not null unique,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.participants (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('parent', 'teacher')),
  display_name text not null,
  guardian_role text check (guardian_role in ('mom', 'daddy')),
  teacher_name text,
  source text not null default 'official' check (source in ('official', 'custom')),
  household_key text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table public.participant_children (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.participants(id) on delete cascade,
  student_id text references public.students(id) on delete set null,
  child_name text not null,
  class_name text,
  custom boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.prayer_days (
  day_index int primary key check (day_index between 1 and 20),
  prayer_date date not null unique,
  publish_at timestamptz not null,
  title text not null,
  created_at timestamptz not null default now()
);

create table public.prayer_images (
  id uuid primary key default gen_random_uuid(),
  day_index int not null references public.prayer_days(day_index) on delete cascade,
  slot int not null check (slot in (1, 2, 3)),
  storage_path text not null,
  public_url text not null,
  uploaded_at timestamptz not null default now(),
  unique (day_index, slot)
);

create table public.prayer_audio (
  id uuid primary key default gen_random_uuid(),
  day_index int not null unique references public.prayer_days(day_index) on delete cascade,
  storage_path text not null,
  public_url text not null,
  uploaded_at timestamptz not null default now()
);

create table public.prayer_texts (
  id uuid primary key default gen_random_uuid(),
  day_index int not null unique references public.prayer_days(day_index) on delete cascade,
  body text not null default '',
  updated_at timestamptz not null default now()
);

create table public.prayer_completions (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.participants(id) on delete cascade,
  day_index int not null references public.prayer_days(day_index) on delete cascade,
  completed_at timestamptz not null default now(),
  collected_at timestamptz not null default now(),
  unique (participant_id, day_index)
);

create table public.challenge_closures (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null unique references public.participants(id) on delete cascade,
  finalized_at timestamptz not null default now()
);

create or replace view public.participant_progress
with (security_invoker = on) as
select
  p.id as participant_id,
  p.type,
  p.display_name,
  p.source,
  p.household_key,
  p.teacher_name,
  count(pc.id)::int as completed_count,
  exists (
    select 1
    from public.challenge_closures cc
    where cc.participant_id = p.id
  ) as finalized,
  round((count(pc.id)::numeric / 20) * 100, 1) as completion_rate,
  max(pc.completed_at) as last_completed_at
from public.participants p
left join public.prayer_completions pc on pc.participant_id = p.id
group by p.id;

alter table public.classes enable row level security;
alter table public.students enable row level security;
alter table public.teachers enable row level security;
alter table public.participants enable row level security;
alter table public.participant_children enable row level security;
alter table public.prayer_days enable row level security;
alter table public.prayer_images enable row level security;
alter table public.prayer_audio enable row level security;
alter table public.prayer_texts enable row level security;
alter table public.prayer_completions enable row level security;
alter table public.challenge_closures enable row level security;

create policy public_read_classes on public.classes for select using (true);
create policy public_read_students on public.students for select using (true);
create policy public_read_teachers on public.teachers for select using (true);
create policy public_read_prayer_days on public.prayer_days for select using (true);
create policy public_read_prayer_images on public.prayer_images for select using (true);
create policy public_read_prayer_audio on public.prayer_audio for select using (true);
create policy public_read_prayer_texts on public.prayer_texts for select using (true);

create policy public_read_participants on public.participants for select using (true);
create policy public_insert_participants on public.participants for insert with check (true);
create policy public_update_participants on public.participants for update using (true) with check (true);

create policy public_read_participant_children on public.participant_children for select using (true);
create policy public_insert_participant_children on public.participant_children for insert with check (true);

create policy public_read_prayer_completions on public.prayer_completions for select using (true);
create policy public_insert_prayer_completions on public.prayer_completions for insert with check (true);

create policy public_read_challenge_closures on public.challenge_closures for select using (true);
create policy public_insert_challenge_closures on public.challenge_closures for insert with check (true);

create policy public_upsert_prayer_images on public.prayer_images for all using (true) with check (true);
create policy public_upsert_prayer_audio on public.prayer_audio for all using (true) with check (true);
create policy public_upsert_prayer_texts on public.prayer_texts for all using (true) with check (true);

insert into storage.buckets (id, name, public)
values ('prayer-images', 'prayer-images', true)
on conflict (id) do update set public = true;

insert into storage.buckets (id, name, public)
values ('prayer-audio', 'prayer-audio', true)
on conflict (id) do update set public = true;

create policy public_read_prayer_images_bucket
on storage.objects for select
using (bucket_id = 'prayer-images');

create policy public_insert_prayer_images_bucket
on storage.objects for insert
with check (bucket_id = 'prayer-images');

create policy public_update_prayer_images_bucket
on storage.objects for update
using (bucket_id = 'prayer-images')
with check (bucket_id = 'prayer-images');

create policy public_delete_prayer_images_bucket
on storage.objects for delete
using (bucket_id = 'prayer-images');

create policy public_read_prayer_audio_bucket
on storage.objects for select
using (bucket_id = 'prayer-audio');

create policy public_insert_prayer_audio_bucket
on storage.objects for insert
with check (bucket_id = 'prayer-audio');

create policy public_update_prayer_audio_bucket
on storage.objects for update
using (bucket_id = 'prayer-audio')
with check (bucket_id = 'prayer-audio');

create policy public_delete_prayer_audio_bucket
on storage.objects for delete
using (bucket_id = 'prayer-audio');
