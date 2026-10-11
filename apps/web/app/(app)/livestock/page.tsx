'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import Papa from 'papaparse'
import { ArrowDown, ArrowUp, Download, FileUp, Hash, HeartPulse, MoveRight, PawPrint, Plus, Search, ShieldAlert, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge, Card, EmptyState, PageHeader, Skeleton } from '@/components/ui/display'
import { FormError, Segmented, Select } from '@/components/ui/form'
import { Sheet } from '@/components/ui/overlay'
import { AnimalSheet, HealthSheet, MoveSheet, RenumberSheet } from '@/components/forms/livestock-forms'
import { api, useAnimalOptions, useAnimals, useSave } from '@/lib/queries'
import { CATEGORY_LABELS, SPECIES, STATUS_META, categorySingular, speciesInfo } from '@/lib/constants'
import { downloadUrl, fmtAge, fmtDate, fmtNum } from '@/lib/format'
import { useSession } from '@/lib/session'
import { cn } from '@/lib/utils'
import type { AnimalListItem } from '@/lib/types'

type SortKey = 'tag' | 'category' | 'breed' | 'age' | 'dam' | 'location' | 'weight' | 'offspring'
const PAGE = 100

function LivestockInner() {
  const { farm, can } = useSession()
  const params = useSearchParams()
  const router = useRouter()
  const [status, setStatus] = useState<'active' | 'exited' | 'all'>((params.get('status') as any) || 'active')
  const { data: animals, isLoading } = useAnimals(status)
  const [species, setSpecies] = useState<string>(params.get('species') || '')
  const [category, setCategory] = useState<string>(params.get('category') || '')
  const [q, setQ] = useState('')
  const [sex, setSex] = useState('')
  const [breed, setBreed] = useState('')
  const [location, setLocation] = useState(params.get('location') || '')
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'tag', dir: 1 })
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [limit, setLimit] = useState(PAGE)
  const [sheet, setSheet] = useState<null | 'add' | 'move' | 'treat' | 'import' | 'renumber'>(null)
  const { data: options = [] } = useAnimalOptions()
  const formerTags = useMemo(() => new Map(options.map((o) => [o.id, o.formerTags || ''])), [options])

  // Keep species/category in the URL so dashboard links and back/forward work.
  useEffect(() => {
    const p = new URLSearchParams()
    if (species) p.set('species', species)
    if (category) p.set('category', category)
    if (status !== 'active') p.set('status', status)
    router.replace(`/livestock${p.toString() ? `?${p}` : ''}`, { scroll: false })
  }, [species, category, status, router])

  const all = animals || []
  const speciesTabs = useMemo(() => {
    const counts = new Map<string, number>()
    for (const a of all) counts.set(a.species, (counts.get(a.species) || 0) + 1)
    const keys = new Set([...farm.species, ...counts.keys()])
    return SPECIES.filter((s) => keys.has(s.value)).map((s) => ({ ...s, count: counts.get(s.value) || 0 }))
  }, [all, farm.species])

  const inSpecies = species ? all.filter((a) => a.species === species) : all
  const categories = useMemo(() => {
    const m = new Map<string, number>()
    for (const a of inSpecies) m.set(a.category, (m.get(a.category) || 0) + 1)
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [inSpecies])
  const breeds = useMemo(() => [...new Set(inSpecies.map((a) => a.breed).filter(Boolean) as string[])].sort(), [inSpecies])
  const locations = useMemo(() => [...new Set(inSpecies.map((a) => a.parcelName || a.structureName).filter(Boolean) as string[])].sort(), [inSpecies])

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase()
    const list = inSpecies.filter((a) =>
      (!category || a.category === category) && (!sex || a.sex === sex) && (!breed || a.breed === breed)
      && (!location || (location === '__none' ? !a.parcelName && !a.structureName : a.parcelName === location || a.structureName === location))
      && (!s || `${a.tagNo} ${a.managementTag || ''} ${a.name || ''} ${a.breed || ''} ${a.damTag || ''} ${formerTags.get(a.id) || ''}`.toLowerCase().includes(s)))
    const val = (a: AnimalListItem): string | number => {
      switch (sort.key) {
        case 'tag': return a.managementTag || a.tagNo
        case 'category': return a.category
        case 'breed': return a.breed || '~'
        case 'age': return a.ageMonths ?? -1
        case 'dam': return a.damTag || '~'
        case 'location': return a.parcelName || a.structureName || '~'
        case 'weight': return a.latestWeightKg ?? -1
        case 'offspring': return a.offspringCount
      }
    }
    return [...list].sort((x, y) => {
      const a = val(x), b = val(y)
      const c = typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b), undefined, { numeric: true })
      return c * sort.dir
    })
  }, [inSpecies, q, category, sex, breed, location, sort, formerTags])

  const toggle = (id: number) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id))
  const filtersActive = !!(q || sex || breed || location || category)

  const Th = ({ k, children, className }: { k: SortKey; children: React.ReactNode; className?: string }) => (
    <th className={cn('px-3 py-2.5 text-left text-xs font-medium text-stone-500', className)}>
      <button className="inline-flex items-center gap-1 hover:text-stone-900" onClick={() => setSort((s) => ({ key: k, dir: s.key === k ? (-s.dir as 1 | -1) : 1 }))}>
        {children}{sort.key === k && (sort.dir === 1 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
      </button>
    </th>
  )

  return (
    <div>
      <PageHeader title="Animals" description={`${fmtNum(all.filter((a) => a.status === 'active').length)} on farm`}
        actions={<>
          <Button variant="secondary" onClick={() => downloadUrl(api.url('/api/animals/export'))}><Download />Export</Button>
          {can('worker') && <Button variant="secondary" onClick={() => setSheet('import')}><FileUp />Import</Button>}
          {can('worker') && <Button variant="secondary" onClick={() => setSheet('renumber')}><Hash />Renumber</Button>}
          {can('worker') && <Button onClick={() => setSheet('add')}><Plus />Add animal</Button>}
        </>}
      />

      {speciesTabs.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-2">
          <button onClick={() => { setSpecies(''); setCategory('') }} className={cn('rounded-full px-3.5 py-1.5 text-sm font-medium ring-1 transition', !species ? 'bg-brand-800 text-white ring-brand-800' : 'bg-white text-stone-600 ring-stone-200 hover:ring-stone-300')}>All <span className="ml-1 opacity-70">{all.length}</span></button>
          {speciesTabs.map((s) => (
            <button key={s.value} onClick={() => { setSpecies(s.value); setCategory('') }}
              className={cn('rounded-full px-3.5 py-1.5 text-sm font-medium ring-1 transition', species === s.value ? 'bg-brand-800 text-white ring-brand-800' : 'bg-white text-stone-600 ring-stone-200 hover:ring-stone-300')}>
              {s.emoji} {s.plural} <span className="ml-1 opacity-70">{s.count}</span>
            </button>
          ))}
        </div>
      )}

      <Card>
        <div className="space-y-3 border-b border-stone-100 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-stone-400" />
              <input value={q} onChange={(e) => { setQ(e.target.value); setLimit(PAGE) }} placeholder="Search tag, name, breed or dam…" aria-label="Search animals"
                className="h-9 w-full rounded-lg border-0 bg-stone-50 pl-9 pr-3 text-sm ring-1 ring-inset ring-stone-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={sex} onChange={(e) => setSex(e.target.value)} className="w-28" aria-label="Sex"><option value="">Any sex</option><option value="female">Female</option><option value="male">Male</option></Select>
              <Select value={breed} onChange={(e) => setBreed(e.target.value)} className="w-40" aria-label="Breed"><option value="">All breeds</option>{breeds.map((b) => <option key={b}>{b}</option>)}</Select>
              <Select value={location} onChange={(e) => setLocation(e.target.value)} className="w-40" aria-label="Location"><option value="">Anywhere</option><option value="__none">No location</option>{locations.map((b) => <option key={b}>{b}</option>)}</Select>
              <Segmented size="sm" value={status} onChange={(v) => { setStatus(v); setSelected(new Set()) }} options={[{ value: 'active', label: 'On farm' }, { value: 'exited', label: 'Gone' }, { value: 'all', label: 'All' }]} />
            </div>
          </div>
          {categories.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <button onClick={() => setCategory('')} className={cn('rounded-md px-2.5 py-1 text-xs font-medium transition', !category ? 'bg-stone-800 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200')}>All classes</button>
              {categories.map(([c, n]) => (
                <button key={c} onClick={() => setCategory(category === c ? '' : c)} className={cn('rounded-md px-2.5 py-1 text-xs font-medium transition', category === c ? 'bg-stone-800 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200')}>
                  {CATEGORY_LABELS[c] || c} <span className="opacity-60">{n}</span>
                </button>
              ))}
              {filtersActive && <button onClick={() => { setQ(''); setSex(''); setBreed(''); setLocation(''); setCategory('') }} className="ml-1 inline-flex items-center gap-1 text-xs text-stone-500 hover:text-stone-800"><X className="size-3" />Clear filters</button>}
            </div>
          )}
        </div>

        {selected.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-b border-brand-100 bg-brand-50/70 px-4 py-2.5">
            <span className="text-sm font-medium text-brand-900">{selected.size} selected</span>
            {can('worker') && <Button size="sm" variant="secondary" onClick={() => setSheet('move')}><MoveRight />Move</Button>}
            {can('worker') && <Button size="sm" variant="secondary" onClick={() => setSheet('treat')}><HeartPulse />Treat / vaccinate</Button>}
            {can('worker') && <Button size="sm" variant="secondary" onClick={() => setSheet('renumber')}><Hash />Renumber</Button>}
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
          </div>
        )}

        {isLoading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
        ) : rows.length === 0 ? (
          <EmptyState icon={PawPrint} title={all.length ? 'No animals match' : 'No animals yet'}
            description={all.length ? 'Try a different search or clear the filters.' : 'Add your first animal, or import a spreadsheet.'}
            action={!all.length && can('worker') && <Button onClick={() => setSheet('add')}><Plus />Add animal</Button>} />
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead className="border-b border-stone-100 bg-stone-50/60">
                  <tr>
                    <th className="w-10 px-3 py-2.5"><input type="checkbox" aria-label="Select all" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)))} className="size-4 rounded border-stone-300 text-brand-700 focus:ring-brand-500" /></th>
                    <Th k="tag">Tag</Th><Th k="category">Class</Th><Th k="breed">Breed</Th><Th k="age">Age</Th><Th k="dam">Dam</Th>
                    <Th k="location">Location</Th><Th k="weight" className="text-right">Weight</Th><Th k="offspring" className="text-right">Offspring</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {rows.slice(0, limit).map((a) => (
                    <tr key={a.id} className={cn('group transition hover:bg-stone-50', selected.has(a.id) && 'bg-brand-50/40')}>
                      <td className="px-3 py-2.5"><input type="checkbox" aria-label={`Select ${a.tagNo}`} checked={selected.has(a.id)} onChange={() => toggle(a.id)} className="size-4 rounded border-stone-300 text-brand-700 focus:ring-brand-500" /></td>
                      <td className="px-3 py-2.5">
                        <Link href={`/livestock/view?id=${a.id}`} className="block">
                          <span className="font-semibold text-stone-900 group-hover:text-brand-700">{a.managementTag || a.tagNo}</span>
                          {a.name && <span className="ml-1.5 text-stone-500">{a.name}</span>}
                          <span className="block text-xs text-stone-400">{a.managementTag ? a.tagNo : speciesInfo(a.species).label}</span>
                        </Link>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <Badge tone={a.sex === 'female' ? 'violet' : 'blue'}>{categorySingular(a.category)}</Badge>
                          {a.status !== 'active' && <Badge tone={STATUS_META[a.status].tone}>{STATUS_META[a.status].label}</Badge>}
                          {a.withdrawalUntil && <span title={`Withdrawal until ${fmtDate(a.withdrawalUntil)}`}><ShieldAlert className="size-4 text-amber-600" /></span>}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-stone-600">{a.breed || '—'}</td>
                      <td className="px-3 py-2.5 text-stone-600 tabular">{fmtAge(a.ageMonths)}</td>
                      <td className="px-3 py-2.5">{a.damId ? <Link href={`/livestock/view?id=${a.damId}`} className="text-stone-600 hover:text-brand-700 hover:underline">{a.damTag}</Link> : <span className="text-stone-300">—</span>}</td>
                      <td className="px-3 py-2.5 text-stone-600">{a.status !== 'active' ? <span className="text-stone-400">{fmtDate(a.exitDate)}</span> : a.parcelName || a.structureName || <span className="text-stone-300">—</span>}</td>
                      <td className="px-3 py-2.5 text-right text-stone-600 tabular">{a.latestWeightKg ? `${fmtNum(a.latestWeightKg)} kg` : '—'}</td>
                      <td className="px-3 py-2.5 text-right text-stone-600 tabular">{a.offspringCount || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="divide-y divide-stone-100 md:hidden">
              {rows.slice(0, limit).map((a) => (
                <li key={a.id} className="flex items-center gap-3 px-4 py-3">
                  <input type="checkbox" aria-label={`Select ${a.tagNo}`} checked={selected.has(a.id)} onChange={() => toggle(a.id)} className="size-4 rounded border-stone-300 text-brand-700" />
                  <Link href={`/livestock/view?id=${a.id}`} className="min-w-0 flex-1">
                    <p className="font-semibold text-stone-900">{a.managementTag || a.tagNo}{a.name && <span className="ml-1.5 font-normal text-stone-500">{a.name}</span>}</p>
                    <p className="truncate text-xs text-stone-500">{[categorySingular(a.category), a.breed, fmtAge(a.ageMonths), a.parcelName].filter(Boolean).join(' · ')}</p>
                  </Link>
                  {a.status !== 'active' && <Badge tone={STATUS_META[a.status].tone}>{STATUS_META[a.status].label}</Badge>}
                </li>
              ))}
            </ul>
            <div className="flex items-center justify-between border-t border-stone-100 px-4 py-3 text-xs text-stone-500">
              <span>Showing {Math.min(limit, rows.length)} of {rows.length}</span>
              {rows.length > limit && <Button size="sm" variant="secondary" onClick={() => setLimit((l) => l + PAGE * 2)}>Show more</Button>}
            </div>
          </>
        )}
      </Card>

      {sheet === 'add' && <AnimalSheet open onClose={() => setSheet(null)} defaults={species ? { species: species as any } : undefined} />}
      {sheet === 'move' && <MoveSheet open onClose={() => { setSheet(null); setSelected(new Set()) }} animalIds={[...selected]} />}
      {sheet === 'treat' && <HealthSheet open onClose={() => { setSheet(null); setSelected(new Set()) }} animalIds={[...selected]} />}
      {sheet === 'import' && <ImportSheet onClose={() => setSheet(null)} />}
      {sheet === 'renumber' && <RenumberSheet open onClose={() => { setSheet(null); setSelected(new Set()) }} animalIds={[...selected]} />}
    </div>
  )
}

const FIELD_ALIASES: Record<string, string[]> = {
  tagNo: ['tag', 'tagno', 'tag no', 'tag number', 'ear tag', 'eid', 'id', 'official tag', 'uk tag'],
  managementTag: ['management tag', 'managementtag', 'mgmt tag', 'herd number', 'herd no', 'number'],
  name: ['name'],
  species: ['species', 'type'],
  sex: ['sex', 'gender'],
  breed: ['breed'],
  dob: ['dob', 'date of birth', 'birth date', 'born'],
  damTag: ['dam', 'dam tag', 'mother', 'damtag'],
  sireTag: ['sire tag', 'siretag'],
  sireName: ['sire', 'sire name', 'father', 'bull'],
  notes: ['notes', 'comments'],
}

function normaliseDate(v: string): string | null {
  const s = v.trim()
  if (!s) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/)
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3]
    return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  }
  return null
}

function ImportSheet({ onClose }: { onClose: () => void }) {
  const [rows, setRows] = useState<Record<string, any>[]>([])
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ created: number; errors: string[] } | null>(null)
  const save = useSave((body: any) => api.post<{ created: number; errors: string[] }>('/api/animals/import', body), {
    invalidate: ['animals', 'families'], silentError: true, onSuccess: (r) => setResult(r),
  })

  const onFile = (file: File) => {
    setError(null); setResult(null)
    Papa.parse<Record<string, string>>(file, {
      header: true, skipEmptyLines: true,
      complete: (res) => {
        const headers = res.meta.fields || []
        const map: Record<string, string> = {}
        for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
          const h = headers.find((x) => aliases.includes(x.trim().toLowerCase()))
          if (h) map[field] = h
        }
        if (!map.tagNo) setError('Could not find a tag column. Name it "Tag".')
        setMapping(map)
        setRows(res.data)
      },
      error: (e) => setError(e.message),
    })
  }

  const submit = () => {
    const out = rows.map((r) => {
      const get = (f: string) => (mapping[f] ? String(r[mapping[f]] ?? '').trim() : '')
      return {
        tagNo: get('tagNo'), managementTag: get('managementTag') || null, name: get('name') || null,
        species: (SPECIES.find((s) => s.value === get('species').toLowerCase())?.value) || 'cattle',
        sex: get('sex') || 'female', breed: get('breed') || null, dob: normaliseDate(get('dob')),
        damTag: get('damTag') || null, sireTag: get('sireTag') || null, sireName: get('sireName') || null, notes: get('notes') || null,
      }
    }).filter((r) => r.tagNo)
    if (!out.length) return setError('No rows with a tag found')
    save.mutate({ rows: out }, { onError: (e) => setError(e.message) })
  }

  return (
    <Sheet open onClose={onClose} wide title="Import animals" description="Upload a CSV exported from a spreadsheet. One row per animal."
      footer={result ? <Button onClick={onClose}>Done</Button> : <><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={submit} disabled={!rows.length || !mapping.tagNo} loading={save.isPending}>Import {rows.length || ''} rows</Button></>}>
      {result ? (
        <div className="space-y-4">
          <div className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800 ring-1 ring-emerald-200">Imported <strong>{result.created}</strong> animals.</div>
          {result.errors.length > 0 && (
            <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200">
              <p className="font-medium">{result.errors.length} notes</p>
              <ul className="mt-2 max-h-64 list-disc space-y-0.5 overflow-y-auto pl-5 text-xs">{result.errors.map((e) => <li key={e}>{e}</li>)}</ul>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-5">
          <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-stone-300 bg-stone-50 px-6 py-10 text-center transition hover:border-brand-400 hover:bg-brand-50/40">
            <FileUp className="size-8 text-stone-400" />
            <span className="mt-3 text-sm font-medium text-stone-800">Choose a CSV file</span>
            <span className="mt-1 text-xs text-stone-500">Columns: Tag, Management tag, Name, Species, Sex, Breed, DOB, Dam, Sire</span>
            <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
          </label>
          {rows.length > 0 && (
            <div>
              <p className="mb-2 text-sm font-medium text-stone-800">{rows.length} rows found. Columns matched:</p>
              <div className="flex flex-wrap gap-1.5">
                {Object.keys(FIELD_ALIASES).map((f) => <Badge key={f} tone={mapping[f] ? 'green' : 'gray'}>{f}{mapping[f] ? ` ← ${mapping[f]}` : ''}</Badge>)}
              </div>
              <p className="mt-3 text-xs text-stone-500">Existing tags are skipped. Dams and sires are matched by tag after import.</p>
            </div>
          )}
          <FormError error={error} />
        </div>
      )}
    </Sheet>
  )
}

export default function LivestockPage() {
  return <Suspense><LivestockInner /></Suspense>
}
