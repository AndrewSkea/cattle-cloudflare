'use client'

import { useState, useEffect, useCallback } from 'react'
import { apiClient } from '@/lib/api-client'
import { ShoppingCart, Plus, X, Leaf, Sprout, Syringe, Fuel, Package } from 'lucide-react'

interface Supply {
  id: number
  category: string
  name: string
  date: string
  quantity: number | null
  unit: string | null
  unitCost: number | null
  totalCost: number
  supplier: string | null
  fieldId: number | null
  notes: string | null
}

interface Field {
  id: number
  name: string
}

const CATEGORIES = ['all', 'fertiliser', 'seed', 'medicine', 'vaccine', 'fuel', 'other']

const categoryIcon = (cat: string) => {
  switch (cat) {
    case 'fertiliser': return <Leaf className="w-4 h-4 text-green-500" />
    case 'seed': return <Sprout className="w-4 h-4 text-lime-500" />
    case 'medicine': return <Syringe className="w-4 h-4 text-blue-500" />
    case 'vaccine': return <Syringe className="w-4 h-4 text-purple-500" />
    case 'fuel': return <Fuel className="w-4 h-4 text-yellow-500" />
    default: return <Package className="w-4 h-4 text-gray-400" />
  }
}

const categoryBadge = (cat: string) => {
  const colors: Record<string, string> = {
    fertiliser: 'bg-green-100 text-green-700',
    seed: 'bg-lime-100 text-lime-700',
    medicine: 'bg-blue-100 text-blue-700',
    vaccine: 'bg-purple-100 text-purple-700',
    fuel: 'bg-yellow-100 text-yellow-700',
    other: 'bg-gray-100 text-gray-700',
  }
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${colors[cat] || colors.other}`}>{cat}</span>
}

const fmt = (n: number) => `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export default function SuppliesPage() {
  const [supplies, setSupplies] = useState<Supply[]>([])
  const [fields, setFields] = useState<Field[]>([])
  const [activeFilter, setActiveFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Form state
  const [fCategory, setFCategory] = useState('fertiliser')
  const [fName, setFName] = useState('')
  const [fDate, setFDate] = useState(new Date().toISOString().split('T')[0])
  const [fQty, setFQty] = useState('')
  const [fUnit, setFUnit] = useState('kg')
  const [fUnitCost, setFUnitCost] = useState('')
  const [fTotalCost, setFTotalCost] = useState('')
  const [fSupplier, setFSupplier] = useState('')
  const [fFieldId, setFFieldId] = useState('')
  const [fNotes, setFNotes] = useState('')

  // Auto-calculate total when qty and unit cost change
  useEffect(() => {
    if (fQty && fUnitCost) {
      setFTotalCost((Number(fQty) * Number(fUnitCost)).toFixed(2))
    }
  }, [fQty, fUnitCost])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [supRes, fieldRes]: any[] = await Promise.all([
        apiClient.getSupplies(activeFilter !== 'all' ? { category: activeFilter } : undefined),
        apiClient.getFields ? apiClient.getFields() : Promise.resolve({ data: [] }),
      ])
      setSupplies(supRes.data || [])
      setFields((fieldRes.data || []).map((f: any) => ({ id: f.id, name: f.name })))
    } catch { setError('Failed to load supplies') }
    finally { setLoading(false) }
  }, [activeFilter])

  useEffect(() => { load() }, [load])

  const handleAdd = async () => {
    if (!fName.trim() || !fTotalCost) return
    setSaving(true)
    try {
      await apiClient.createSupply({
        category: fCategory,
        name: fName.trim(),
        date: fDate,
        totalCost: Number(fTotalCost),
        quantity: fQty ? Number(fQty) : undefined,
        unit: fUnit || undefined,
        unitCost: fUnitCost ? Number(fUnitCost) : undefined,
        supplier: fSupplier || undefined,
        fieldId: fFieldId ? Number(fFieldId) : undefined,
        notes: fNotes || undefined,
      })
      setShowAdd(false)
      setFCategory('fertiliser'); setFName(''); setFDate(new Date().toISOString().split('T')[0])
      setFQty(''); setFUnit('kg'); setFUnitCost(''); setFTotalCost(''); setFSupplier(''); setFFieldId(''); setFNotes('')
      await load()
    } catch (err: any) { setError(err.message) }
    finally { setSaving(false) }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this purchase record?')) return
    try {
      await apiClient.deleteSupply(id)
      await load()
    } catch (err: any) { setError(err.message) }
  }

  const totalCost = supplies.reduce((s, p) => s + p.totalCost, 0)

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Supplies</h1>
          <p className="text-sm text-gray-500 mt-1">
            {activeFilter === 'all' ? 'All purchases' : `${activeFilter} purchases`} — total: {fmt(totalCost)}
          </p>
        </div>
        <button onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg">
          <Plus className="w-4 h-4" /> Log Purchase
        </button>
      </div>

      {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-red-800 text-sm">{error}</div>}

      {/* Filter chips */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {CATEGORIES.map(cat => (
          <button key={cat} onClick={() => setActiveFilter(cat)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              activeFilter === cat ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}>
            {cat !== 'all' && categoryIcon(cat)}
            <span className="capitalize">{cat}</span>
          </button>
        ))}
      </div>

      {/* Add Form */}
      {showAdd && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">Log Purchase</h2>
            <button onClick={() => setShowAdd(false)}><X className="w-4 h-4 text-gray-400" /></button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Category *</label>
              <select value={fCategory} onChange={e => setFCategory(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                {CATEGORIES.filter(c => c !== 'all').map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Name *</label>
              <input value={fName} onChange={e => setFName(e.target.value)} placeholder="e.g. NPK 20-10-10 Fertiliser"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Date *</label>
              <input type="date" value={fDate} onChange={e => setFDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Quantity</label>
              <input type="number" value={fQty} onChange={e => setFQty(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Unit</label>
              <select value={fUnit} onChange={e => setFUnit(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                {['kg', 'L', 'tonnes', 'bags', 'units'].map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Unit Cost (£)</label>
              <input type="number" step="0.01" value={fUnitCost} onChange={e => setFUnitCost(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Total Cost (£) *</label>
              <input type="number" step="0.01" value={fTotalCost} onChange={e => setFTotalCost(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Supplier</label>
              <input value={fSupplier} onChange={e => setFSupplier(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            </div>
            {fields.length > 0 && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Field (optional)</label>
                <select value={fFieldId} onChange={e => setFFieldId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                  <option value="">No field</option>
                  {fields.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </div>
            )}
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
              <input value={fNotes} onChange={e => setFNotes(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowAdd(false)} className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
            <button onClick={handleAdd} disabled={!fName.trim() || !fTotalCost || saving}
              className="px-4 py-1.5 bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white text-sm font-medium rounded-lg">
              {saving ? 'Saving...' : 'Log Purchase'}
            </button>
          </div>
        </div>
      )}

      {/* Supply list */}
      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin w-8 h-8 border-4 border-green-200 border-t-green-600 rounded-full" /></div>
      ) : supplies.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <ShoppingCart className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No purchases recorded yet.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left py-3 px-4 font-medium text-gray-500">Date</th>
                <th className="text-left py-3 px-4 font-medium text-gray-500">Item</th>
                <th className="text-left py-3 px-4 font-medium text-gray-500 hidden sm:table-cell">Quantity</th>
                <th className="text-left py-3 px-4 font-medium text-gray-500 hidden md:table-cell">Supplier</th>
                <th className="text-right py-3 px-4 font-medium text-gray-500">Cost</th>
                <th className="py-3 px-4"></th>
              </tr>
            </thead>
            <tbody>
              {supplies.map(s => (
                <tr key={s.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-3 px-4 text-gray-500 text-xs">{s.date}</td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      {categoryIcon(s.category)}
                      <div>
                        <p className="font-medium text-gray-900">{s.name}</p>
                        <div className="flex items-center gap-1 mt-0.5">{categoryBadge(s.category)}</div>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-gray-500 hidden sm:table-cell">
                    {s.quantity != null ? `${s.quantity} ${s.unit || ''}` : '—'}
                  </td>
                  <td className="py-3 px-4 text-gray-500 hidden md:table-cell">{s.supplier || '—'}</td>
                  <td className="py-3 px-4 text-right font-semibold text-gray-800">{fmt(s.totalCost)}</td>
                  <td className="py-3 px-4">
                    <button onClick={() => handleDelete(s.id)} className="p-1 text-gray-300 hover:text-red-500 transition-colors">
                      <X className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
