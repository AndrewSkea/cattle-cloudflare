'use client'

import { useState, useEffect, useCallback } from 'react'
import { apiClient } from '@/lib/api-client'
import { Wrench, Plus, ChevronDown, ChevronUp, Fuel, Hammer, Settings, X, Pencil } from 'lucide-react'

interface Machine {
  id: number
  name: string
  type: string
  make: string | null
  model: string | null
  year: number | null
  purchaseDate: string | null
  purchasePrice: number | null
  status: string
  soldDate: string | null
  salePrice: number | null
  notes: string | null
  totalSpend: number
}

interface MachineEvent {
  id: number
  type: string
  date: string
  cost: number | null
  description: string | null
  notes: string | null
  hoursOrMileage: number | null
}

const MACHINE_TYPES = ['tractor', 'trailer', 'sprayer', 'harvester', 'ATV', 'other']
const EVENT_TYPES = ['fuel', 'repair', 'service', 'other']

const typeBadge = (type: string) => {
  const colors: Record<string, string> = {
    tractor: 'bg-green-100 text-green-700',
    trailer: 'bg-blue-100 text-blue-700',
    sprayer: 'bg-purple-100 text-purple-700',
    harvester: 'bg-yellow-100 text-yellow-700',
    ATV: 'bg-orange-100 text-orange-700',
    other: 'bg-gray-100 text-gray-700',
  }
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${colors[type] || colors.other}`}>{type}</span>
}

const eventIcon = (type: string) => {
  switch (type) {
    case 'fuel': return <Fuel className="w-4 h-4 text-yellow-500" />
    case 'repair': return <Hammer className="w-4 h-4 text-red-500" />
    case 'service': return <Settings className="w-4 h-4 text-blue-500" />
    default: return <Wrench className="w-4 h-4 text-gray-400" />
  }
}

const fmt = (n: number | null) => n != null ? `£${n.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}` : '—'

export default function MachineryPage() {
  const [machines, setMachines] = useState<Machine[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [events, setEvents] = useState<Record<number, MachineEvent[]>>({})
  const [showAddMachine, setShowAddMachine] = useState(false)
  const [showAddEvent, setShowAddEvent] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Machine form
  const [mName, setMName] = useState('')
  const [mType, setMType] = useState('tractor')
  const [mMake, setMMake] = useState('')
  const [mModel, setMModel] = useState('')
  const [mYear, setMYear] = useState('')
  const [mPurchaseDate, setMPurchaseDate] = useState('')
  const [mPurchasePrice, setMPurchasePrice] = useState('')
  const [mSerial, setMSerial] = useState('')
  const [mNotes, setMNotes] = useState('')
  const [saving, setSaving] = useState(false)

  // Event form
  const [eType, setEType] = useState('fuel')
  const [eDate, setEDate] = useState(new Date().toISOString().split('T')[0])
  const [eCost, setECost] = useState('')
  const [eDesc, setEDesc] = useState('')
  const [eHours, setEHours] = useState('')
  const [eNotes, setENotes] = useState('')
  const [savingEvent, setSavingEvent] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res: any = await apiClient.getMachinery()
      setMachines(res.data || [])
    } catch { setError('Failed to load machinery') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const loadEvents = async (machineId: number) => {
    const res: any = await apiClient.getMachineryEvents(machineId)
    setEvents(prev => ({ ...prev, [machineId]: res.data || [] }))
  }

  const toggleExpand = async (id: number) => {
    if (expandedId === id) { setExpandedId(null); return }
    setExpandedId(id)
    if (!events[id]) await loadEvents(id)
  }

  const handleAddMachine = async () => {
    if (!mName.trim()) return
    setSaving(true)
    try {
      await apiClient.createMachinery({
        name: mName.trim(),
        type: mType,
        make: mMake || undefined,
        model: mModel || undefined,
        year: mYear ? Number(mYear) : undefined,
        purchaseDate: mPurchaseDate || undefined,
        purchasePrice: mPurchasePrice ? Number(mPurchasePrice) : undefined,
        serialNumber: mSerial || undefined,
        notes: mNotes || undefined,
      })
      setShowAddMachine(false)
      setMName(''); setMType('tractor'); setMMake(''); setMModel('')
      setMYear(''); setMPurchaseDate(''); setMPurchasePrice(''); setMSerial(''); setMNotes('')
      await load()
    } catch (err: any) { setError(err.message) }
    finally { setSaving(false) }
  }

  const handleAddEvent = async (machineId: number) => {
    if (!eDate) return
    setSavingEvent(true)
    try {
      await apiClient.createMachineryEvent(machineId, {
        type: eType,
        date: eDate,
        cost: eCost ? Number(eCost) : undefined,
        description: eDesc || undefined,
        hoursOrMileage: eHours ? Number(eHours) : undefined,
        notes: eNotes || undefined,
      })
      setShowAddEvent(null)
      setEType('fuel'); setEDate(new Date().toISOString().split('T')[0])
      setECost(''); setEDesc(''); setEHours(''); setENotes('')
      await loadEvents(machineId)
      await load()
    } catch (err: any) { setError(err.message) }
    finally { setSavingEvent(false) }
  }

  const handleDeleteMachine = async (id: number) => {
    if (!confirm('Delete this machine and all its records?')) return
    try {
      await apiClient.deleteMachinery(id)
      await load()
    } catch (err: any) { setError(err.message) }
  }

  if (loading) return (
    <div className="p-6 flex items-center justify-center min-h-64">
      <div className="animate-spin w-8 h-8 border-4 border-green-200 border-t-green-600 rounded-full" />
    </div>
  )

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Machinery</h1>
        <button
          onClick={() => setShowAddMachine(true)}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" /> Add Machine
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
          <p className="text-red-800 text-sm">{error}</p>
        </div>
      )}

      {/* Add Machine Form */}
      {showAddMachine && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">Add Machine</h2>
            <button onClick={() => setShowAddMachine(false)}><X className="w-4 h-4 text-gray-400" /></button>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Name *</label>
              <input value={mName} onChange={e => setMName(e.target.value)} placeholder="e.g. Main Tractor"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-green-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Type *</label>
              <select value={mType} onChange={e => setMType(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                {MACHINE_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Year</label>
              <input type="number" value={mYear} onChange={e => setMYear(e.target.value)} placeholder="e.g. 2019"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Make</label>
              <input value={mMake} onChange={e => setMMake(e.target.value)} placeholder="e.g. John Deere"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Model</label>
              <input value={mModel} onChange={e => setMModel(e.target.value)} placeholder="e.g. 6155R"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Purchase Date</label>
              <input type="date" value={mPurchaseDate} onChange={e => setMPurchaseDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Purchase Price (£)</label>
              <input type="number" value={mPurchasePrice} onChange={e => setMPurchasePrice(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
              <input value={mNotes} onChange={e => setMNotes(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowAddMachine(false)} className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
            <button onClick={handleAddMachine} disabled={!mName.trim() || saving}
              className="px-4 py-1.5 bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white text-sm font-medium rounded-lg">
              {saving ? 'Saving...' : 'Add Machine'}
            </button>
          </div>
        </div>
      )}

      {/* Machine List */}
      {machines.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <Wrench className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No machinery added yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {machines.map(m => (
            <div key={m.id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              {/* Summary row */}
              <div className="flex items-center gap-4 p-4 cursor-pointer hover:bg-gray-50" onClick={() => toggleExpand(m.id)}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-gray-900">{m.name}</span>
                    {typeBadge(m.type)}
                    {m.status !== 'active' && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700 capitalize">{m.status}</span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500">
                    {[m.make, m.model, m.year].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <div className="text-right hidden sm:block">
                  <p className="text-xs text-gray-400">Purchase</p>
                  <p className="text-sm font-medium text-gray-700">{fmt(m.purchasePrice)}</p>
                </div>
                <div className="text-right hidden sm:block">
                  <p className="text-xs text-gray-400">Running Cost</p>
                  <p className="text-sm font-medium text-orange-600">{fmt(m.totalSpend)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={e => { e.stopPropagation(); handleDeleteMachine(m.id) }}
                    className="p-1 text-gray-300 hover:text-red-500 transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                  {expandedId === m.id ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
                </div>
              </div>

              {/* Expanded detail */}
              {expandedId === m.id && (
                <div className="border-t border-gray-100 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-gray-700">Event History</h3>
                    <button
                      onClick={() => setShowAddEvent(showAddEvent === m.id ? null : m.id)}
                      className="flex items-center gap-1 px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-medium rounded-lg"
                    >
                      <Plus className="w-3 h-3" /> Log Event
                    </button>
                  </div>

                  {/* Add Event Form */}
                  {showAddEvent === m.id && (
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-3">
                      <div className="grid grid-cols-3 gap-2 mb-2">
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
                          <select value={eType} onChange={e => setEType(e.target.value)}
                            className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs">
                            {EVENT_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Date</label>
                          <input type="date" value={eDate} onChange={e => setEDate(e.target.value)}
                            className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Cost (£)</label>
                          <input type="number" value={eCost} onChange={e => setECost(e.target.value)}
                            className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs" />
                        </div>
                        <div className="col-span-2">
                          <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
                          <input value={eDesc} onChange={e => setEDesc(e.target.value)}
                            className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Hours/Miles</label>
                          <input type="number" value={eHours} onChange={e => setEHours(e.target.value)}
                            className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs" />
                        </div>
                      </div>
                      <div className="flex justify-end gap-2">
                        <button onClick={() => setShowAddEvent(null)} className="px-2 py-1 text-xs text-gray-500 hover:bg-gray-200 rounded">Cancel</button>
                        <button onClick={() => handleAddEvent(m.id)} disabled={savingEvent}
                          className="px-3 py-1 bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white text-xs font-medium rounded">
                          {savingEvent ? 'Saving...' : 'Log'}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Event list */}
                  {(events[m.id] || []).length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-4">No events logged yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {(events[m.id] || []).map(e => (
                        <div key={e.id} className="flex items-start gap-3 py-2 border-b border-gray-50 last:border-0">
                          <div className="mt-0.5">{eventIcon(e.type)}</div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium capitalize text-gray-700">{e.type}</span>
                              {e.description && <span className="text-xs text-gray-500">— {e.description}</span>}
                            </div>
                            <div className="flex items-center gap-3 mt-0.5">
                              <span className="text-xs text-gray-400">{e.date}</span>
                              {e.hoursOrMileage && <span className="text-xs text-gray-400">{e.hoursOrMileage} hrs</span>}
                              {e.notes && <span className="text-xs text-gray-400 truncate">{e.notes}</span>}
                            </div>
                          </div>
                          {e.cost != null && (
                            <span className="text-sm font-semibold text-gray-800 flex-shrink-0">{fmt(e.cost)}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
