-- =============================================================
-- Course progress for the career site's LMS (courses.html).
--
-- Courses are played from the SCAI-LMS GitHub Pages site; a small
-- tracker inside each course (SCAI-LMS sca-tracker.js) tells the
-- player which lesson is open and, when a quiz ends, the score. The
-- player saves that here for a signed-in student, so they can pick up
-- where they left off and see what they finished.
--
-- A student reads and writes only their own rows. Totals for reports
-- (course_progress_summary) are only callable with the service role,
-- i.e. from the backend, never from a browser.
--
-- Safe to run more than once.
-- =============================================================

create table if not exists public.course_progress (
  user_id uuid not null references auth.users (id) on delete cascade,
  course_slug text not null check (course_slug ~ '^[a-z0-9][a-z0-9-]{0,80}$'),
  lessons_seen text[] not null default '{}' check (cardinality(lessons_seen) <= 200),
  lessons_total int not null default 0 check (lessons_total between 0 and 200),
  last_lesson text check (last_lesson is null or last_lesson ~ '^[A-Za-z0-9_-]{1,64}$'),
  quiz_score int check (quiz_score is null or quiz_score between 0 and 100),
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (user_id, course_slug)
);

alter table public.course_progress enable row level security;

drop policy if exists "course_progress_select_own" on public.course_progress;
create policy "course_progress_select_own" on public.course_progress
  for select using (auth.uid() = user_id);

drop policy if exists "course_progress_insert_own" on public.course_progress;
create policy "course_progress_insert_own" on public.course_progress
  for insert with check (auth.uid() = user_id);

drop policy if exists "course_progress_update_own" on public.course_progress;
create policy "course_progress_update_own" on public.course_progress
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Totals per course, optionally for one university's email domain
-- (e.g. 'alustudent.com'). Counts only, never who.
create or replace function public.course_progress_summary(email_domain text default null)
returns table (
  course_slug text,
  learners bigint,
  completed bigint,
  avg_progress numeric,
  avg_quiz_score numeric
)
language sql
security definer
set search_path = public
as $$
  select
    p.course_slug,
    count(*) as learners,
    count(p.completed_at) as completed,
    round(avg(case when p.lessons_total > 0
                   then least(1.0, cardinality(p.lessons_seen)::numeric / p.lessons_total)
                   else 0 end) * 100, 0) as avg_progress,
    round(avg(p.quiz_score), 0) as avg_quiz_score
  from public.course_progress p
  join auth.users u on u.id = p.user_id
  where email_domain is null
     or lower(split_part(u.email, '@', 2)) = lower(email_domain)
     or lower(split_part(u.email, '@', 2)) like '%.' || lower(email_domain)
  group by p.course_slug
  order by learners desc;
$$;

revoke all on function public.course_progress_summary(text) from public, anon, authenticated;
grant execute on function public.course_progress_summary(text) to service_role;
