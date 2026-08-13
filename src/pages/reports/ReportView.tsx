import { useEffect, useRef, useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { toDisplayDate, toDisplayDateTime, today } from '../../utils/dateEngine'
import { srNum } from '../../utils/reportNumber'
import { downloadPdf } from '../../utils/downloadPdf'
import { Layout } from '../../components/Layout'
import { ConfirmDeleteModal } from '../../components/ConfirmDeleteModal'
import { useAuth } from '../../hooks/useAuth'

type ReportPart = {
  spare_part_id: string
  qty: number
  hours_run: number
  next_hours: number
  hours_per_day: number
  remaining_hours: number
  due_date: string
  maintenance_days: number
  spare_part: { code: string; name: string; size: string | null }
}

type Report = {
  id: string
  report_number: number
  service_id: string
  report_date: string
  total_run_hours: number
  remarks: string
  serviced_by: string | null
  due_service_date: string | null
  filed_by_name: string | null
  edited_by_name: string | null
  edited_at: string | null
  edit_count: number
  service: { fab_number: string; model_number: string | null; sponsor: string | null; customer: { id: string; name: string; org: string; address: string; phone: string; gst: string } }
}

export function ReportView() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { isAdmin } = useAuth()
  const [report, setReport] = useState<Report | null>(null)
  const [parts, setParts] = useState<ReportPart[]>([])
  const [loading, setLoading] = useState(true)
  const [downloading, setDownloading] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const printRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    Promise.all([
      supabase
        .from('service_reports')
        .select('*, service:services(fab_number, model_number, sponsor, customer:customers(id, name, org, address, phone, gst))')
        .eq('id', id)
        .single(),
      supabase.from('service_report_parts').select('*, spare_part:spare_parts(code, name, size)').eq('service_report_id', id),
    ]).then(([{ data }, { data: partsData }]) => {
      setReport(data as unknown as Report)
      if (partsData) setParts(partsData)
      setLoading(false)
    })
  }, [id])

  async function handleDownload(audience: 'engineer' | 'customer') {
    if (!printRef.current) return
    setMenuOpen(false)
    setDownloading(true)
    const isForCustomer = audience === 'customer'
    // Hide customer-only-excluded fields (Size column, part code) by mutating
    // the live DOM directly rather than toggling React state — html2canvas
    // reads the DOM asynchronously, and a state toggle + re-render around
    // that async read is a race: the revert can land before html2canvas has
    // actually finished capturing, corrupting the "for customer" PDF.
    const hiddenEls = isForCustomer
      ? Array.from(printRef.current.querySelectorAll<HTMLElement>('[data-customer-hide]'))
      : []
    hiddenEls.forEach(el => { el.style.display = 'none' })
    const base = report?.report_number ? srNum(report.report_number) : 'service-report'
    try {
      await downloadPdf(printRef.current, `${base}${isForCustomer ? '-customer' : ''}.pdf`)
    } finally {
      hiddenEls.forEach(el => { el.style.display = '' })
      setDownloading(false)
    }
  }

  async function handleDelete() {
    if (!report) return
    setDeleting(true)
    const { error } = await supabase.from('service_reports').delete().eq('id', report.id)
    if (error) {
      alert(`Failed to delete report: ${error.message}`)
      setDeleting(false)
      setConfirmingDelete(false)
      return
    }
    navigate(`/services/${report.service_id}`)
  }

  if (loading) return <Layout><p className="text-gray-400 text-sm">Loading...</p></Layout>
  if (!report) return <Layout><p className="text-red-500 text-sm">Report not found.</p></Layout>

  const reportCard = (
    <div ref={printRef} className="bg-white p-6 print:p-0 print:pb-2 text-gray-900">
      <table className="w-full border-collapse border-2 border-gray-900 text-sm table-fixed">
        <colgroup>
          <col className="w-[15%]" />
          <col className="w-[35%]" />
          <col className="w-[15%]" />
          <col className="w-[35%]" />
        </colgroup>
        <tbody>
          {/* Header: title box + logo/address */}
          <tr>
            <td colSpan={2} className="border border-gray-900 p-3 align-middle text-center break-words">
              <p className="text-xl font-bold tracking-wide">SERVICE REPORT</p>
            </td>
            <td colSpan={2} rowSpan={3} className="border border-gray-900 p-3 align-middle text-center break-words">
              <img src="/logo.png" alt="Prime Pneumatics & Consultants" width={172} height={40} className="h-9 w-auto mb-2 mx-auto" />
              <p className="text-xs text-gray-700 leading-snug">
                F125,126 - Ekta Arcade, Nr.Horizon Hotel<br />
                Kadodara, Surat Bardoli Road, Surat - 394 327<br />
                Mob - +91 97128 96739, 85898 28306
              </p>
            </td>
          </tr>
          <tr>
            <td className="border border-gray-900 p-2 text-xs text-gray-500 text-center align-middle break-words">Report No :</td>
            <td className="border border-gray-900 p-2 font-mono font-semibold text-center align-middle break-words">{report.report_number ? srNum(report.report_number) : '—'}</td>
          </tr>
          <tr>
            <td className="border border-gray-900 p-2 text-xs text-gray-500 text-center align-middle break-words">Date :</td>
            <td className="border border-gray-900 p-2 font-medium text-center align-middle break-words">{toDisplayDate(report.report_date)}</td>
          </tr>

          {/* Customer */}
          <tr>
            <td colSpan={4} className="border border-gray-900 p-2 align-middle text-center break-words">
              <p className="text-xs text-gray-500 mb-1">Customer Name &amp; Address :</p>
              <p className="font-medium">
                {report.service.customer.name}
                {report.service.customer.org ? ` — ${report.service.customer.org}` : ''}
              </p>
              {report.service.customer.address && (
                <p className="text-sm text-gray-700 mt-0.5">{report.service.customer.address}</p>
              )}
            </td>
          </tr>
          <FieldRow label="Contact No" value={report.service.customer.phone} label2="GST" value2={report.service.customer.gst} />

          {/* Machine */}
          <FieldRow label="FAB Number" value={report.service.fab_number} label2="Model Number" value2={report.service.model_number ?? ''} />
          <FieldRow label="Sponsor" value={report.service.sponsor ?? ''} label2="Service By" value2={report.serviced_by ?? ''} />
          <FieldRow label="Total Machine Run" value={`${report.total_run_hours} hrs`} label2="Due Service Date" value2={report.due_service_date ? toDisplayDate(report.due_service_date) : ''} />

          {/* Spare Part Status */}
          {parts.length > 0 && (
            <tr>
              <td colSpan={4} className="border border-gray-900 p-0 align-top break-inside-avoid">
                <p className="text-xs text-gray-500 px-2 pt-2">Spare Part Status</p>
                <table className="w-full text-sm mt-1 table-fixed" style={{ borderCollapse: 'collapse' }}>
                  <thead>
                    <tr className="text-center text-xs text-gray-500 bg-gray-50">
                      <th className="py-2 px-2 border-t border-gray-200 break-words">Part</th>
                      <th data-customer-hide className="py-2 px-2 border-t border-gray-200 break-words">Size</th>
                      <th className="py-2 px-2 border-t border-gray-200 break-words">Qty</th>
                      <th className="py-2 px-2 border-t border-gray-200 break-words">Hours Run</th>
                      <th className="py-2 px-2 border-t border-gray-200 break-words">Next Hours</th>
                      <th className="py-2 px-2 border-t border-gray-200 break-words">Remaining Hrs</th>
                      <th className="py-2 px-2 border-t border-gray-200 break-words">Maint. Days</th>
                      <th className="py-2 px-2 border-t border-gray-200 break-words">Due Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parts.map(p => (
                      <tr key={p.spare_part_id} className="border-t border-gray-100 break-inside-avoid text-center">
                        <td className="py-2 px-2 text-gray-800 break-words">
                          <span data-customer-hide className="font-mono text-gray-400 text-xs mr-1">{p.spare_part.code}</span>
                          {p.spare_part.name}
                        </td>
                        <td data-customer-hide className="py-2 px-2 text-gray-600 break-words">{p.spare_part.size || '—'}</td>
                        <td className="py-2 px-2 text-gray-600 break-words">{p.qty}</td>
                        <td className="py-2 px-2 text-gray-600 break-words">{p.hours_run}</td>
                        <td className="py-2 px-2 text-gray-600 break-words">{p.next_hours}</td>
                        <td className={`py-2 px-2 font-medium break-words ${p.remaining_hours <= 0 ? 'text-red-600' : 'text-gray-900'}`}>{p.remaining_hours}</td>
                        <td className="py-2 px-2 text-gray-600 break-words">{p.maintenance_days}</td>
                        <td className="py-2 px-2 text-gray-600 break-words">{toDisplayDate(p.due_date)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </td>
            </tr>
          )}

          {/* Remarks */}
          <tr>
            <td colSpan={4} className="border border-gray-900 p-2 align-top break-inside-avoid text-center break-words" style={{ minHeight: '3rem' }}>
              <p className="text-xs text-gray-500 mb-1">Remarks :</p>
              <p className="text-sm whitespace-pre-wrap">{report.remarks || '—'}</p>
            </td>
          </tr>

          {/* Signatures */}
          <tr>
            <td colSpan={2} className="border border-gray-900 p-3 pt-8 text-center align-bottom break-words">
              <p className="font-semibold">Service Engineer</p>
              {report.serviced_by && <p className="text-xs font-normal text-gray-600 mt-1">{report.serviced_by}</p>}
            </td>
            <td colSpan={2} className="border border-gray-900 p-3 pt-8 text-center align-bottom break-words">
              <p className="font-semibold">Customer Name, Sign &amp; Seal</p>
            </td>
          </tr>
        </tbody>
      </table>

      {/* Footer */}
      <div className="pt-2 flex items-center justify-end text-[10px] text-gray-400">
        <span>Generated {toDisplayDate(today())}</span>
      </div>
    </div>
  )

  return (
    <Layout>
      <div className="max-w-2xl print:mx-auto">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6 no-print">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(`/services/${report.service_id}`)} className="text-gray-400 hover:text-gray-600">← Back</button>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Service Report</h2>
              {report.report_number && <p className="text-xs text-gray-400 font-mono">{srNum(report.report_number)}</p>}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
            <Link to={`/reports/${report.id}/edit`}
              className="w-full px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors flex items-center justify-center">
              Edit
            </Link>
            <Link to={`/reports/new/${report.service.customer.id}`}
              className="w-full px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors flex items-center justify-center">
              File Report
            </Link>
            <button onClick={() => navigate(`/services/${report.service_id}/reports`)}
              className="w-full px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors flex items-center justify-center">
              Report History
            </button>
            <div ref={menuRef} className="relative">
              <button
                onClick={() => setMenuOpen(v => !v)}
                disabled={downloading}
                className="w-full px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                {downloading ? 'Preparing PDF...' : 'Download'}
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M7 10l5 5 5-5z" /></svg>
              </button>
              {menuOpen && (
                <div className="absolute right-0 mt-1 w-44 bg-white border border-gray-200 rounded-xl shadow-lg z-20 overflow-hidden">
                  <button
                    onClick={() => handleDownload('engineer')}
                    className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    For Engineer
                  </button>
                  <button
                    onClick={() => handleDownload('customer')}
                    className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 border-t border-gray-100"
                  >
                    For Customer
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Audit trail. Deliberately outside printRef — the PDF is an
            html2canvas capture of that subtree, so keeping this out of it is
            what guarantees the trail never reaches a customer's copy. */}
        {(report.filed_by_name || report.edited_by_name) && (
          <p className="text-xs text-gray-400 mb-4 no-print">
            {report.filed_by_name && <>Filed by <span className="text-gray-600">{report.filed_by_name}</span></>}
            {report.edited_by_name && report.edited_at && (
              <>
                {report.filed_by_name ? ' · ' : ''}
                Last edited by <span className="text-gray-600">{report.edited_by_name}</span> on {toDisplayDateTime(report.edited_at)}
                {report.edit_count > 1 ? ` (${report.edit_count} edits)` : ''}
              </>
            )}
          </p>
        )}

        {isAdmin && (
          <button
            onClick={() => setConfirmingDelete(true)}
            disabled={deleting}
            className="w-full mb-4 text-center px-4 py-2.5 border border-red-200 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50 disabled:opacity-50 transition-colors no-print"
          >
            {deleting ? 'Deleting...' : 'Delete Report'}
          </button>
        )}

        {confirmingDelete && report && (
          <ConfirmDeleteModal
            title={`Delete Service Report ${report.report_number ? srNum(report.report_number) : ''}?`}
            warning="This will permanently remove this report and its spare part records. This cannot be undone."
            confirming={deleting}
            onConfirm={handleDelete}
            onCancel={() => setConfirmingDelete(false)}
          />
        )}

        <div className="border border-gray-200 rounded-xl overflow-hidden print:border-0 print:rounded-none">
          {reportCard}
        </div>
      </div>
    </Layout>
  )
}

function FieldRow({ label, value, label2, value2 }: { label: string; value: string; label2?: string; value2?: string }) {
  return (
    <tr>
      <td className="border border-gray-900 p-2 text-xs text-gray-500 text-center align-middle break-words">{label}</td>
      <td className="border border-gray-900 p-2 font-medium text-center align-middle break-words">{value || '—'}</td>
      <td className="border border-gray-900 p-2 text-xs text-gray-500 text-center align-middle break-words">{label2 ?? ''}</td>
      <td className="border border-gray-900 p-2 font-medium text-center align-middle break-words">{label2 ? (value2 || '—') : ''}</td>
    </tr>
  )
}
