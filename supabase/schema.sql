-- SCA Opportunities — Supabase schema
-- Safe to re-run: run this in your Supabase project's SQL Editor
-- (Project → SQL Editor → New query → paste → Run) any time the
-- schema changes — every statement below is idempotent.

-- ---------------------------------------------------------------
-- profiles: one row per student account, created automatically
-- on signup by the trigger below (data comes from auth signup
-- metadata set in js/supabase-client.js signUp()), and editable
-- afterwards from account.html (sex, date of birth, avatar).
-- ---------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  region text check (region in ('East Africa', 'West Africa')),
  country text not null,
  year_of_study text,
  university text,
  sex text check (sex in ('Female', 'Male', 'Prefer not to say')),
  date_of_birth date,
  avatar_url text,
  created_at timestamptz not null default now()
);

alter table public.profiles add column if not exists sex text check (sex in ('Female', 'Male', 'Prefer not to say'));
alter table public.profiles add column if not exists date_of_birth date;
alter table public.profiles add column if not exists avatar_url text;

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);

-- ---------------------------------------------------------------
-- bookmarks: saved opportunities. opportunity_id matches the
-- `id` column of the Google Sheet / opportunities.json row.
-- Title/org/link are copied in at save time so a student's saved
-- list still renders correctly even if a listing is later removed
-- from the Sheet.
-- ---------------------------------------------------------------
create table if not exists public.bookmarks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  opportunity_id text not null,
  opportunity_title text,
  opportunity_org text,
  opportunity_apply_link text,
  created_at timestamptz not null default now(),
  unique (user_id, opportunity_id)
);

alter table public.bookmarks enable row level security;

drop policy if exists "bookmarks_select_own" on public.bookmarks;
create policy "bookmarks_select_own" on public.bookmarks
  for select using (auth.uid() = user_id);

drop policy if exists "bookmarks_insert_own" on public.bookmarks;
create policy "bookmarks_insert_own" on public.bookmarks
  for insert with check (auth.uid() = user_id);

drop policy if exists "bookmarks_delete_own" on public.bookmarks;
create policy "bookmarks_delete_own" on public.bookmarks
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------
-- avatars: Storage bucket for profile photos. Public read (so
-- <img> tags can just load the URL directly), but a student can
-- only write inside their own "<user_id>/…" folder.
-- ---------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "avatars_public_read" on storage.objects;
create policy "avatars_public_read" on storage.objects
  for select using (bucket_id = 'avatars');

drop policy if exists "avatars_insert_own" on storage.objects;
create policy "avatars_insert_own" on storage.objects
  for insert with check (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists "avatars_update_own" on storage.objects;
create policy "avatars_update_own" on storage.objects
  for update using (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists "avatars_delete_own" on storage.objects;
create policy "avatars_delete_own" on storage.objects
  for delete using (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);

-- ---------------------------------------------------------------
-- Auto-create a profile row right after signup, from the metadata
-- passed into supabase.auth.signUp({ options: { data: {...} } }).
-- ---------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, region, country, year_of_study, university)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'region',
    new.raw_user_meta_data ->> 'country',
    new.raw_user_meta_data ->> 'year_of_study',
    new.raw_user_meta_data ->> 'university'
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
