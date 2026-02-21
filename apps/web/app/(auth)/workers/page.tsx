'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/lib/auth-context'
import { apiClient } from '@/lib/api-client'
import { Users, Plus, ChevronDown, ChevronUp, X } from 'lucide-react'
import { useRouter } from 'next/navigation'

interface Worker {
  id: number
  name: string
  role: string | null
  startDate: string | null
  endDate: string | null
  notes: string | null
  totalPaid: number
}

interface PayrollEvent {
  id: number
  date: string
  amount: number
  type: string
  periodStart: string | null
  periodEnd: string | null
  notes: string | null
}

const PAYROLL_TYPES = ['salary', 'bonus', 'overtime', 'other']

const fmt = (n: number) => `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export default function WorkersPage() {
  const { activeRole } = useAuth()
  const router = useRouter()
  const [workers, setWorkers] = useState<Worker[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [payroll, setPayroll] = useState<Record<number, PayrollEvent[]>>({})
  const [showAdd, setShowAdd] = useState(false)
  const [showAddPayroll, setShowAddPayroll] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Worker form
  const [wName, setWName] = useState('')
  const [wRole, setWRole] = useState('')
  const [wStart, setWStart] = useState('')
  const [wNotes, setWNotes] = useState('')
  const [saving, setSaving] = useState(false)

  // Payroll form
  const [pDate, setPDate] = useState(new Date().toISOString().split('T')[0])
  const [pAmount, setPAmount] = useState('')
  const [pType, setPType] = useState('salary')
  const [pPeriodStart, setPPeriodStart] = useState('')
  const [pPeriodEnd, setPPeriodEnd] = useState('')
  const [pNotes, setPNotes] = useState('')
  const [savingPayroll, setSavingPayroll] = useState(false)

  const isManagerOrOwner = activeRole === 'manager' || activeRole === 'owner'

  useEffect(() => {
    if (!isManagerOrOwner) { router.push('/dashboard'); return }
  }, [activeRole, isManagerOrOwner, router])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res: any = await apiClient.getWorkers()
      setWorkers(res.data || [])
    } catch { setError('Failed to load workers') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { if (isManagerOrOwner) load() }, [load, isManagerOrOwner])

  const loadPayroll = async (workerId: number) => {
    const res: any = await apiClient.getPayroll(workerId)
    setPayroll(prev => ({ ...prev, [workerId]: res.data || [] }))
  }

  const toggleExpand = async (id: number) => {
    if (expandedId === id) { setExpandedId(null); return }
    setExpandedId(id)
    if (!payroll[id]) await loadPayroll(id)
  }

  const handleAddWorker = async () => {
    if (!wName.trim()) return
    setSaving(true)
    try {
      await apiClient.createWorker({
        name: wName.trim(),
        role: wRole || undefined,
        startDate: wStart || undefined,
        notes: wNotes || undefined,
      })
      setShowAdd(false)
      setWName(''); setWRole(''); setWStart(''); setWNotes('')
      await load()
    } catch (err: any) { setError(err.message) }
    finally { setSaving(false) }
  }

  const handleAddPayroll = async (workerId: number) => {
    if (!pDate || !pAmount) return
    setSavingPayroll(true)
    try {
      await apiClient.createPayrollEvent(workerId, {
        date: pDate,
        amount: Number(pAmount),
        type: pType,
        periodStart: pPeriodStart || undefined,
        periodEnd: pPeriodEnd || undefined,
        notes: pNotes || undefined,
      })
      setShowAddPayroll(null)
      setPDate(new Date().toISOString().split('T')[0]); setPAmount(''); setPType('salary')
      setPPeriodStart(''); setPPeriodEnd(''); setPNotes('')
      await loadPayroll(workerId)
      await load()
    } catch (err: any) { setError(err.message) }
    finally { setSavingPayroll(false) }
  }

  const handleMarkLeft = async (id: number) => {
    if (!confirm('Mark this worker as having left?')) return
    try {
      await apiClient.updateWorker(id, { endDate: new Date().toISOString().split('T')[0] })
      await load()
    } catch (err: any) { setError(err.message) }
  }

  if (loading) return (
    <div className="p-6 flex items-center justify-center min-h-64">
      <div className="animate-spin w-8 h-8 border-4 border-green-200 border-t-green-600 rounded-full" />
    </div>
  )

  const active = workers.filter(w => !w.endDate)
  const former = workers.filter(w => w.endDate)
  const totalPayroll = workers.reduce((s, w) => s + w.totalPaid, 0)

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Workers</h1>
          <p className="text-sm text-gray-500 mt-1">Total payroll: {fmt(totalPayroll)}</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg"
        >
          <Plus className="w-4 h-4" /> Add Worker
        </button>
      </div>

      {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-red-800 text-sm">{error}</div>}

      {/* Add Worker Form */}
      {showAdd && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">Add Worker</h2>
            <button onClick={() => setShowAdd(false)}><X className="w-4 h-4 text-gray-400" /></button>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Name *</label>
              <input value={wName} onChange={e => setWName(e.target.value)} placeholder="Full name"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-green-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Role</label>
              <input value={wRole} onChange={e => setWRole(e.target.value)} placeholder="e.g. Farm Hand"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Start Date</label>
              <input type="date" value={wStart} onChange={e => setWStart(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
              <input value={wNotes} onChange={e => setWNotes(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowAdd(false)} className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
            <button onClick={handleAddWorker} disabled={!wName.trim() || saving}
              className="px-4 py-1.5 bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white text-sm font-medium rounded-lg">
              {saving ? 'Saving...' : 'Add Worker'}
            </button>
          </div>
        </div>
      )}

      {/* Worker list */}
      {workers.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No workers added yet.</p>
        </div>
      ) : (
        <>
          {active.length > 0 && (
            <div className="mb-6">
              <h2 className="text-sm font-semibold text-gray-500 mb-2 uppercase tracking-wide">Active</h2>
              <div className="space-y-2">
                {active.map(w => <WorkerCard key={w.id} worker={w} expanded={expandedId === w.id} payroll={payroll[w.id] || []}
                  onToggle={() => toggleExpand(w.id)} showPayrollForm={showAddPayroll === w.id}
                  onShowPayrollForm={() => setShowAddPayroll(showAddPayroll === w.id ? null : w.id)}
                  onMarkLeft={() => handleMarkLeft(w.id)}
                  pDate={pDate} setPDate={setPDate} pAmount={pAmount} setPAmount={setPAmount}
                  pType={pType} setPType={setPType} pPeriodStart={pPeriodStart} setPPeriodStart={setPPeriodStart}
                  pPeriodEnd={pPeriodEnd} setPPeriodEnd={setPPeriodEnd} pNotes={pNotes} setPNotes={setPNotes}
                  savingPayroll={savingPayroll} onAddPayroll={() => handleAddPayroll(w.id)} isOwner={activeRole === 'owner'} />)}
              </div>
            </div>
          )}
          {former.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-gray-500 mb-2 uppercase tracking-wide">Former</h2>
              <div className="space-y-2">
                {former.map(w => <WorkerCard key={w.id} worker={w} expanded={expandedId === w.id} payroll={payroll[w.id] || []}
                  onToggle={() => toggleExpand(w.id)} showPayrollForm={false} onShowPayrollForm={() => {}}
                  onMarkLeft={() => {}}
                  pDate={pDate} setPDate={setPDate} pAmount={pAmount} setPAmount={setPAmount}
                  pType={pType} setPType={setPType} pPeriodStart={pPeriodStart} setPPeriodStart={setPPeriodStart}
                  pPeriodEnd={pPeriodEnd} setPPeriodEnd={setPPeriodEnd} pNotes={pNotes} setPNotes={setPNotes}
                  savingPayroll={false} onAddPayroll={() => {}} isOwner={false} />)}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function WorkerCard({ worker, expanded, payroll, onToggle, showPayrollForm, onShowPayrollForm, onMarkLeft,
  pDate, setPDate, pAmount, setPAmount, pType, setPType, pPeriodStart, setPPeriodStart,
  pPeriodEnd, setPPeriodEnd, pNotes, setPNotes, savingPayroll, onAddPayroll, isOwner }: any) {
  const fmt = (n: number) => `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const typeBadge = (t: string) => {
    const c: Record<string, string> = { salary: 'bg-blue-100 text-blue-700', bonus: 'bg-green-100 text-green-700', overtime: 'bg-orange-100 text-orange-700', other: 'bg-gray-100 text-gray-700' }
    return <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${c[t] || c.other}`}>{t}</span>
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="flex items-center gap-4 p-4 cursor-pointer hover:bg-gray-50" onClick={onToggle}>
        <div className="w-9 h-9 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
          <span className="text-green-700 font-semibold text-sm">{worker.name.charAt(0).toUpperCase()}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-gray-900">{worker.name}</span>
            {worker.role && <span className="text-xs text-gray-500">{worker.role}</span>}
          </div>
          <p className="text-xs text-gray-400">
            {worker.startDate ? `Started ${worker.startDate}` : 'Start date unknown'}
            {worker.endDate && ` · Left ${worker.endDate}`}
          </p>
        </div>
        <div className="text-right hidden sm:block">
          <p className="text-xs text-gray-400">Total Paid</p>
          <p className="text-sm font-semibold text-gray-800">{fmt(worker.totalPaid)}</p>
        </div>
        {expanded ? <ChevronUp className="w-5 h-5 text-gray-400 flex-shrink-0" /> : <ChevronDown className="w-5 h-5 text-gray-400 flex-shrink-0" />}
      </div>

      {expanded && (
        <div className="border-t border-gray-100 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-700">Payroll History</h3>
            <div className="flex gap-2">
              {!worker.endDate && (
                <button onClick={onShowPayrollForm} className="flex items-center gap-1 px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-medium rounded-lg">
                  <Plus className="w-3 h-3" /> Log Payment
                </button>
              )}
              {isOwner && !worker.endDate && (
                <button onClick={onMarkLeft} className="px-3 py-1 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-medium rounded-lg">Mark Left</button>
              )}
            </div>
          </div>

          {showPayrollForm && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-3">
              <div className="grid grid-cols-3 gap-2 mb-2">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
                  <select value={pType} onChange={e => setPType(e.target.value)} className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs">
                    {PAYROLL_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Date</label>
                  <input type="date" value={pDate} onChange={e => setPDate(e.target.value)} className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Amount (£) *</label>
                  <input type="number" value={pAmount} onChange={e => setPAmount(e.target.value)} className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Period Start</label>
                  <input type="date" value={pPeriodStart} onChange={e => setPPeriodStart(e.target.value)} className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Period End</label>
                  <input type="date" value={pPeriodEnd} onChange={e => setPPeriodEnd(e.target.value)} className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
                  <input value={pNotes} onChange={e => setPNotes(e.target.value)} className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs" />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={onShowPayrollForm} className="px-2 py-1 text-xs text-gray-500 hover:bg-gray-200 rounded">Cancel</button>
                <button onClick={onAddPayroll} disabled={!pAmount || savingPayroll}
                  className="px-3 py-1 bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white text-xs font-medium rounded">
                  {savingPayroll ? 'Saving...' : 'Log'}
                </button>
              </div>
            </div>
          )}

          {payroll.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">No payments logged yet.</p>
          ) : (
            <div className="space-y-2">
              {payroll.map((p: PayrollEvent) => (
                <div key={p.id} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">{typeBadge(p.type)}
                      {(p.periodStart || p.periodEnd) && (
                        <span className="text-xs text-gray-400">{p.periodStart} – {p.periodEnd}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-gray-400">{p.date}</span>
                      {p.notes && <span className="text-xs text-gray-400">· {p.notes}</span>}
                    </div>
                  </div>
                  <span className="text-sm font-semibold text-gray-800">{fmt(p.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
