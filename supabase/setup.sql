create extension if not exists pgcrypto;

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

create table if not exists public.classes (
  id text primary key,
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.students (
  id text primary key,
  class_id text references public.classes(id) on delete set null,
  class_name text not null,
  name text not null,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.teachers (
  id text primary key,
  name text not null unique,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.participants (
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

create table if not exists public.participant_children (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.participants(id) on delete cascade,
  student_id text references public.students(id) on delete set null,
  child_name text not null,
  class_name text,
  custom boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.prayer_days (
  day_index int primary key check (day_index between 1 and 20),
  prayer_date date not null unique,
  publish_at timestamptz not null,
  title text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.prayer_images (
  id uuid primary key default gen_random_uuid(),
  day_index int not null references public.prayer_days(day_index) on delete cascade,
  slot int not null check (slot in (1, 2, 3)),
  storage_path text not null,
  public_url text not null,
  uploaded_at timestamptz not null default now(),
  unique (day_index, slot)
);

create table if not exists public.prayer_completions (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.participants(id) on delete cascade,
  day_index int not null references public.prayer_days(day_index) on delete cascade,
  completed_at timestamptz not null default now(),
  collected_at timestamptz not null default now(),
  unique (participant_id, day_index)
);

create table if not exists public.challenge_closures (
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
alter table public.prayer_completions enable row level security;
alter table public.challenge_closures enable row level security;

drop policy if exists public_read_classes on public.classes;
create policy public_read_classes on public.classes for select using (true);

drop policy if exists public_read_students on public.students;
create policy public_read_students on public.students for select using (true);

drop policy if exists public_read_teachers on public.teachers;
create policy public_read_teachers on public.teachers for select using (true);

drop policy if exists public_read_prayer_days on public.prayer_days;
create policy public_read_prayer_days on public.prayer_days for select using (true);

drop policy if exists public_read_prayer_images on public.prayer_images;
create policy public_read_prayer_images on public.prayer_images for select using (true);

drop policy if exists public_read_participants on public.participants;
create policy public_read_participants on public.participants for select using (true);

drop policy if exists public_insert_participants on public.participants;
create policy public_insert_participants on public.participants for insert with check (true);

drop policy if exists public_update_participants on public.participants;
create policy public_update_participants on public.participants for update using (true) with check (true);

drop policy if exists public_read_participant_children on public.participant_children;
create policy public_read_participant_children on public.participant_children for select using (true);

drop policy if exists public_insert_participant_children on public.participant_children;
create policy public_insert_participant_children on public.participant_children for insert with check (true);

drop policy if exists public_read_prayer_completions on public.prayer_completions;
create policy public_read_prayer_completions on public.prayer_completions for select using (true);

drop policy if exists public_insert_prayer_completions on public.prayer_completions;
create policy public_insert_prayer_completions on public.prayer_completions for insert with check (true);

drop policy if exists public_read_challenge_closures on public.challenge_closures;
create policy public_read_challenge_closures on public.challenge_closures for select using (true);

drop policy if exists public_insert_challenge_closures on public.challenge_closures;
create policy public_insert_challenge_closures on public.challenge_closures for insert with check (true);

drop policy if exists public_upsert_prayer_images on public.prayer_images;
create policy public_upsert_prayer_images on public.prayer_images for all using (true) with check (true);

insert into public.classes (id, name, sort_order) values
  ('sarang', '사랑반', 1),
  ('somang1', '소망1반', 2),
  ('somang2', '소망2반', 3),
  ('mideum1', '믿음1반', 4),
  ('mideum2', '믿음2반', 5)
on conflict (id) do update set
  name = excluded.name,
  sort_order = excluded.sort_order;

insert into public.teachers (id, name, sort_order) values
  ('teacher-kang-sunjin', '강순진', 1),
  ('teacher-kim-hyun-jin', '김현진', 2),
  ('teacher-park-okhee', '박옥희', 3),
  ('teacher-seong-yuri', '성유리', 4),
  ('teacher-shin-migyeong', '신미경', 5),
  ('teacher-oh-seonnyeo', '오선녀', 6),
  ('teacher-yoon-jeonga', '윤정아', 7),
  ('teacher-lee-rinja', '이린자', 8),
  ('teacher-lee-seonye', '이선예', 9),
  ('teacher-jeong-eunji', '정은지', 10),
  ('teacher-jo-mungyeong', '조문경', 11),
  ('teacher-jo-seonyeong', '조선영', 12),
  ('teacher-hong-myeonghwan', '홍명환', 13)
on conflict (id) do update set
  name = excluded.name,
  sort_order = excluded.sort_order,
  active = true;

insert into public.students (id, class_id, class_name, name, sort_order) values
  ('sarang-kim-chaeron', 'sarang', '사랑반', '김채론', 1),
  ('sarang-noel', 'sarang', '사랑반', '노엘', 2),
  ('sarang-song-yeseo', 'sarang', '사랑반', '송예서', 3),
  ('sarang-an-jiho', 'sarang', '사랑반', '안지호', 4),
  ('sarang-yoon-juro', 'sarang', '사랑반', '윤주로', 5),
  ('sarang-jang-yunseul', 'sarang', '사랑반', '장윤슬', 6),
  ('sarang-jung-jiho', 'sarang', '사랑반', '정지호', 7),
  ('somang1-kim-aron', 'somang1', '소망1반', '김아론', 1),
  ('somang1-kim-yunwoo', 'somang1', '소망1반', '김윤우', 2),
  ('somang1-song-yeonseo', 'somang1', '소망1반', '송연서', 3),
  ('somang1-yoo-seonye', 'somang1', '소망1반', '유선예', 4),
  ('somang1-yoo-seonha', 'somang1', '소망1반', '유선하', 5),
  ('somang2-kim-raon', 'somang2', '소망2반', '김라온', 1),
  ('somang2-kim-iseo', 'somang2', '소망2반', '김이서', 2),
  ('somang2-kim-hamin', 'somang2', '소망2반', '김하민', 3),
  ('somang2-park-jaejun', 'somang2', '소망2반', '박재준', 4),
  ('somang2-choi-jian', 'somang2', '소망2반', '최지안', 5),
  ('somang2-kim-eunyul', 'somang2', '소망2반', '김은율', 6),
  ('somang2-yoon-seol', 'somang2', '소망2반', '윤설', 7),
  ('mideum1-kim-dahee', 'mideum1', '믿음1반', '김다희', 1),
  ('mideum1-kim-eunwoo', 'mideum1', '믿음1반', '김은우', 2),
  ('mideum1-lee-seowoo', 'mideum1', '믿음1반', '이서우', 3),
  ('mideum1-jin-sori', 'mideum1', '믿음1반', '진소리', 4),
  ('mideum2-son-hyerin', 'mideum2', '믿음2반', '손혜린', 1),
  ('mideum2-yoon-taejun', 'mideum2', '믿음2반', '윤태준', 2),
  ('mideum2-cha-yeeon', 'mideum2', '믿음2반', '차예언', 3),
  ('mideum2-ham-iseo', 'mideum2', '믿음2반', '함이서', 4)
on conflict (id) do update set
  class_id = excluded.class_id,
  class_name = excluded.class_name,
  name = excluded.name,
  sort_order = excluded.sort_order,
  active = true;

insert into public.prayer_days (day_index, prayer_date, publish_at, title)
select day_index, prayer_date, publish_at, title
from (values
  (1, date '2026-06-22', timestamptz '2026-06-22 00:00:00+09', '1일차 기도문'),
  (2, date '2026-06-23', timestamptz '2026-06-23 00:00:00+09', '2일차 기도문'),
  (3, date '2026-06-24', timestamptz '2026-06-24 00:00:00+09', '3일차 기도문'),
  (4, date '2026-06-25', timestamptz '2026-06-25 00:00:00+09', '4일차 기도문'),
  (5, date '2026-06-26', timestamptz '2026-06-26 00:00:00+09', '5일차 기도문'),
  (6, date '2026-06-27', timestamptz '2026-06-27 00:00:00+09', '6일차 기도문'),
  (7, date '2026-06-28', timestamptz '2026-06-28 00:00:00+09', '7일차 기도문'),
  (8, date '2026-06-29', timestamptz '2026-06-29 00:00:00+09', '8일차 기도문'),
  (9, date '2026-06-30', timestamptz '2026-06-30 00:00:00+09', '9일차 기도문'),
  (10, date '2026-07-01', timestamptz '2026-07-01 00:00:00+09', '10일차 기도문'),
  (11, date '2026-07-02', timestamptz '2026-07-02 00:00:00+09', '11일차 기도문'),
  (12, date '2026-07-03', timestamptz '2026-07-03 00:00:00+09', '12일차 기도문'),
  (13, date '2026-07-04', timestamptz '2026-07-04 00:00:00+09', '13일차 기도문'),
  (14, date '2026-07-05', timestamptz '2026-07-05 00:00:00+09', '14일차 기도문'),
  (15, date '2026-07-06', timestamptz '2026-07-06 00:00:00+09', '15일차 기도문'),
  (16, date '2026-07-07', timestamptz '2026-07-07 00:00:00+09', '16일차 기도문'),
  (17, date '2026-07-08', timestamptz '2026-07-08 00:00:00+09', '17일차 기도문'),
  (18, date '2026-07-09', timestamptz '2026-07-09 00:00:00+09', '18일차 기도문'),
  (19, date '2026-07-10', timestamptz '2026-07-10 00:00:00+09', '19일차 기도문'),
  (20, date '2026-07-11', timestamptz '2026-07-11 00:00:00+09', '20일차 기도문')
) as v(day_index, prayer_date, publish_at, title)
on conflict (day_index) do update set
  prayer_date = excluded.prayer_date,
  publish_at = excluded.publish_at,
  title = excluded.title;

insert into storage.buckets (id, name, public)
values ('prayer-images', 'prayer-images', true)
on conflict (id) do update set public = true;

drop policy if exists public_read_prayer_images_bucket on storage.objects;
create policy public_read_prayer_images_bucket
on storage.objects for select
using (bucket_id = 'prayer-images');

drop policy if exists public_insert_prayer_images_bucket on storage.objects;
create policy public_insert_prayer_images_bucket
on storage.objects for insert
with check (bucket_id = 'prayer-images');

drop policy if exists public_update_prayer_images_bucket on storage.objects;
create policy public_update_prayer_images_bucket
on storage.objects for update
using (bucket_id = 'prayer-images')
with check (bucket_id = 'prayer-images');
