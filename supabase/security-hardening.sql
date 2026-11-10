-- SCA Opportunities: security hardening (2026-11-10). Safe to re-run.
--
-- Found in a review of the live project:
--
-- 1. CRITICAL. public.public_profiles is a security-definer view (it runs as
--    its owner, so row level security on profiles does not apply), and the
--    anon and authenticated roles held INSERT/UPDATE/DELETE on it. Because
--    it is a simple one-table view, Postgres lets writes pass through it:
--    anyone holding the site's public key, signed in or not, could rename or
--    delete every student's profile, and deleting a profile cascades to
--    their posts, comments, messages and saved opportunities. Verified with
--    a rolled-back test: an anonymous UPDATE reached all 11 profiles.
--    The site never reads the view directly (it uses the three functions
--    below), so it loses every privilege.
--
-- 2. The profile-directory functions were executable by anon (Postgres
--    grants EXECUTE to PUBLIC by default), so signed-out visitors could list
--    every student's name, country and university. Signed-in only now,
--    matching the pages, which all require sign-in.
--
-- 3. Trigger and event-trigger functions are not API calls; nobody needs
--    EXECUTE on them through /rest/v1/rpc.
--
-- 4. The three "protect fields" trigger functions get a fixed search_path,
--    so a lookalike object in another schema can never be picked up.

-- 1
revoke all on public.public_profiles from anon, authenticated, public;

-- 2
revoke execute on function public.list_public_profiles() from public, anon;
revoke execute on function public.get_public_profile(uuid) from public, anon;
revoke execute on function public.get_public_profiles(uuid[]) from public, anon;
grant execute on function public.list_public_profiles() to authenticated;
grant execute on function public.get_public_profile(uuid) to authenticated;
grant execute on function public.get_public_profiles(uuid[]) to authenticated;

-- 3
revoke execute on function public.handle_new_user() from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_proc where proname = 'rls_auto_enable' and pronamespace = 'public'::regnamespace) then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end $$;

-- 4
alter function public.protect_post_fields() set search_path = public;
alter function public.protect_comment_fields() set search_path = public;
alter function public.protect_message_fields() set search_path = public;

-- 5. Profile photos must come from this project's own avatars bucket.
--    avatar_url is written by the student, and every page showing them
--    loads it, so an outside address would let someone log the IP address
--    of every student who views their posts. (All existing photos pass.)
--    If the project ref ever changes, update the address here.
alter table public.profiles drop constraint if exists profiles_avatar_url_check;
alter table public.profiles add constraint profiles_avatar_url_check check (
  avatar_url is null
  or avatar_url like 'https://qawsxrusvacdcdumzgsv.supabase.co/storage/v1/object/public/avatars/%'
);
alter table public.profiles drop constraint if exists profiles_year_of_study_check;
alter table public.profiles add constraint profiles_year_of_study_check check (
  year_of_study is null or char_length(year_of_study) <= 40
);
