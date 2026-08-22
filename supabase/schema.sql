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

-- ---------------------------------------------------------------
-- public_profiles: a safe, public-readable projection of profiles
-- for the Common Room / member pages — name, photo, region and
-- university only. Sex, date of birth and email stay private on
-- the `profiles` table, which only its owner can ever read.
--
-- This works because views run with the privileges of the role
-- that created them (the SQL Editor's role, which bypasses RLS on
-- the underlying table), not the querying user's — the standard
-- Postgres/Supabase pattern for exposing a public slice of a
-- private table.
-- ---------------------------------------------------------------
create or replace view public.public_profiles as
select id, full_name, avatar_url, region, country, university, created_at
from public.profiles;

grant select on public.public_profiles to authenticated;

-- ---------------------------------------------------------------
-- companions: the "Companion" relationship (this platform's word
-- for follow). companion_id is the student doing the companioning,
-- companioned_id is the student being companioned. Companion
-- relationships are public — like most social platforms, anyone
-- signed in can see who companions whom, and the resulting counts.
-- ---------------------------------------------------------------
create table if not exists public.companions (
  companion_id uuid not null references auth.users (id) on delete cascade,
  companioned_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (companion_id, companioned_id),
  check (companion_id <> companioned_id)
);

alter table public.companions enable row level security;

drop policy if exists "companions_select_all" on public.companions;
create policy "companions_select_all" on public.companions
  for select using (auth.role() = 'authenticated');

drop policy if exists "companions_insert_own" on public.companions;
create policy "companions_insert_own" on public.companions
  for insert with check (auth.uid() = companion_id);

drop policy if exists "companions_delete_own" on public.companions;
create policy "companions_delete_own" on public.companions
  for delete using (auth.uid() = companion_id);

-- ---------------------------------------------------------------
-- discussion_posts / discussion_comments: The Common Room. Any
-- signed-in student can start a discussion or reply; posts and
-- comments are readable by any signed-in student, and editable
-- (delete-only, to keep this simple) only by their own author.
-- ---------------------------------------------------------------
create table if not exists public.discussion_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 150),
  body text not null check (char_length(body) between 1 and 5000),
  created_at timestamptz not null default now()
);

alter table public.discussion_posts enable row level security;

drop policy if exists "discussion_posts_select_all" on public.discussion_posts;
create policy "discussion_posts_select_all" on public.discussion_posts
  for select using (auth.role() = 'authenticated');

drop policy if exists "discussion_posts_insert_own" on public.discussion_posts;
create policy "discussion_posts_insert_own" on public.discussion_posts
  for insert with check (auth.uid() = user_id);

drop policy if exists "discussion_posts_delete_own" on public.discussion_posts;
create policy "discussion_posts_delete_own" on public.discussion_posts
  for delete using (auth.uid() = user_id);

create table if not exists public.discussion_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.discussion_posts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);

alter table public.discussion_comments enable row level security;

drop policy if exists "discussion_comments_select_all" on public.discussion_comments;
create policy "discussion_comments_select_all" on public.discussion_comments
  for select using (auth.role() = 'authenticated');

drop policy if exists "discussion_comments_insert_own" on public.discussion_comments;
create policy "discussion_comments_insert_own" on public.discussion_comments
  for insert with check (auth.uid() = user_id);

drop policy if exists "discussion_comments_delete_own" on public.discussion_comments;
create policy "discussion_comments_delete_own" on public.discussion_comments
  for delete using (auth.uid() = user_id);

create index if not exists discussion_comments_post_id_idx on public.discussion_comments (post_id);
