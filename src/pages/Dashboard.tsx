import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Layout } from '../components/Layout'
import { toISODate, toDisplayDate, toDisplayDateTime, startOfWeek, endOfWeek, today } from '../utils/dateEngine'
import { DEFAULT_REMINDER_TEMPLATE, buildReminderMessage, buildReminderLink } from '../utils/reminderTemplate'
import { normalizePhone } from '../utils/whatsapp'
import { srNum } from '../utils/reportNumber'
import { useAuth } from '../hooks/useAuth'

type DueService = {
  id: string
  report_number: number
  due_service_date: string
  report_date: string
  service_done_at: string | null
  service_done_by_name: string | null
  service: {
    id: string
    fab_number: string
    model_number: string | null
    sponsor: string | null
    customer: { name: string; org: string; phone: string }
  }
}

type Tab = 'week' | 'pastdue' | 'done'

export function Dashboard() {
  const { session, loading: authLoading, name } = useAuth()
  const [tab, setTab] = useState<Tab>('week')
  const [weekServices, setWeekServices] = useState<DueService[]>([])
  const [pastServices, setPastServices] = useState<DueService[]>([])
  const [doneServices, setDoneServices] = useState<DueService[]>([])
  const [loading, setLoading] = useState(true)
  const [template, setTemplate] = useState(DEFAULT_REMINDER_TEMPLATE)

  useEffect(() => {
    if (authLoading || !session) return

    async function load() {
      if (!session) return
      const weekStart = toISODate(startOfWeek())
      const weekEnd = toISODate(endOfWeek())
      const ninetyDaysAgo = new Date()
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)
      const ninetyDaysAgoStr = toISODate(ninetyDaysAgo)

      const selectCols = 'id, report_number, due_service_date, report_date, service_done_at, service_done_by_name, service:services(id, fab_number, model_number, sponsor, customer:customers(name, org, phone))'

      const weekQuery = supabase
        .from('service_reports')
        .select(selectCols)
        .gte('due_service_date', weekStart)
        .lte('due_service_date', weekEnd)
        .is('service_done_at', null)
        .order('due_service_date', { ascending: true })
      const pastQuery = supabase
        .from('service_reports')
        .select(selectCols)
        .gte('due_service_date', ninetyDaysAgoStr)
        .lt('due_service_date', weekStart)
        .is('service_done_at', null)
        .order('due_service_date', { ascending: false })
      const doneQuery = supabase
        .from('service_reports')
        .select(selectCols)
        .not('service_done_at', 'is', null)
        .gte('service_done_at', ninetyDaysAgo.toISOString())
        .order('service_done_at', { ascending: false })

      const [{ data: weekData }, { data: pastData }, { data: doneData }, { data: settingData }] = await Promise.all([
        weekQuery,
        pastQuery,
        doneQuery,
        supabase
          .from('settings')
          .select('value')
          .eq('key', 'reminder_template')
          .maybeSingle(),
      ])

      if (weekData) setWeekServices(weekData as unknown as DueService[])
      if (pastData) setPastServices(pastData as unknown as DueService[])
      if (doneData) setDoneServices(doneData as unknown as DueService[])
      if (settingData) setTemplate(settingData.value)
      setLoading(false)
    }
    load()
  }, [authLoading, session])

  const todayStr = today()
  const services = tab === 'week' ? weekServices : tab === 'pastdue' ? pastServices : doneServices

  async function markDone(item: DueService) {
    if (!window.confirm('Mark this service as done? It will be removed from the dashboard.')) return
    const nowISO = new Date().toISOString()
    const { error } = await supabase
      .from('service_reports')
      .update({ service_done_at: nowISO })
      .eq('id', item.id)
    if (error) {
      alert(error.message)
      return
    }
    setWeekServices(prev => prev.filter(s => s.id !== item.id))
    setPastServices(prev => prev.filter(s => s.id !== item.id))
    setDoneServices(prev => [{ ...item, service_done_at: nowISO, service_done_by_name: name }, ...prev])
  }

  async function undoDone(item: DueService) {
    if (!window.confirm('Undo marking this service done? It will reappear on the dashboard.')) return
    const { error } = await supabase
      .from('service_reports')
      .update({ service_done_at: null, service_done_by_id: null, service_done_by_name: null })
      .eq('id', item.id)
    if (error) {
      alert(error.message)
      return
    }
    setDoneServices(prev => prev.filter(s => s.id !== item.id))
    const restored = { ...item, service_done_at: null, service_done_by_name: null }
    const weekStart = toISODate(startOfWeek())
    const weekEnd = toISODate(endOfWeek())
    if (item.due_service_date >= weekStart && item.due_service_date <= weekEnd) {
      setWeekServices(prev => [...prev, restored].sort((a, b) => a.due_service_date.localeCompare(b.due_service_date)))
    } else if (item.due_service_date < weekStart) {
      setPastServices(prev => [...prev, restored].sort((a, b) => b.due_service_date.localeCompare(a.due_service_date)))
    }
  }

  return (
    <Layout>
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Services Due</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          {tab === 'week'
            ? `${toDisplayDate(toISODate(startOfWeek()))} — ${toDisplayDate(toISODate(endOfWeek()))}`
            : tab === 'pastdue'
            ? 'Last 90 days before this week'
            : 'Marked done in the last 90 days'}
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setTab('week')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'week'
              ? 'bg-gray-900 text-white'
              : 'bg-white border border-gray-200 text-gray-600'
          }`}
        >
          This Week
          {!loading && weekServices.length > 0 && (
            <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full ${
              tab === 'week' ? 'bg-white text-gray-900' : 'bg-gray-100 text-gray-600'
            }`}>
              {weekServices.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab('pastdue')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'pastdue'
              ? 'bg-red-600 text-white'
              : 'bg-white border border-gray-200 text-gray-600'
          }`}
        >
          Past Due
          {!loading && pastServices.length > 0 && (
            <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full ${
              tab === 'pastdue' ? 'bg-white text-red-600' : 'bg-red-100 text-red-600'
            }`}>
              {pastServices.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab('done')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'done'
              ? 'bg-emerald-600 text-white'
              : 'bg-white border border-gray-200 text-gray-600'
          }`}
        >
          Done
          {!loading && doneServices.length > 0 && (
            <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full ${
              tab === 'done' ? 'bg-white text-emerald-600' : 'bg-emerald-100 text-emerald-600'
            }`}>
              {doneServices.length}
            </span>
          )}
        </button>
      </div>

      {loading ? (
        <p className="text-gray-400 text-sm">Loading...</p>
      ) : services.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-10 text-center">
          <p className="text-gray-500 text-sm">
            {tab === 'week'
              ? 'No services due this week.'
              : tab === 'pastdue'
              ? 'No past due services in the last 90 days.'
              : 'No services marked done in the last 90 days.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {services.map(s => {
            const isPastDue = s.due_service_date < todayStr
            const message = buildReminderMessage(template, {
              name: s.service.customer.org || s.service.customer.name,
              model: s.service.model_number || 'machine',
              date: toDisplayDate(s.due_service_date),
            })
            const reminderLink = buildReminderLink(normalizePhone(s.service.customer.phone), message)

            return (
              <div key={s.id} className="bg-white border border-gray-200 rounded-xl p-4">
                <div className="flex items-start justify-between mb-1">
                  <div>
                    <p className="font-semibold text-gray-900 text-sm">{s.service.customer.org || s.service.customer.name}</p>
                    {s.report_number && <p className="text-xs font-mono text-gray-400">{srNum(s.report_number)}</p>}
                  </div>
                  {tab === 'done' ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700 shrink-0 ml-2">
                      Done
                    </span>
                  ) : isPastDue ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700 shrink-0 ml-2">
                      Past Due
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 shrink-0 ml-2">
                      Due
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 font-mono">{s.service.fab_number}{s.service.model_number ? ` · ${s.service.model_number}` : ''}</p>
                {s.service.sponsor && <p className="text-xs text-gray-400">Sponsor: {s.service.sponsor}</p>}
                <div className="flex flex-wrap gap-x-3 text-xs text-gray-400 mt-0.5 mb-3">
                  <span>Due: {toDisplayDate(s.due_service_date)}</span>
                  {tab === 'done' ? (
                    <span>Done{s.service_done_by_name ? ` by ${s.service_done_by_name}` : ''}{s.service_done_at ? ` on ${toDisplayDateTime(s.service_done_at)}` : ''}</span>
                  ) : (
                    <span>Serviced: {toDisplayDate(s.report_date)}</span>
                  )}
                </div>

                <div className="flex gap-2">
                  {tab === 'done' ? (
                    <>
                      <Link
                        to={`/reports/${s.id}`}
                        className="flex-1 py-2 bg-blue-50 text-blue-700 rounded-lg text-xs font-semibold text-center"
                      >
                        View
                      </Link>
                      <button
                        onClick={() => undoDone(s)}
                        className="flex-1 py-2 bg-gray-100 text-gray-700 rounded-lg text-xs font-semibold text-center"
                      >
                        Undo
                      </button>
                    </>
                  ) : (
                    <>
                      <a
                        href={`tel:${s.service.customer.phone}`}
                        className="flex-1 py-2 bg-green-50 text-green-700 rounded-lg text-xs font-semibold text-center"
                      >
                        Call
                      </a>
                      <Link
                        to={`/reports/${s.id}`}
                        className="flex-1 py-2 bg-blue-50 text-blue-700 rounded-lg text-xs font-semibold text-center"
                      >
                        View
                      </Link>
                      <a
                        href={reminderLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 py-2 bg-amber-50 text-amber-700 rounded-lg text-xs font-semibold text-center"
                      >
                        Remind
                      </a>
                      <button
                        onClick={() => markDone(s)}
                        className="flex-1 py-2 bg-emerald-50 text-emerald-700 rounded-lg text-xs font-semibold text-center"
                      >
                        Done
                      </button>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </Layout>
  )
}
