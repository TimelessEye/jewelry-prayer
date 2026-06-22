-- 용문교회 유치부 20일 보석기도 앱 스키마 초안
-- Supabase SQL Editor에서 적용한다. service_role 키는 클라이언트에 노출하지 않는다.

create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  class_id uuid references public.classes(id) on delete set null,
  name text not null,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.teachers (
  id uuid primary key default gen_random_uuid(),
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
  teacher_id uuid references public.teachers(id) on delete set null,
  source text not null default 'official' check (source in ('official', 'custom')),
  household_key text,
  access_token_hash text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table if not exists public.participant_children (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.participants(id) on delete cascade,
  student_id uuid references public.students(id) on delete set null,
  custom_child_name text,
  created_at timestamptz not null default now(),
  check (student_id is not null or custom_child_name is not null)
);

create table if not exists public.prayer_days (
  id uuid primary key default gen_random_uuid(),
  day_index int not null unique check (day_index between 1 and 20),
  prayer_date date not null unique,
  publish_at timestamptz not null,
  title text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.prayer_images (
  id uuid primary key default gen_random_uuid(),
  prayer_day_id uuid not null references public.prayer_days(id) on delete cascade,
  slot int not null check (slot in (1, 2, 3)),
  storage_path text not null,
  uploaded_at timestamptz not null default now(),
  unique (prayer_day_id, slot)
);

create table if not exists public.prayer_audio (
  id uuid primary key default gen_random_uuid(),
  day_index int not null unique references public.prayer_days(day_index) on delete cascade,
  storage_path text not null,
  public_url text not null,
  uploaded_at timestamptz not null default now()
);

create table if not exists public.prayer_texts (
  id uuid primary key default gen_random_uuid(),
  day_index int not null unique references public.prayer_days(day_index) on delete cascade,
  body text not null default '',
  updated_at timestamptz not null default now()
);

create table if not exists public.prayer_completions (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.participants(id) on delete cascade,
  prayer_day_id uuid not null references public.prayer_days(id) on delete cascade,
  completed_at timestamptz not null default now(),
  collected_at timestamptz not null default now(),
  unique (participant_id, prayer_day_id)
);

create table if not exists public.teacher_completion_gems (
  id uuid primary key default gen_random_uuid(),
  sort_order int not null unique check (sort_order between 1 and 13),
  slug text not null unique,
  name_ko text not null,
  name_en text not null,
  description text not null,
  image_path text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.teacher_gem_assignments (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null unique references public.participants(id) on delete cascade,
  teacher_completion_gem_id uuid not null unique references public.teacher_completion_gems(id) on delete restrict,
  assigned_at timestamptz not null default now()
);

create or replace view public.participant_progress
with (security_invoker = on) as
select
  p.id as participant_id,
  p.type,
  p.display_name,
  p.source,
  p.household_key,
  count(pc.id)::int as completed_count,
  round((count(pc.id)::numeric / 20) * 100, 1) as completion_rate,
  max(pc.completed_at) as last_completed_at
from public.participants p
left join public.prayer_completions pc on pc.participant_id = p.id
group by p.id;

create or replace function public.assign_teacher_completion_gem(target_participant_id uuid)
returns public.teacher_gem_assignments
language plpgsql
security definer
set search_path = public
as $$
declare
  existing public.teacher_gem_assignments;
  chosen public.teacher_completion_gems;
  created public.teacher_gem_assignments;
begin
  select * into existing
  from public.teacher_gem_assignments
  where participant_id = target_participant_id;

  if found then
    return existing;
  end if;

  select gem.* into chosen
  from public.teacher_completion_gems gem
  where gem.active
    and not exists (
      select 1
      from public.teacher_gem_assignments assignment
      where assignment.teacher_completion_gem_id = gem.id
    )
  order by random()
  limit 1
  for update skip locked;

  if not found then
    raise exception 'No teacher completion gems remain';
  end if;

  insert into public.teacher_gem_assignments (participant_id, teacher_completion_gem_id)
  values (target_participant_id, chosen.id)
  returning * into created;

  return created;
end;
$$;

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
alter table public.teacher_completion_gems enable row level security;
alter table public.teacher_gem_assignments enable row level security;

-- v1 정책은 닫힌 행사 운영을 기준으로 읽기/기본 쓰기를 허용한다.
-- 실제 배포 전 관리자 쓰기와 Storage 업로드는 서버 함수 또는 관리자 Auth로 제한한다.
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
drop policy if exists public_read_prayer_audio on public.prayer_audio;
create policy public_read_prayer_audio on public.prayer_audio for select using (true);
drop policy if exists public_read_prayer_texts on public.prayer_texts;
create policy public_read_prayer_texts on public.prayer_texts for select using (true);
drop policy if exists public_read_teacher_gems on public.teacher_completion_gems;
create policy public_read_teacher_gems on public.teacher_completion_gems for select using (true);

drop policy if exists participant_insert on public.participants;
create policy participant_insert on public.participants for insert with check (true);
drop policy if exists participant_update_seen on public.participants;
create policy participant_update_seen on public.participants for update using (true) with check (true);
drop policy if exists participant_children_insert on public.participant_children;
create policy participant_children_insert on public.participant_children for insert with check (true);
drop policy if exists completion_insert on public.prayer_completions;
create policy completion_insert on public.prayer_completions for insert with check (true);
drop policy if exists completion_read on public.prayer_completions;
create policy completion_read on public.prayer_completions for select using (true);
drop policy if exists assignment_insert on public.teacher_gem_assignments;
create policy assignment_insert on public.teacher_gem_assignments for insert with check (true);
drop policy if exists assignment_read on public.teacher_gem_assignments;
create policy assignment_read on public.teacher_gem_assignments for select using (true);
drop policy if exists public_upsert_prayer_audio on public.prayer_audio;
create policy public_upsert_prayer_audio on public.prayer_audio for all using (true) with check (true);
drop policy if exists public_upsert_prayer_texts on public.prayer_texts;
create policy public_upsert_prayer_texts on public.prayer_texts for all using (true) with check (true);
