import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { Layout } from '../../components/Layout'
import { alphanumericOnly } from '../../utils/validate'

type Form = { fab_number: string; model_number: string; sponsor: string }

export function ServiceEdit() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [form, setForm] = useState<Form>({ fab_number: '', model_number: '', sponsor: '' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [fabError, setFabError] = useState('')

  useEffect(() => {
    supabase.from('services').select('*').eq('id', id).single().then(({ data: svc }) => {
      if (svc) {
        setForm({
          fab_number: svc.fab_number || '',
          model_number: svc.model_number || '',
          sponsor: svc.sponsor || '',
        })
      }
      setLoading(false)
    })
  }, [id])

  async function checkFab() {
    if (!form.fab_number) return
    const { data } = await supabase.from('services').select('id').eq('fab_number', form.fab_number).neq('id', id).maybeSingle()
    setFabError(data ? 'A machine with this FAB Number already exists.' : '')
  }

  function set(field: keyof Form) {
    return (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [field]: e.target.value }))
  }

  function setFabNumber(e: React.ChangeEvent<HTMLInputElement>) {
    setForm(f => ({ ...f, fab_number: alphanumericOnly(e.target.value) }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (fabError || !form.fab_number.trim()) return
    setError('')
    setSaving(true)

    const { error: svcError } = await supabase
      .from('services')
      .update({
        fab_number: form.fab_number.trim(),
        model_number: form.model_number.trim() || null,
        sponsor: form.sponsor.trim() || null,
        // updated_at and the edit trail are stamped by triggers (0022).
      })
      .eq('id', id)

    if (svcError) {
      setError(svcError.code === '23505' ? 'A machine with this FAB Number already exists.' : 'Failed to save. Please try again.')
      setSaving(false)
      return
    }

    navigate(`/services/${id}`)
  }

  if (loading) return <Layout><p className="text-gray-400 text-sm">Loading...</p></Layout>

  return (
    <Layout>
      <div className="max-w-xl">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => navigate(`/services/${id}`)} className="text-gray-400 hover:text-gray-600">← Back</button>
          <h2 className="text-xl font-semibold text-gray-900">Edit Machine</h2>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
            <Field label="FAB Number *" value={form.fab_number} onChange={setFabNumber} onBlur={checkFab} required error={fabError} />
            <Field label="Model Number" value={form.model_number} onChange={set('model_number')} />

            <Field label="Sponsor" value={form.sponsor} onChange={set('sponsor')} />
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

function Field({
  label, value, onChange, onBlur, required, error,
}: {
  label: string; value: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  onBlur?: () => void; required?: boolean; error?: string
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input type="text" value={value} onChange={onChange} onBlur={onBlur} required={required}
        className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  )
}
