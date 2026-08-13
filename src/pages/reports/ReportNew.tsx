import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { Layout } from '../../components/Layout'
import { SuggestInput } from '../../components/SuggestInput'
import { ReportPartsEditor, type TrackedPartField } from '../../components/ReportPartsEditor'
import { useEngineerSuggestions } from '../../hooks/useEngineerSuggestions'
import { today } from '../../utils/dateEngine'
import { buildSnapshot, buildMachineState, type TrackedPart } from '../../utils/reportSnapshot'
import { alphanumericOnly } from '../../utils/validate'

type SparePart = { id: string; code: string; name: string; size: string | null }
type ServiceInfo = { id: string; fab_number: string; model_number: string | null; customer_id: string }
type ExistingMachine = { id: string; fab_number: string; model_number: string | null; sponsor: string | null }

export function ReportNew() {
  const { id: routeServiceId, customerId: routeCustomerId } = useParams<{ id?: string; customerId?: string }>()
  const isCustomerMode = !routeServiceId && !!routeCustomerId
  const navigate = useNavigate()
  const engineerSuggestions = useEngineerSuggestions()

  const [loading, setLoading] = useState(true)
  const [service, setService] = useState<ServiceInfo | null>(null)
  const [customerName, setCustomerName] = useState('')
  const [existingMachines, setExistingMachines] = useState<ExistingMachine[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [spareParts, setSpareParts] = useState<SparePart[]>([])

  const [trackedParts, setTrackedParts] = useState<TrackedPart[]>([])

  const [reportDate, setReportDate] = useState(today())
  const [totalRunHours, setTotalRunHours] = useState('')
  const [modelNumber, setModelNumber] = useState('')
  const [fabNumber, setFabNumber] = useState('')
  const [fabError, setFabError] = useState('')
  const [sponsor, setSponsor] = useState('')
  const [showAddMachine, setShowAddMachine] = useState(false)
  const [remarks, setRemarks] = useState('')
  const [servicedBy, setServicedBy] = useState('')

  const matchedMachine = isCustomerMode && fabNumber
    ? existingMachines.find(m => m.fab_number === fabNumber) ?? null
    : null

  useEffect(() => {
    async function load() {
      if (routeServiceId) {
        const { data } = await supabase.from('services').select('id, fab_number, model_number, customer_id').eq('id', routeServiceId).single()
        if (data) { setService(data); setFabNumber(data.fab_number) }
      } else if (routeCustomerId) {
        const [{ data: cust }, { data: machines }] = await Promise.all([
          supabase.from('customers').select('name').eq('id', routeCustomerId).single(),
          supabase.from('services').select('id, fab_number, model_number, sponsor').eq('customer_id', routeCustomerId),
        ])
        if (cust) setCustomerName(cust.name)
        if (machines) setExistingMachines(machines)
      }
      const { data: spares } = await supabase.from('spare_parts').select('id, code, name, size').order('code')
      if (spares) setSpareParts(spares)
      setLoading(false)
    }
    load()
  }, [routeServiceId, routeCustomerId])

  function handleFabNumberChange(rawValue: string) {
    // FAB Number is the machine's unique identifier (globally unique, one per
    // physical unit) — Model Number is just a descriptive model name that can
    // repeat across several distinct machines a customer owns, so matching
    // must key off FAB Number, never Model Number.
    const value = alphanumericOnly(rawValue)
    setFabNumber(value)
    const match = existingMachines.find(m => m.fab_number === value)
    if (match) {
      setModelNumber(match.model_number ?? '')
      setSponsor(match.sponsor ?? '')
      setFabError('')
      setShowAddMachine(false)
    } else if (!showAddMachine) {
      // Only clear if we're not already mid-way through manually entering a
      // new machine — otherwise typing the FAB number would wipe out what
      // the engineer just typed into Model Number / Sponsor.
      setModelNumber('')
      setSponsor('')
      setFabError('')
    }
  }

  async function checkFab() {
    if (!fabNumber) return
    const excludeId = service?.id ?? matchedMachine?.id
    let query = supabase.from('services').select('id').eq('fab_number', fabNumber)
    if (excludeId) query = query.neq('id', excludeId)
    const { data } = await query.maybeSingle()
    setFabError(data ? 'A machine with this FAB Number already exists.' : '')
  }

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (fabError || !fabNumber.trim() || !remarks.trim() || !servicedBy.trim()) return
    setError('')
    setSaving(true)

    let resolvedServiceId: string

    if (routeServiceId && service) {
      resolvedServiceId = service.id
      if (fabNumber.trim() !== service.fab_number) {
        const { error: fabUpdateError } = await supabase
          .from('services')
          .update({ fab_number: fabNumber.trim() })
          .eq('id', service.id)
        if (fabUpdateError) {
          setError(fabUpdateError.code === '23505' ? 'A machine with this FAB Number already exists.' : 'Failed to update FAB number.')
          setSaving(false)
          return
        }
      }
    } else if (routeCustomerId) {
      if (matchedMachine) {
        const { error: updateError } = await supabase
          .from('services')
          .update({
            fab_number: fabNumber.trim(),
            model_number: modelNumber.trim() || null,
            sponsor: sponsor.trim() || null,
          })
          .eq('id', matchedMachine.id)
        if (updateError) {
          setError(updateError.code === '23505' ? 'A machine with this FAB Number already exists.' : 'Failed to save machine.')
          setSaving(false)
          return
        }
        resolvedServiceId = matchedMachine.id
      } else {
        const { data: newService, error: svcError } = await supabase
          .from('services')
          .insert({
            customer_id: routeCustomerId,
            fab_number: fabNumber.trim(),
            model_number: modelNumber.trim() || null,
            sponsor: sponsor.trim() || null,
          })
          .select('id')
          .single()
        if (svcError || !newService) {
          setError(svcError?.code === '23505' ? 'A machine with this FAB Number already exists.' : 'Failed to save machine. Please try again.')
          setSaving(false)
          return
        }
        resolvedServiceId = newService.id
      }
    } else {
      setSaving(false)
      return
    }

    const hoursRun = parseFloat(totalRunHours) || 0
    const { rows: snapshotRows, earliestDue } = buildSnapshot(trackedParts, hoursRun, reportDate)

    const { data: report, error: reportError } = await supabase
      .from('service_reports')
      .insert({
        service_id: resolvedServiceId,
        report_date: reportDate,
        total_run_hours: hoursRun,
        remarks: remarks.trim(),
        serviced_by: servicedBy.trim(),
        // filed_by_id / filed_by_name are stamped by a BEFORE INSERT trigger
        // from auth.uid() (migration 0021), not sent from here.
        due_service_date: earliestDue,
      })
      .select('id')
      .single()

    if (reportError || !report) {
      setError('Failed to save report. Please try again.')
      setSaving(false)
      return
    }

    if (snapshotRows.length > 0) {
      const { error: partsError } = await supabase.from('service_report_parts').insert(
        snapshotRows.map(r => ({ ...r, service_report_id: report.id }))
      )
      if (partsError) {
        setError('Report saved, but spare part snapshot failed to save.')
        setSaving(false)
        return
      }

      await supabase.from('service_machine_parts').upsert(
        buildMachineState(trackedParts, resolvedServiceId, hoursRun),
        { onConflict: 'service_id,spare_part_id' }
      )
    }

    navigate(`/reports/${report.id}`)
  }

  if (loading) return <Layout><p className="text-gray-400 text-sm">Loading...</p></Layout>

  return (
    <Layout>
      <div className="max-w-xl">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => routeServiceId ? navigate(`/services/${routeServiceId}`) : navigate(-1)} className="text-gray-400 hover:text-gray-600">← Back</button>
          <div>
            <h2 className="text-xl font-semibold text-gray-900">New Service Report</h2>
            {service && (
              <p className="text-sm text-gray-500 font-mono">{service.fab_number}{service.model_number ? ` · ${service.model_number}` : ''}</p>
            )}
            {isCustomerMode && customerName && <p className="text-sm text-gray-500">{customerName}</p>}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {isCustomerMode && (
            <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Machine</h3>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">FAB Number *</label>
                <SuggestInput
                  value={fabNumber}
                  onChange={handleFabNumberChange}
                  onBlur={checkFab}
                  suggestions={existingMachines.map(m => m.fab_number)}
                  placeholder="e.g. FAB2K91A"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
                {fabError ? (
                  <p className="text-xs text-red-600 mt-1">{fabError}</p>
                ) : matchedMachine ? (
                  <p className="text-xs text-blue-600 mt-1">Existing machine found — Model Number and Sponsor filled in from it.</p>
                ) : null}
              </div>

              {matchedMachine || showAddMachine ? (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Model Number</label>
                    <input type="text" value={modelNumber} onChange={e => setModelNumber(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Sponsor</label>
                    <input type="text" value={sponsor} onChange={e => setSponsor(e.target.value)} placeholder="Dealer / referrer name"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                </>
              ) : fabNumber.trim() ? (
                <div className="flex items-center justify-between gap-3 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
                  <p className="text-xs text-amber-800">No machine found for this FAB Number.</p>
                  <button type="button" onClick={() => setShowAddMachine(true)}
                    className="text-xs font-semibold text-blue-600 hover:underline whitespace-nowrap">
                    + Add Machine
                  </button>
                </div>
              ) : null}
            </div>
          )}

          {/* Header block */}
          <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Report Date</label>
              <input type="date" value={reportDate} onChange={e => setReportDate(e.target.value)} required
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            {routeServiceId && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">FAB Number *</label>
                <input type="text" value={fabNumber} onChange={e => setFabNumber(alphanumericOnly(e.target.value))} onBlur={checkFab} required
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
                {fabError ? (
                  <p className="text-xs text-red-600 mt-1">{fabError}</p>
                ) : (
                  <p className="text-xs text-gray-400 mt-1">Tied to this machine — changing it here updates the machine's FAB Number too.</p>
                )}
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Total Run Hours *</label>
              <input type="number" min="0" value={totalRunHours} onChange={e => setTotalRunHours(e.target.value)} required
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          {/* Spare item hours — dynamic, add from the spare parts list */}
          <ReportPartsEditor
            spareParts={spareParts}
            trackedParts={trackedParts}
            reportDate={reportDate}
            totalRunHours={totalRunHours}
            onAdd={addTrackedPart}
            onRemove={removeTrackedPart}
            onUpdate={updateTrackedPart}
          />

          {/* Remarks */}
          <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Remarks *</label>
            <textarea value={remarks} onChange={e => setRemarks(e.target.value)} rows={3} required
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          {/* Service by — filled last */}
          <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Service By *</label>
            <SuggestInput value={servicedBy} onChange={setServicedBy} suggestions={engineerSuggestions}
              placeholder="Engineer name" required />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button type="submit" disabled={saving}
            className="w-full bg-blue-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors">
            {saving ? 'Saving...' : 'File Service Report'}
          </button>
        </form>
      </div>
    </Layout>
  )
}
