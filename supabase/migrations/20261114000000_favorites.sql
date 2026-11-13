-- Starred foods become a synced collection, so favourites survive sign-out
-- and appear on every device.
alter table public.records drop constraint if exists records_collection_check;
alter table public.records add constraint records_collection_check check (
  collection in ('foodEntries', 'customFoods', 'savedMeals', 'activities', 'water', 'weights', 'sleep', 'fasting', 'favorites')
);
