-- "Mark as Service Done" dashboard action.
--
-- Client request: once a due service on the Dashboard is actually completed,
-- someone should be able to mark it done and have it drop off the dashboard
-- immediately, instead of waiting up to 90 days for it to age out of the
-- Past Due window. There is no completion concept anywhere in the schema
-- today, so this adds one.

-- ---------------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------------
-- service_done_by_name is denormalized alongside service_done_by_id for the
-- same reason filed_by_name/edited_by_name are (0021): engineers can only
-- read their own profiles row, and the FK is ON DELETE SET NULL, so without
-- the denormalized copy the attribution would evaporate if that user is
-- later removed.

alter table service_reports add column if not exists service_done_at timestamptz;
alter table service_reports add column if not exists service_done_by_id uuid;
alter table service_reports add column if not exists service_done_by_name text;

alter table service_reports drop constraint if exists service_reports_service_done_by_id_fkey;
alter table service_reports
add constraint service_reports_service_done_by_id_fkey
foreign key (service_done_by_id) references profiles(id) on delete set null;

-- ---------------------------------------------------------------------------
-- 2. The stamp — set by the database, never by the client
-- ---------------------------------------------------------------------------
-- Same reasoning as stamp_filer/stamp_editor (0021): the client only signals
-- intent (any non-null value for service_done_at), and this derives the real
-- timestamp and identity from auth.uid() so it can't be forged. The WHEN
-- guard (null -> non-null only) means it fires once and never refires if the
-- report is edited afterward.

create or replace function stamp_service_done() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.service_done_at := now();
  new.service_done_by_id := auth.uid();
  new.service_done_by_name := (
    select coalesce(nullif(trim(p.name), ''), p.phone)
    from profiles p
    where p.id = auth.uid()
  );
  return new;
end;
$$;

drop trigger if exists service_reports_stamp_service_done on service_reports;
create trigger service_reports_stamp_service_done
  before update on service_reports
  for each row
  when (old.service_done_at is null and new.service_done_at is not null)
  execute function stamp_service_done();

-- ---------------------------------------------------------------------------
-- 3. Narrow the edit-trail trigger from 0021 so marking a report done isn't
--    also recorded as a content edit (which would incorrectly bump
--    edit_count / edited_by_name in ReportView's edit trail). The
--    stamp_editor() function itself is unchanged — only the WHEN clause
--    moves from "any column changed" to an explicit list of content columns.
-- ---------------------------------------------------------------------------

drop trigger if exists service_reports_stamp_editor on service_reports;
create trigger service_reports_stamp_editor
  before update on service_reports
  for each row
  when (
    old.report_date is distinct from new.report_date or
    old.total_run_hours is distinct from new.total_run_hours or
    old.remarks is distinct from new.remarks or
    old.serviced_by is distinct from new.serviced_by or
    old.due_service_date is distinct from new.due_service_date
  )
  execute function stamp_editor();

-- No new RLS policy needed: service_reports_update_authenticated (0021)
-- already permits any authenticated user to update these rows.
