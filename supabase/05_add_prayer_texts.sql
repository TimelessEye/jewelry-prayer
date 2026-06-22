create table if not exists public.prayer_texts (
  id uuid primary key default gen_random_uuid(),
  day_index int not null unique references public.prayer_days(day_index) on delete cascade,
  body text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.prayer_texts enable row level security;

drop policy if exists public_read_prayer_texts on public.prayer_texts;
create policy public_read_prayer_texts on public.prayer_texts for select using (true);

drop policy if exists public_upsert_prayer_texts on public.prayer_texts;
create policy public_upsert_prayer_texts on public.prayer_texts for all using (true) with check (true);
