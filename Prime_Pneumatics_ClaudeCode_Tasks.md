# Prime Pneumatics — Service Module: Implementation Tasks
Source: Review Meeting 1 (July 6) + Review Meeting 2 / Follow-up (July 6)
Client: Akhil Thomas | Consolidated for single implementation pass (per client preference — avoid multi-round changes)

---

## 1. Service Entry Form — Field Changes

- [ ] **Move `Model Number` and `Assigned Engineer` fields from the top-level Customer section into the Service section.**
  - Reason: each customer typically has 5–6 machines; engineer/model must be selected per-service-entry, not per-customer.
- [ ] **Change `Assigned Engineer` / `Service by` field from a fixed dropdown to a type-in field with autocomplete.**
  - Must allow free-text entry even if no match is found (e.g., part-time engineers not in the system).
  - Autocomplete should suggest existing names as the user types, but should never block manual entry.
  - Field can be left blank at time of entry and filled in manually later — this is acceptable, not a blocker.
- [ ] **Remove `Totals`, `Units`, and `Rates` fields from the Service/Spares entry section.**
- [ ] **Remove the `Service Performed` field entirely.**
  - Reason: marking spares as "used" already implies service was performed; redundant field.
- [ ] **Enable direct PDF download from the Service entry** (currently only supports Print — add a distinct Download-as-PDF action/button).

---

## 2. Service Scheduling / Spares Tracking

- [ ] **Add `Hours-per-day` input per machine** (e.g., 12 or 24) — used to calculate time-to-next-service.
- [ ] **Add `Monthly off-days` input per machine** — factored into the run-hour/scheduling calculation.
- [ ] **Add 4 fixed spare-part items, each tracked independently with its own threshold** (not a single combined total):
  1. Air Filter
  2. Oil Filter
  3. Separator
  4. Oil
  - Each item needs its own "hours until due" threshold, independently configurable per item (client mentioned ~2,000 hrs recurring for some items — **confirm exact per-item threshold values with client before finalizing**, numbers were inconsistent in the recording).
  - When user selects an item, system should show/ask:
    - Hours until next replacement (remaining hours), OR
    - Hours-run-per-day, and calculate remaining time automatically

---

## 3. Service Report — Layout

- [ ] **Reorder report fields top to bottom as follows:**
  1. Date
  2. FAB #
  3. Total Run Hours
  4. **(then, grouped together below):** all spare items (Air Filter, Oil Filter, Separator, Oil) with per-item hours-until-next
  5. Remarks (grouped with items, not above)
  6. Model Number
  7. Assigned Engineer / Service by
  8. **Last field of all:** Service by / Engineer sign-off
  - Explicit client requirement: items, remarks, and engineer info should be grouped together at the bottom so the user doesn't have to scroll between top and bottom sections while filling the form.
- [ ] **Add `Sponsor` column** to the Service Report (indicates which party the machine/parts belong to).
- [ ] **Add per-item "Hours Until Next / Remaining Hours" display**, calculated from run hours and hours-per-day.
- [ ] **Enable PDF download for the Service Report** (not just print).

---

## 4. Report Data Freezing Logic (Important — Data Integrity)

- [ ] **"Remaining days/hours" fields must be dynamic only until the report is submitted/downloaded.**
  - Once a service report is finalized (submitted or downloaded as PDF), the "remaining days/hours" value at that moment must be **frozen/permanently recorded** — it should NOT continue to recalculate or count down after the fact.
  - This applies to both the in-app record and the exported PDF.

---

## 5. Search Functionality

- [ ] **Implement search by Customer Name or FAB # to retrieve the associated machine/model's Service Report.**
  - Should auto-populate/retrieve the correct report without manual lookup.

---

## 6. Customer Records

- [ ] **Use Company Name as the primary customer identifier** (instead of individual contact person's name).
  - Reason: individual contact names (managers, maintenance staff, purchasing dept.) change or aren't remembered; company name is the consistent identifier.

---

## 7. Engineer Access

- [ ] **Verify/support "Add to Home Screen" for the engineer-facing link** so login persists and engineers don't need to re-enter ID/password each time.
  - Requires a demo/walkthrough for Akhil before rollout to engineers.

---

## 8. Reference / Follow-up Items (non-code, but tracked)

- [ ] Send Akhil the existing **manual (paper) service report template** for side-by-side review against the new digital version.
- [ ] Confirm exact **spare threshold values** (Air Filter, Oil Filter, Separator, Oil hours) with client before finalizing thresholds in code.

---

## Notes for Implementation
- Client has explicitly asked for **all changes to be delivered together in a single pass** rather than iterative rounds — avoid partial/staged delivery where possible.
- Several numeric values (thresholds, hours) were unclear/inconsistent in the source recordings due to audio quality — flagged inline above; confirm before hardcoding.
