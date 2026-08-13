import { SparePartPicker } from './SparePartPicker'
import { toISODate, toDisplayDate } from '../utils/dateEngine'
import { calcRemaining } from '../utils/machineParts'
import { normalizePart, partDueDate, type TrackedPart } from '../utils/reportSnapshot'

type SparePart = { id: string; code: string; name: string; size: string | null }

export type TrackedPartField = 'qty' | 'hours_per_day' | 'remaining_hrs' | 'maintenance_days'

// Shared by File Report and Edit Report so the two screens can't drift apart —
// both the inputs and the remaining-hours preview under each part.
export function ReportPartsEditor({
  spareParts, trackedParts, reportDate, totalRunHours, onAdd, onRemove, onUpdate,
}: {
  spareParts: SparePart[]
  trackedParts: TrackedPart[]
  reportDate: string
  totalRunHours: string
  onAdd: (part: SparePart) => void
  onRemove: (sparePartId: string) => void
  onUpdate: (sparePartId: string, field: TrackedPartField, value: string) => void
}) {
  const hoursRun = parseFloat(totalRunHours) || 0

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
      <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Spare Item Hours</h3>
      <SparePartPicker
        parts={spareParts}
        excludeIds={trackedParts.map(tp => tp.spare_part_id)}
        onSelect={onAdd}
        placeholder="Search spare parts by code or name..."
      />

      {trackedParts.length === 0 ? (
        <p className="text-xs text-gray-400">No spare parts added for this report yet.</p>
      ) : (
        trackedParts.map(tp => {
          const { state } = normalizePart(tp, hoursRun)
          const { remainingHours, days } = calcRemaining(state)
          const overdue = remainingHours <= 0
          return (
            <div key={tp.spare_part_id} className="border-t border-gray-100 pt-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-gray-800">
                  <span className="font-mono text-gray-400 text-xs mr-1">{tp.code}</span>{tp.name}
                  {tp.size && <span className="text-gray-400 text-xs ml-1">({tp.size})</span>}
                </p>
                <button type="button" onClick={() => onRemove(tp.spare_part_id)}
                  className="text-red-400 hover:text-red-600 text-xs">×</button>
              </div>
              <div className="grid grid-cols-3 gap-2 mb-2">
                <PartField label="Qty" min="1" value={tp.qty}
                  onChange={v => onUpdate(tp.spare_part_id, 'qty', v)} />
                <PartField label="Remaining Hrs" min="0" value={tp.remaining_hrs}
                  onChange={v => onUpdate(tp.spare_part_id, 'remaining_hrs', v)} />
                <PartField label="Hrs/Day" min="1" value={tp.hours_per_day}
                  onChange={v => onUpdate(tp.spare_part_id, 'hours_per_day', v)} />
              </div>
              <div className="mb-2">
                <PartField label="Maintenance Days" min="0" value={tp.maintenance_days}
                  onChange={v => onUpdate(tp.spare_part_id, 'maintenance_days', v)} />
                <p className="text-xs text-gray-400 mt-1">Planned off days for this part (e.g. plant shutdown), added on top of its calculated due date.</p>
              </div>
              <p className={`text-xs ${overdue ? 'text-red-600 font-medium' : 'text-blue-600'}`}>
                {overdue
                  ? `Overdue by ${Math.abs(remainingHours)} hrs`
                  : `${remainingHours} hrs remaining · ~${Math.ceil(days)} days · due ${toDisplayDate(toISODate(partDueDate(tp, hoursRun, reportDate)))}`}
              </p>
            </div>
          )
        })
      )}
    </div>
  )
}

function PartField({
  label, min, value, onChange,
}: { label: string; min: string; value: string; onChange: (value: string) => void }) {
  return (
    <div>
      <label className="block text-xs text-gray-500 mb-1">{label}</label>
      <input type="number" min={min} value={value} onChange={e => onChange(e.target.value)}
        className="w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
    </div>
  )
}
