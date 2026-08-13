import { toISODate } from './dateEngine'
import { calcRemaining, addDaysToDate, type PartState } from './machineParts'

// The spare-part rows as the form holds them — every field a string, because
// they come straight from text inputs and may be mid-typing or empty.
export type TrackedPart = {
  spare_part_id: string
  code: string
  name: string
  size: string | null
  qty: string
  hours_per_day: string
  remaining_hrs: string
  maintenance_days: string
}

// One row of a report's frozen snapshot, shaped for service_report_parts.
export type SnapshotRow = {
  spare_part_id: string
  qty: number
  hours_run: number
  next_hours: number
  hours_per_day: number
  remaining_hours: number
  due_date: string
  maintenance_days: number
}

// Single definition of how the loose form strings become real numbers. Every
// caller goes through this — filing, editing, and the live "X hrs remaining"
// preview under each part — so the figure an engineer reads on screen is
// arithmetically the same one that gets frozen into the report.
export function normalizePart(tp: TrackedPart, hoursRun: number) {
  const remaining = Math.max(0, parseFloat(tp.remaining_hrs) || 0)
  const state: PartState = {
    hours_run: hoursRun,
    next_hours: hoursRun + remaining,
    hours_per_day: Math.max(1, parseInt(tp.hours_per_day) || 24),
  }
  return {
    state,
    qty: Math.max(1, parseInt(tp.qty) || 1),
    offDays: Math.max(0, parseInt(tp.maintenance_days) || 0),
  }
}

// Due date for one part: its remaining hours converted to calendar days at its
// own run rate, plus any planned off days, counted from the report date.
export function partDueDate(tp: TrackedPart, hoursRun: number, reportDate: string): Date {
  const { state, offDays } = normalizePart(tp, hoursRun)
  const { days } = calcRemaining(state)
  return addDaysToDate(new Date(reportDate), Math.max(0, days) + offDays)
}

// Freezes the whole part list at this moment. earliestDue is the soonest due
// date across all parts and becomes the report's due_service_date — the machine
// needs attention as soon as its first consumable runs out, not its last.
export function buildSnapshot(
  trackedParts: TrackedPart[],
  hoursRun: number,
  reportDate: string,
): { rows: SnapshotRow[]; earliestDue: string | null } {
  const rows = trackedParts.map<SnapshotRow>(tp => {
    const { state, qty, offDays } = normalizePart(tp, hoursRun)
    const { remainingHours } = calcRemaining(state)
    return {
      spare_part_id: tp.spare_part_id,
      qty,
      hours_run: state.hours_run,
      next_hours: state.next_hours,
      hours_per_day: state.hours_per_day,
      remaining_hours: remainingHours,
      due_date: toISODate(partDueDate(tp, hoursRun, reportDate)),
      maintenance_days: offDays,
    }
  })

  // due_date is ISO (YYYY-MM-DD), so lexical order is chronological order.
  const earliestDue = rows.reduce<string | null>(
    (soonest, r) => (soonest === null || r.due_date < soonest ? r.due_date : soonest),
    null,
  )

  return { rows, earliestDue }
}

// The machine's live carry-forward state, shaped for service_machine_parts.
// Unlike the snapshot above this is not frozen — it's what the Machine screen
// counts down from until the next report is filed.
export function buildMachineState(trackedParts: TrackedPart[], serviceId: string, hoursRun: number) {
  const now = new Date().toISOString()
  return trackedParts.map(tp => {
    const { state } = normalizePart(tp, hoursRun)
    return {
      service_id: serviceId,
      spare_part_id: tp.spare_part_id,
      hours_run: state.hours_run,
      next_hours: state.next_hours,
      hours_per_day: state.hours_per_day,
      updated_at: now,
    }
  })
}
