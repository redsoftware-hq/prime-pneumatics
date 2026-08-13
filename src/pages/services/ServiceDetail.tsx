import { useEffect, useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { Layout } from '../../components/Layout'
import { toDisplayDateTime } from '../../utils/dateEngine'
import { calcRemaining, type PartState } from '../../utils/machineParts'

type Service = {
  id: string
  fab_number: string
  model_number: string | null
  sponsor: string | null
  created_by_name: string | null
  edited_by_name: string | null
  edited_at: string | null
  edit_count: number
  customer: { id: string; name: string; org: string; phone: string }
}

type MachinePart = PartState & { spare_part_id: string; spare_part: { code: string; name: string; size: string | null } }

export function ServiceDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [service, setService] = useState<Service | null>(null)
  const [parts, setParts] = useState<MachinePart[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      supabase.from('services').select('id, fab_number, model_number, sponsor, created_by_name, edited_by_name, edited_at, edit_count, customer:customers(id, name, org, phone)').eq('id', id).single(),
      supabase.from('service_machine_parts').select('*, spare_part:spare_parts(code, name, size)').eq('service_id', id),
    ]).then(([{ data: svc }, { data: partsData }]) => {
      setService(svc as unknown as Service)
      if (partsData) setParts(partsData as unknown as MachinePart[])
      setLoading(false)
    })
  }, [id])

  if (loading) return <Layout><p className="text-gray-400 text-sm">Loading...</p></Layout>
  if (!service) return <Layout><p className="text-red-500 text-sm">Machine not found.</p></Layout>

  return (
    <Layout>
      <div className="max-w-xl">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => navigate(-1)} className="text-gray-400 hover:text-gray-600">← Back</button>
          <div>
            <h2 className="text-xl font-semibold text-gray-900 font-mono">{service.fab_number}</h2>
            <p className="text-sm text-gray-500">{service.customer.org || service.customer.name}</p>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4 mb-4">
          <Row label="Model Number" value={service.model_number} />
          <Row label="Sponsor" value={service.sponsor} />
        </div>

        {(service.created_by_name || service.edited_by_name) && (
          <p className="text-xs text-gray-400 mb-4">
            {service.created_by_name && <>Added by <span className="text-gray-600">{service.created_by_name}</span></>}
            {service.edited_by_name && service.edited_at && (
              <>
                {service.created_by_name ? ' · ' : ''}
                Last edited by <span className="text-gray-600">{service.edited_by_name}</span> on {toDisplayDateTime(service.edited_at)}
                {service.edit_count > 1 ? ` (${service.edit_count} edits)` : ''}
              </>
            )}
          </p>
        )}

        <div className="flex gap-3 mb-6">
          <Link to={`/services/${id}/reports/new`}
            className="flex-1 text-center px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
            Add Service Report
          </Link>
          <Link to={`/services/${id}/reports`}
            className="flex-1 text-center px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">
            Report History
          </Link>
        </div>

        <Link to={`/services/${id}/edit`}
          className="block text-center px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors mb-6">
          Edit Machine
        </Link>

        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Spare Part Status</h3>
        {parts.length === 0 ? (
          <p className="text-xs text-gray-400">No spare parts tracked yet — added when a service report is filed.</p>
        ) : (
          <div className="space-y-2">
            {parts.map(p => {
              const { remainingHours, days } = calcRemaining(p)
              const overdue = remainingHours <= 0
              return (
                <div key={p.spare_part_id} className="bg-white border border-gray-200 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-medium text-gray-900">
                      <span className="font-mono text-gray-400 text-xs mr-1">{p.spare_part.code}</span>{p.spare_part.name}
                      {p.spare_part.size && <span className="text-gray-400 text-xs ml-1">({p.spare_part.size})</span>}
                    </p>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${overdue ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                      {overdue ? 'Overdue' : `${Math.ceil(days)}d left`}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400">
                    {p.hours_run} / {p.next_hours} hrs · {p.hours_per_day}h/day
                  </p>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </Layout>
  )
}

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex gap-4">
      <span className="text-sm text-gray-500 w-36 shrink-0">{label}</span>
      <span className="text-sm text-gray-900">{value || '—'}</span>
    </div>
  )
}
