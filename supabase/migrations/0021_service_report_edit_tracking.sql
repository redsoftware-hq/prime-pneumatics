-- Filed service reports become editable by BOTH engineer and owner logins,
-- with the database recording who made each edit.
--
-- Client request (2026-08-13, Akhil): engineers routinely spot a wrong run-hour
-- reading or remark after filing, and today the only remedy is an admin
-- deleting the report and re-filing it — which burns a report number and loses
-- the original filing attribution.
--
-- Two deliberate reversals of earlier decisions in here:
--
--   1. 0001 gave service_report_parts select+insert only, with the comment
--      "deliberately no update policy: report snapshots are frozen once
--      written". Editing a report necessarily rewrites that snapshot, so this
--      adds update+delete. The snapshot is still frozen in the sense that
--      matters — it never silently recalculates over time — it just isn't
--      immutable anymore. ReportEdit.tsx replaces the rows wholesale
--      (delete + re-insert) rather than diffing them.
--
--   2. service_reports gains its first UPDATE policy. Note the pre-0001 base
--      schema was set up directly in Supabase and isn't in this folder, so if
--      an UPDATE policy already exists there under a name I can't see, it will
--      coexist with this one — Postgres ORs permissive policies together, so
--      that's additive, not a conflict.
--
-- Verified against the live database on 2026-08-13 via the REST API before
-- writing: none of the four columns below exist yet, service_reports has no
-- updated_at column (unlike services), and profiles exposes name/phone.

-- ---------------------------------------------------------------------------
-- 1. Edit-trail columns
-- ---------------------------------------------------------------------------
-- edited_by_name is denormalized alongside edited_by_id on purpose, mirroring
-- how serviced_by already stores a plain name. Two reasons: engineers can only
-- read their own profiles row (every non-admin profiles query in the app is
-- self-scoped), so a client-side join would render blank for them; and the FK
-- below is ON DELETE SET NULL to match 0002, so without the denormalized copy
-- the entire trail would evaporate the moment an engineer is removed.

alter table service_reports add column if not exists edited_by_id uuid;
alter table service_reports add column if not exists edited_by_name text;
alter table service_reports add column if not exists edited_at timestamptz;
alter table service_reports add column if not exists edit_count integer not null default 0;

alter table service_reports drop constraint if exists service_reports_edited_by_id_fkey;
alter table service_reports
add constraint service_reports_edited_by_id_fkey
foreign key (edited_by_id) references profiles(id) on delete set null;

-- The matching half for the original filing. filed_by_id already exists, but
-- as a bare uuid it displays as nothing — so "edited by Akhil" would appear
-- next to a blank filer, which reads worse than no trail at all. Same
-- denormalization, same reasoning as above.
alter table service_reports add column if not exists filed_by_name text;

-- Backfill from existing filed_by_id. This runs as the migration's role, not
-- through PostgREST, so profiles RLS doesn't apply here.
update service_reports sr
set filed_by_name = coalesce(nullif(trim(p.name), ''), p.phone)
from profiles p
where p.id = sr.filed_by_id
  and sr.filed_by_name is null;

-- ---------------------------------------------------------------------------
-- 2. The stamp — set by the database, never by the client
-- ---------------------------------------------------------------------------
-- This is the whole point of the feature: "accurately record who edited the
-- report". If the browser sent edited_by_id, any authenticated user could post
-- someone else's id, and any future code path that updates a report could
-- simply forget to set it. Deriving it from auth.uid() in a trigger makes both
-- impossible.
--
-- SECURITY DEFINER: the function only ever reads the *caller's own* profiles
-- row (p.id = auth.uid()), which self-scoped RLS already permits — so this
-- grants no extra reach today. It's here so that tightening profiles RLS later
-- can't silently degrade edited_by_name to null. search_path is pinned, which
-- is required for definer functions.
--
-- Kept generic (no service_reports-specific logic) so 0022 can hang the same
-- function off `services`.

create or replace function stamp_editor() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.edited_by_id := auth.uid();
  new.edited_by_name := (
    select coalesce(nullif(trim(p.name), ''), p.phone)
    from profiles p
    where p.id = auth.uid()
  );
  new.edited_at := now();
  new.edit_count := coalesce(old.edit_count, 0) + 1;
  return new;
end;
$$;

-- Same treatment for the filing itself. ReportNew.tsx previously sent
-- filed_by_id from the browser, which was both forgeable and skippable; this
-- takes that responsibility off the client entirely.
create or replace function stamp_filer() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.filed_by_id := auth.uid();
  new.filed_by_name := (
    select coalesce(nullif(trim(p.name), ''), p.phone)
    from profiles p
    where p.id = auth.uid()
  );
  return new;
end;
$$;

drop trigger if exists service_reports_stamp_filer on service_reports;
create trigger service_reports_stamp_filer
  before insert on service_reports
  for each row
  execute function stamp_filer();

-- WHEN (old.* is distinct from new.*) keeps a save that changed nothing from
-- inflating edit_count or overwriting a meaningful previous editor. It is
-- evaluated before the function body runs, so the columns the function itself
-- touches don't feed back into the comparison.
drop trigger if exists service_reports_stamp_editor on service_reports;
create trigger service_reports_stamp_editor
  before update on service_reports
  for each row
  when (old.* is distinct from new.*)
  execute function stamp_editor();

-- ---------------------------------------------------------------------------
-- 3. Policies
-- ---------------------------------------------------------------------------
-- Open to any authenticated user, not admin-gated: the client asked for the
-- edit option on both engineer and owner logins. Accountability comes from the
-- trail above rather than from restricting who may edit.

alter table service_reports enable row level security;

drop policy if exists "service_reports_update_authenticated" on service_reports;
create policy "service_reports_update_authenticated" on service_reports
  for update to authenticated using (true) with check (true);

-- Replacing a report's frozen part snapshot needs both verbs: ReportEdit
-- deletes the report's existing rows and re-inserts the recalculated set.
-- (insert is already granted by srp_insert_authenticated in 0001.)
drop policy if exists "srp_update_authenticated" on service_report_parts;
create policy "srp_update_authenticated" on service_report_parts
  for update to authenticated using (true) with check (true);

drop policy if exists "srp_delete_authenticated" on service_report_parts;
create policy "srp_delete_authenticated" on service_report_parts
  for delete to authenticated using (true);
