import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { Layout } from '../../components/Layout'
import { SuggestInput } from '../../components/SuggestInput'
import { ReportPartsEditor, type TrackedPartField } from '../../components/ReportPartsEditor'
import { useEngineerSuggestions } from '../../hooks/useEngineerSuggestions'
import { srNum } from '../../utils/reportNumber'
import { buildSnapshot, buildMachineState, type TrackedPart } from '../../utils/reportSnapshot'

type SparePart = { id: string; code: string; name: string; size: string | null }

type LoadedReport = {
  id: string
  report_number: number | null
  service_id: string
  report_date: string
  total_run_hours: number
  remarks: string
  serviced_by: string | null
  service: { fab_number: string; model_number: string | null } | null
}

type LoadedPart = {
  spare_part_id: string
  qty: number
  hours_run: number
  next_hours: number
  hours_per_day: number
  maintenance_days: number
  spare_part: { code: string; name: string; size: string | null } | null
}

export function ReportEdit() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const engineerSuggestions = useEngineerSuggestions()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [report, setReport] = useState<LoadedReport | null>(null)
  const [spareParts, setSpareParts] = useState<SparePart[]>([])
  const [trackedParts, setTrackedParts] = useState<TrackedPart[]>([])

  const [reportDate, setReportDate] = useState('')
  const [totalRunHours, setTotalRunHours] = useState('')
  const [remarks, setRemarks] = useState('')
  const [servicedBy, setServicedBy] = useState('')

  useEffect(() => {
    async function load() {
      const [{ data: rep }, { data: partRows }, { data: spares }] = await Promise.all([
        supabase
          .from('service_reports')
          .select('id, report_number, service_id, report_date, total_run_hours, remarks, serviced_by, service:services(fab_number, model_number)')
          .eq('id', id)
          .single(),
        supabase
          .from('service_report_parts')
          .select('spare_part_id, qty, hours_run, next_hours, hours_per_day, maintenance_days, spare_part:spare_parts(code, name, size)')
          .eq('service_report_id', id),
        supabase.from('spare_parts').select('id, code, name, size').order('code'),
      ])

      if (rep) {
        const r = rep as unknown as LoadedReport
        setReport(r)
        setReportDate(r.report_date)
        setTotalRunHours(String(r.total_run_hours ?? ''))
        setRemarks(r.remarks ?? '')
        setServicedBy(r.serviced_by ?? '')
      }

      if (partRows) {
        // The stored snapshot holds absolute hours (hours_run / next_hours),
        // but the form works in "remaining hours" — the same figure the
        // engineer originally typed. Invert it back so editing starts from
        // what was entered rather than from derived numbers.
        setTrackedParts((partRows as unknown as LoadedPart[]).map(p => ({
          spare_part_id: p.spare_part_id,
          code: p.spare_part?.code ?? '',
          name: p.spare_part?.name ?? 'Unknown part',
          size: p.spare_part?.size ?? null,
          qty: String(p.qty ?? 1),
          hours_per_day: String(p.hours_per_day ?? 24),
          remaining_hrs: String(Math.max(0, (p.next_hours ?? 0) - (p.hours_run ?? 0))),
          maintenance_days: String(p.maintenance_days ?? 0),
        })))
      }

      if (spares) setSpareParts(spares)
      setLoading(false)
    }
    load()
  }, [id])

  function addTrackedPart(part: SparePart) {
    if (trackedParts.some(tp => tp.spare_part_id === part.id)) return
    setTrackedParts(prev => [...prev, { spare_part_id: part.id, code: part.code, name: part.name, size: part.size, qty: '1', hours_per_day: '24', remaining_hrs: '0', maintenance_days: '0' }])
  }

  function removeTrackedPart(spare_part_id: string) {
    setTrackedParts(prev => prev.filter(tp => tp.spare_part_id !== spare_part_id))
  }

  function updateTrackedPart(spare_part_id: string, field: TrackedPartField, value: string) {
    setTrackedParts(prev => prev.map(tp => tp.spare_part_id === spare_part_id ? { ...tp, [field]: value } : tp))
  }

  // Editing an old report must not clobber the machine's live spare-part
  // counters — those reflect the most recent visit. Only the latest report for
  // this machine is allowed to write them back.
  async function isLatestReport(serviceId: string): Promise<boolean> {
    if (!report) return false
    const { data } = await supabase
      .from('service_reports')
      .select('id, report_date, report_number')
      .eq('service_id', serviceId)
      .neq('id', report.id)
      .gte('report_date', reportDate)
      .order('report_date', { ascending: false })

    if (!data || data.length === 0) return true
    // Same-day reports tie-break on report number, which always increases.
    return !data.some(other =>
      other.report_date > reportDate ||
      (other.report_date === reportDate && (other.report_number ?? 0) > (report.report_number ?? 0))
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!report || !remarks.trim() || !servicedBy.trim()) return
    setError('')
    setSaving(true)

    const hoursRun = parseFloat(totalRunHours) || 0
    const { rows: snapshotRows, earliestDue } = buildSnapshot(trackedParts, hoursRun, reportDate)

    // edited_by_id / edited_at / edit_count are deliberately NOT sent here —
    // a BEFORE UPDATE trigger stamps them from auth.uid() (migration 0021), so
    // the attribution can't be forged by the client or forgotten by this code.
    const { error: reportError } = await supabase
      .from('service_reports')
      .update({
        report_date: reportDate,
        total_run_hours: hoursRun,
        remarks: remarks.trim(),
        serviced_by: servicedBy.trim(),
        due_service_date: earliestDue,
      })
      .eq('id', report.id)

    if (reportError) {
      setError('Failed to save changes. Please try again.')
      setSaving(false)
      return
    }

    // Replace the frozen snapshot wholesale rather than diffing it — parts can
    // be added and removed, and the whole set is recalculated from the same
    // inputs anyway.
    const { error: deleteError } = await supabase
      .from('service_report_parts')
      .delete()
      .eq('service_report_id', report.id)

    if (deleteError) {
      setError('Report saved, but its spare part rows could not be updated.')
      setSaving(false)
      return
    }

    if (snapshotRows.length > 0) {
      const { error: partsError } = await supabase.from('service_report_parts').insert(
        snapshotRows.map(r => ({ ...r, service_report_id: report.id }))
      )
      if (partsError) {
        setError('Report saved, but its spare part rows could not be updated.')
        setSaving(false)
        return
      }

      if (await isLatestReport(report.service_id)) {
        await supabase.from('service_machine_parts').upsert(
          buildMachineState(trackedParts, report.service_id, hoursRun),
          { onConflict: 'service_id,spare_part_id' }
        )
      }
    }

    navigate(`/reports/${report.id}`)
  }

  if (loading) return <Layout><p className="text-gray-400 text-sm">Loading...</p></Layout>
  if (!report) return <Layout><p className="text-red-500 text-sm">Report not found.</p></Layout>

  return (
    <Layout>
      <div className="max-w-xl">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => navigate(`/reports/${report.id}`)} className="text-gray-400 hover:text-gray-600">← Back</button>
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Edit Service Report</h2>
            <p className="text-sm text-gray-500 font-mono">
              {report.report_number ? srNum(report.report_number) : ''}
              {report.service ? ` · ${report.service.fab_number}` : ''}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Report Date</label>
              <input type="date" value={reportDate} onChange={e => setReportDate(e.target.value)} required
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Total Run Hours *</label>
              <input type="number" min="0" value={totalRunHours} onChange={e => setTotalRunHours(e.target.value)} required
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <p className="text-xs text-gray-400">
              Machine details (FAB Number, Model Number, Sponsor) belong to the machine itself — edit them from the Machine screen.
            </p>
          </div>

          <ReportPartsEditor
            spareParts={spareParts}
            trackedParts={trackedParts}
            reportDate={reportDate}
            totalRunHours={totalRunHours}
            onAdd={addTrackedPart}
            onRemove={removeTrackedPart}
            onUpdate={updateTrackedPart}
          />

          <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Remarks *</label>
            <textarea value={remarks} onChange={e => setRemarks(e.target.value)} rows={3} required
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Service By *</label>
            <SuggestInput value={servicedBy} onChange={setServicedBy} suggestions={engineerSuggestions}
              placeholder="Engineer name" required />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button type="submit" disabled={saving}
            className="w-full bg-blue-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors">
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </form>
      </div>
    </Layout>
  )
}
