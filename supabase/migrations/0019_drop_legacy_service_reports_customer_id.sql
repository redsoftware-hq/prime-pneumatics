-- Customer delete still failed after 0017 (which fixed
-- service_reports.service_id -> services cascade), but with a different
-- constraint: "services_reports_customer_id" on service_reports.
--
-- Turns out service_reports still has an old customer_id column, direct
-- FK to customers, left over from before the service_id restructure.
-- 0001_service_restructure.sql intended to drop it (see its step 6), but
-- that drop was conditional on every row already having a non-null
-- service_id, which wasn't true at the time (1 row still doesn't have
-- one), so it silently never ran. This legacy FK has no cascade rule and
-- blocks customer deletes independently of the service_id path.
--
-- Confirmed dead: no app code reads service_reports.customer_id anymore
-- (fully superseded by service_id), and every row that has a service_id
-- agrees with what customer_id already said. Safe to drop outright
-- rather than just adding cascade, since this column was never meant to
-- survive the 2026-07 restructure.

alter table service_reports drop column if exists customer_id;
