alter table public.prayer_images
  drop constraint if exists prayer_images_slot_check;

alter table public.prayer_images
  add constraint prayer_images_slot_check check (slot in (1, 2, 3));
