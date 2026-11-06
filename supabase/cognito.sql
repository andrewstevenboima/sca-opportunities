-- SCA Opportunities: sign-in through AWS Cognito
--
-- Student accounts move from Supabase Auth to the Cognito user pool the
-- Student Companion AI chat site uses, so one email and password works on
-- both sites. Supabase keeps the data (profiles, saved opportunities,
-- the Common Room, messages) and checks the Cognito token on every
-- request ("third-party auth"), so row level security works as before:
-- auth.uid() is the student's Cognito id.
--
-- Run this ONCE in the SQL Editor, after schema.sql and BEFORE the
-- Cognito ids are filled in js/supabase-client.js. Safe to re-run.
--
-- What it changes:
-- 1. New accounts no longer exist in auth.users, so every reference to a
--    student now points at public.profiles (id). ON UPDATE CASCADE lets
--    step 2 move all of a student's data in one statement.
-- 2. link_account(): the first time a student signs in with Cognito, their
--    data from before the move (same email, verified by Cognito) is moved
--    to their new id. Called by the site right after sign-in.

-- ---------------------------------------------------------------
-- 1. User references: auth.users -> public.profiles
-- ---------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select c.conname, c.conrelid::regclass as tbl
    from pg_constraint c
    where c.contype = 'f'
      and c.confrelid = 'auth.users'::regclass
      and c.connamespace = 'public'::regnamespace
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
  end loop;
end $$;

do $$
declare
  refs text[][] := array[
    ['bookmarks', 'user_id'],
    ['notifications', 'recipient_id'],
    ['notifications', 'actor_id'],
    ['companions', 'companion_id'],
    ['companions', 'companioned_id'],
    ['discussion_posts', 'user_id'],
    ['discussion_comments', 'user_id'],
    ['reactions', 'user_id'],
    ['messages', 'sender_id'],
    ['messages', 'recipient_id']
  ];
  i int;
  fk text;
begin
  for i in 1 .. array_length(refs, 1) loop
    fk := refs[i][1] || '_' || refs[i][2] || '_profile_fkey';
    if not exists (select 1 from pg_constraint where conname = fk) then
      -- NOT VALID: rows from before (if any lack a profile) are left as
      -- they are; every new row is checked.
      execute format(
        'alter table public.%I add constraint %I foreign key (%I) '
        'references public.profiles (id) on update cascade on delete cascade not valid',
        refs[i][1], fk, refs[i][2]
      );
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------
-- 2. Linking accounts from before the move
-- ---------------------------------------------------------------
-- Which old account went to which Cognito id. No policies: the site
-- cannot read or write it, only link_account() below can.
create table if not exists public.account_links (
  legacy_id uuid primary key,
  cognito_id uuid not null unique,
  email text not null,
  linked_at timestamptz not null default now()
);
alter table public.account_links enable row level security;

create or replace function public.link_account()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  claims jsonb := auth.jwt();
  new_id uuid := auth.uid();
  mail text := lower(nullif(trim(claims ->> 'email'), ''));
  old_id uuid;
begin
  -- Only a Cognito token with a verified email can claim old data.
  if new_id is null or mail is null or coalesce(claims ->> 'email_verified', 'false') <> 'true' then
    return null;
  end if;
  -- Already has a profile: already linked, or a new student.
  if exists (select 1 from public.profiles where id = new_id) then
    return new_id;
  end if;
  select u.id into old_id
  from auth.users u
  join public.profiles p on p.id = u.id
  where lower(u.email) = mail
    and u.id <> new_id
    and not exists (select 1 from public.account_links l where l.legacy_id = u.id)
  limit 1;
  if old_id is null then
    return null;
  end if;
  -- Moves the profile and, through ON UPDATE CASCADE, everything that
  -- points at it: saved opportunities, posts, comments, reactions,
  -- companions, messages and notifications.
  update public.profiles set id = new_id where id = old_id;
  insert into public.account_links (legacy_id, cognito_id, email) values (old_id, new_id, mail);
  return new_id;
end;
$$;

revoke all on function public.link_account() from public, anon;
grant execute on function public.link_account() to authenticated;
