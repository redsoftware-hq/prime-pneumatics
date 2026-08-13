-- Engineers can now edit machines (services), with the same edit trail that
-- 0021 added to service reports.
--
-- Fixes a silent data-loss bug, not just a permissions preference. 0001
-- restricted `services` UPDATE to admins, but ReportNew.tsx updates the machine
-- row whenever an engineer files a report against an existing FAB number
-- (carrying over a corrected Model Number / Sponsor). Under RLS a forbidden
-- UPDATE isn't an error — it reports zero rows matched, indistinguishable from
-- "no such row" — so supabase-js returned success, the app's `if (updateError)`
-- branch never fired, and the engineer's correction was discarded with no
-- warning shown. The report itself saved fine, which is why this went unnoticed.
--
-- ReportNew.tsx:326 has meanwhile been telling engineers outright that
-- "changing it here updates the machine's FAB Number too" — a promise the
-- database has been quietly breaking. This makes the database match the promise.
--
-- FAB Number is deliberately editable by engineers, not owner-only. It is the
-- machine's unique identity and report matching keys off it, so this is the
-- riskier half of the change — but the engineer standing in front of the
-- machine is the person best placed to know the right number, and the trail
-- below makes any bad rename attributable rather than anonymous.

-- ---------------------------------------------------------------------------
-- 1. Open UPDATE to engineers
-- ---------------------------------------------------------------------------
-- Matches how 0012 (customers) and 0015 (spare parts) already opened up their
-- writes to engineers; machines were the odd one left behind.

drop policy if exists "services_update_admin" on services;
drop policy if exists "services_update_authenticated" on services;
create policy "services_update_authenticated" on services
  for update to authenticated using (true) with check (true);

-- ---------------------------------------------------------------------------
-- 2. Same edit-trail columns as service_reports (0021)
-- ---------------------------------------------------------------------------
-- services already records who created it (created_by, 0001), so with these
-- the Machine screen can show both ends: added by X, last edited by Y.

alter table services add column if not exists edited_by_id uuid;
alter table services add column if not exists edited_by_name text;
alter table services add column if not exists edited_at timestamptz;
alter table services add column if not exists edit_count integer not null default 0;

alter table services drop constraint if exists services_edited_by_id_fkey;
alter table services
  add constraint services_edited_by_id_fkey
  foreign key (edited_by_id) references profiles(id) on delete set null;

-- Reuses 0021's function unchanged — same tamper-proof auth.uid() stamp.
drop trigger if exists services_stamp_editor on services;
create trigger services_stamp_editor
  before update on services
  for each row
  when (old.* is distinct from new.*)
  execute function stamp_editor();

-- ---------------------------------------------------------------------------
-- 2b. Record who *added* a machine, not just who edited it
-- ---------------------------------------------------------------------------
-- services.created_by has existed since 0001 but no application code has ever
-- written it — only the legacy backfill did, so every machine added since is
-- null. Half a trail ("added by ⟨blank⟩, edited by Akhil") is worse than none,
-- and the fix is the same stamp pattern, so it's done here rather than left as
-- a dangling column.
--
-- Existing rows stay null: that information was never captured and can't be
-- reconstructed. The Machine screen omits the "Added by" half when it is.

alter table services add column if not exists created_by_name text;

update services s
set created_by_name = coalesce(nullif(trim(p.name), ''), p.phone)
from profiles p
where p.id = s.created_by
  and s.created_by_name is null;

create or replace function stamp_creator() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.created_by := auth.uid();
  new.created_by_name := (
    select coalesce(nullif(trim(p.name), ''), p.phone)
    from profiles p
    where p.id = auth.uid()
  );
  return new;
end;
$$;

drop trigger if exists services_stamp_creator on services;
create trigger services_stamp_creator
  before insert on services
  for each row
  execute function stamp_creator();

-- ---------------------------------------------------------------------------
-- 3. Let the database own updated_at
-- ---------------------------------------------------------------------------
-- services.updated_at was set by hand at three call sites (ServiceEdit.tsx and
-- two places in ReportNew.tsx) — the same forget-prone pattern the editor stamp
-- exists to avoid, and one that any new write path would have had to remember.
-- Those manual assignments are removed in the accompanying app change.
--
-- Separate from stamp_editor() because service_reports has no updated_at
-- column, so folding this into the shared function would break that trigger.

create or replace function stamp_updated_at() returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- The WHEN guard matters here for a non-obvious reason. BEFORE triggers on the
-- same table and event fire in alphabetical name order, and each one's WHEN is
-- evaluated against NEW as left by the triggers before it. Without this guard,
-- any future trigger sorting ahead of services_stamp_editor would set
-- updated_at first, making `old.* is distinct from new.*` true on every update
-- and silently inflating edit_count on saves that changed nothing. Guarding
-- both triggers identically removes the dependence on trigger naming.
drop trigger if exists services_stamp_updated_at on services;
create trigger services_stamp_updated_at
  before update on services
  for each row
  when (old.* is distinct from new.*)
  execute function stamp_updated_at();
