'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, Check, CheckCircle2, FileText, Loader2, PlusCircle, ScanLine, Upload, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/display'
import { FormError, Segmented } from '@/components/ui/form'
import { Modal, useConfirm } from '@/components/ui/overlay'
import { ApiError, getData } from '@/lib/api'
import { api, useSave } from '@/lib/queries'
import { fmtDate, fmtMoney, fmtNum, titleCase } from '@/lib/format'
import { readStatementFile, type ReadResult } from '@/lib/ocr'
import { applyMode, fromFileName, reconcile, type PriceMode, type StatementRow } from '@/lib/sale-statement'
import { cn } from '@/lib/utils'

// ---------------- Drop zone ----------------

const accept = 'application/pdf,.pdf,image/jpeg,image/png'
const isStatementFile = (f: File) => /pdf$/i.test(f.type) || /\.pdf$/i.test(f.name) || /^image\/(jpeg|png)$/.test(f.type)

/** Card to drop (or choose) the mart's PDF; while it is on screen, dropping a PDF anywhere on the page works too. */
export function SaleStatementDrop({ onFile, compact }: { onFile: (f: File) => void; compact?: boolean }) {
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const [pageDrag, setPageDrag] = useState(false)

  useEffect(() => {
    let depth = 0
    const hasFiles = (e: DragEvent) => !!e.dataTransfer && [...e.dataTransfer.types].includes('Files')
    const enter = (e: DragEvent) => { if (!hasFiles(e)) return; depth++; setPageDrag(true) }
    const leave = (e: DragEvent) => { if (!hasFiles(e)) return; depth = Math.max(0, depth - 1); if (!depth) setPageDrag(false) }
    const overFn = (e: DragEvent) => { if (hasFiles(e)) e.preventDefault() }
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      depth = 0
      setPageDrag(false)
      const f = [...(e.dataTransfer?.files || [])].find(isStatementFile)
      if (f) onFile(f)
    }
    window.addEventListener('dragenter', enter)
    window.addEventListener('dragleave', leave)
    window.addEventListener('dragover', overFn)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragenter', enter)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('dragover', overFn)
      window.removeEventListener('drop', drop)
    }
  }, [onFile])

  return (
    <>
      <button type="button" id="statement" onClick={() => input.current?.click()}
        onDragOver={() => setOver(true)} onDragLeave={() => setOver(false)} onDrop={() => setOver(false)}
        className={cn('group flex w-full items-center gap-4 rounded-2xl border-2 border-dashed px-5 text-left transition',
          compact ? 'py-3' : 'py-5', over ? 'border-brand-500 bg-brand-50' : 'border-stone-300 bg-white hover:border-brand-400 hover:bg-brand-50/40')}>
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-700 text-white"><Upload className="size-5" /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold text-stone-900">Import a sale statement</span>
          <span className="block text-sm text-stone-500">Drop the PDF the mart emails you after a sale (the sellers list) here, or tap to choose it. You check everything before it&rsquo;s saved.</span>
        </span>
        <span className="hidden shrink-0 rounded-lg bg-stone-100 px-3 py-1.5 text-sm font-medium text-stone-700 group-hover:bg-white sm:block">Choose PDF</span>
      </button>
      <input ref={input} type="file" accept={accept} className="hidden" aria-label="Sale statement PDF"
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onFile(f) }} />
      {pageDrag && (
        <div className="pointer-events-none fixed inset-0 z-[70] grid place-items-center bg-brand-900/40 p-6 backdrop-blur-sm">
          <div className="rounded-3xl border-2 border-dashed border-white bg-brand-800/90 px-10 py-12 text-center text-white shadow-pop">
            <Upload className="mx-auto size-10" />
            <p className="mt-4 font-display text-2xl font-semibold">Drop the sale statement</p>
            <p className="mt-1 text-sm text-brand-100">The PDF from the mart — you&rsquo;ll check it before anything is saved</p>
          </div>
        </div>
      )}
    </>
  )
}

// ---------------- Reading + confirming ----------------

interface PreviewRow {
  tag: string
  tagOk: boolean
  tagIssue: string | null
  animal: { id: number; tagNo: string; managementTag: string | null; name: string | null; sex: string; castrated: boolean; breed: string | null; dob: string | null; status: string } | null
  suggestions: { id: number; tagNo: string; managementTag: string | null; dob: string | null; status: string }[]
  withdrawal: string | null
  issues: { level: 'error' | 'warn'; text: string }[]
}
interface HerdOption { id: number; tagNo: string; managementTag: string | null; dob: string | null; sex: string; status: string }

type Choice = { kind: 'animal'; id: number } | { kind: 'create' } | { kind: 'skip' }

interface Line extends StatementRow {
  key: string
  choice: Choice
  editedPrice: string | null
  editedWeight: string | null
}

const SEX_LABEL: Record<string, string> = { STR: 'Steer', HFR: 'Heifer', BUL: 'Bull', BULL: 'Bull', COW: 'Cow' }

/** Reads the file, then shows the one-step check. */
export function SaleStatementImport({ file, onClose }: { file: File; onClose: () => void }) {
  const [read, setRead] = useState<ReadResult | null>(null)
  const [progress, setProgress] = useState<{ message: string; fraction?: number }>({ message: 'Opening the file…' })
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    readStatementFile(file, (message, fraction) => live && setProgress({ message, fraction }))
      .then((r) => live && setRead(r))
      .catch((e: Error) => live && setError(e.message || 'Couldn’t read that file'))
    return () => { live = false }
  }, [file])

  if (!read) {
    return (
      <Modal open onClose={onClose} title={error ? 'Couldn’t read the statement' : 'Reading the sale statement'} size="md"
        description={error ? undefined : <>Reading <strong className="font-medium text-stone-800">{file.name}</strong> on this device — it isn&rsquo;t uploaded anywhere.</>}
        footer={<Button variant="secondary" onClick={onClose}>{error ? 'Close' : 'Cancel'}</Button>}>
        {error ? (
          <div className="flex items-start gap-3 rounded-xl bg-clay-50 p-4 text-sm text-clay-800"><XCircle className="mt-0.5 size-5 shrink-0" />{error}</div>
        ) : (
          <div className="space-y-3" role="status">
            <div className="flex items-center gap-3 text-sm text-stone-700"><Loader2 className="size-5 animate-spin text-brand-700" />{progress.message}</div>
            <div className="h-2 overflow-hidden rounded-full bg-stone-100">
              <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${Math.round((progress.fraction ?? 0.05) * 100)}%` }} />
            </div>
            <p className="text-xs text-stone-500">The first time takes a little longer while the reader downloads.</p>
          </div>
        )}
      </Modal>
    )
  }
  return <ConfirmStatement file={file} read={read} onClose={onClose} />
}

function ConfirmStatement({ file, read, onClose }: { file: File; read: ReadResult; onClose: () => void }) {
  const confirm = useConfirm()
  const st = useMemo(() => {
    const named = fromFileName(file.name)
    return { ...read.statement, saleRef: read.statement.saleRef ?? named.saleRef, date: read.statement.date ?? named.date }
  }, [read, file.name])
  const auto = useMemo(() => reconcile(st), [st])
  const [mode, setMode] = useState<PriceMode>(auto.mode)
  const [date, setDate] = useState(st.date ?? '')
  const [charges, setCharges] = useState({
    commission: abs(st.totals.commission), insurance: abs(st.totals.insurance), vat: abs(st.totals.vat), other: abs(st.totals.other),
  })
  const [showOriginal, setShowOriginal] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ sold: number; created: number; reportLots: number } | null>(null)

  const preview = useQuery({
    queryKey: ['sale-statement-preview', file.name, file.size, date],
    queryFn: () => api.post<{ data: { rows: PreviewRow[]; alreadyImported: { id: number; saleRef: string | null }[] } }>('/api/sale-statements/preview', {
      date: date || new Date().toISOString().slice(0, 10),
      rows: st.rows.map((r) => ({ tag: r.tag, sex: r.sexCode, breedCode: r.breedCode, dob: r.dob })),
    }).then((r) => r.data),
    staleTime: Infinity,
  })
  const herd = useQuery({ queryKey: ['sale-statement-animals'], queryFn: () => getData<HerdOption[]>('/api/sale-statements/animals'), staleTime: 60_000 })

  const [lines, setLines] = useState<Line[] | null>(null)
  useEffect(() => {
    if (!preview.data || lines) return
    setLines(st.rows.map((r, i) => {
      const p = preview.data.rows[i]
      const choice: Choice = p?.animal ? { kind: 'animal', id: p.animal.id } : p?.tagOk ? { kind: 'create' } : { kind: 'skip' }
      return { ...r, key: `${i}`, choice, editedPrice: null, editedWeight: null }
    }))
  }, [preview.data, lines, st.rows])

  const priced = useMemo(() => (lines ? applyMode(lines, mode).map((r, i) => ({ ...lines[i], price: r.price })) : []), [lines, mode])
  const included = priced.filter((l) => l.choice.kind !== 'skip')
  const price = (l: Line & { price: number }) => (l.editedPrice != null && l.editedPrice !== '' ? Number(l.editedPrice) : l.price)
  const weight = (l: Line) => (l.editedWeight != null && l.editedWeight !== '' ? Number(l.editedWeight) : l.weightKg)
  const total = round2(priced.reduce((s, l) => s + price(l), 0))
  const chargeTotal = round2(charges.commission + charges.insurance + charges.vat + charges.other)
  const gross = auto.gross ?? total
  const addsUp = Math.abs(total - gross) < 1
  const rowsInfo = preview.data?.rows ?? []
  const found = priced.filter((l, i) => rowsInfo[i]?.animal).length
  const unresolved = priced.filter((l, i) => l.choice.kind === 'skip' && !rowsInfo[i]?.animal)
  const blocking = priced.filter((l, i) => l.choice.kind === 'animal' && rowsInfo[i]?.issues.some((x) => x.level === 'error') && rowsInfo[i]?.animal?.id === (l.choice as any).id)
  const warnings = priced.filter((l, i) => l.choice.kind !== 'skip' && rowsInfo[i]?.issues.some((x) => x.level === 'warn'))
  const dobMismatch = priced.filter((l, i) => rowsInfo[i]?.issues.some((x) => x.text.startsWith('Date of birth')))
  const withdrawals = priced.filter((l, i) => l.choice.kind === 'animal' && rowsInfo[i]?.withdrawal)
  const batches = [...new Set(priced.filter((l) => l.batchSize > 1).map((l) => l.group))].length
  const dup = preview.data?.alreadyImported.find((a) => !st.saleRef || a.saleRef === st.saleRef)
  const headOk = !st.totals.head || st.totals.head === priced.length
  const chosenIds = included.filter((l) => l.choice.kind === 'animal').map((l) => (l.choice as { id: number }).id)
  const dupAnimals = chosenIds.length !== new Set(chosenIds).size

  const save = useSave((override: boolean) => api.post<{ data: { sold: number; created: number; reportLots: number } }>('/api/sale-statements', {
    date, saleRef: st.saleRef, title: st.title, fileName: file.name, gross: round2(included.reduce((s, l) => s + price(l), 0)),
    commission: charges.commission || null, insurance: charges.insurance || null, vat: charges.vat || null, otherCharges: charges.other || null,
    net: round2(round2(included.reduce((s, l) => s + price(l), 0)) - chargeTotal), overrideWithdrawal: override,
    lots: included.map((l) => ({
      lot: l.lot, tag: l.tag, animalId: l.choice.kind === 'animal' ? l.choice.id : null, create: l.choice.kind === 'create',
      sex: l.sexCode, breedCode: l.breedCode, dob: l.dob, weightKg: weight(l), price: price(l),
      buyer: l.buyer ? titleCase(l.buyer.toLowerCase()) : null, batchSize: mode === 'per_batch' ? l.batchSize : 1,
    })),
  }), { invalidate: ['animals', 'mart', 'finance', 'weights', 'sale-statements', 'value'], silentError: true, onSuccess: (r) => setDone(r.data) })

  const submit = async (override = false) => {
    setError(null)
    try {
      await save.mutateAsync(override)
    } catch (e) {
      const err = e as ApiError
      if (err.status === 409 && err.details?.code === 'withdrawal') {
        if (await confirm({ title: 'Withdrawal period', description: `${err.message} Import anyway?`, confirmLabel: 'Import anyway', danger: true })) submit(true)
      } else setError(err.message)
    }
  }

  const update = (key: string, patch: Partial<Line>) => setLines((ls) => ls!.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  const canImport = !!lines && included.length > 0 && !!date && !unresolved.length && !blocking.length && !dupAnimals && !dup

  if (done) {
    return (
      <Modal open onClose={onClose} size="md" title="Sale imported"
        footer={<><Link href="/livestock?status=exited" className="mr-auto text-sm font-medium text-brand-700 hover:underline">See sold animals</Link><Button onClick={onClose}>Done</Button></>}>
        <div className="flex items-start gap-3 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" />
          <div>
            <p className="font-semibold">{done.sold} animal{done.sold === 1 ? '' : 's'} marked as sold on {fmtDate(date)}.</p>
            <p className="mt-1">Sale income, sale weights{chargeTotal ? ' and the mart’s charges' : ''} are recorded.{done.created ? ` ${done.created} animal${done.created === 1 ? ' was' : 's were'} added to the herd first.` : ''}{done.reportLots ? ` ${done.reportLots} matching lot${done.reportLots === 1 ? '' : 's'} in the mart’s sales report ticked off.` : ''}</p>
            <p className="mt-2 text-emerald-800">Made a mistake? Undo it under Mart sales → Statements.</p>
          </div>
        </div>
      </Modal>
    )
  }

  return (
    <Modal open onClose={onClose} size="xl"
      title={<span className="flex flex-wrap items-center gap-2"><ScanLine className="size-5 text-brand-700" />Check this sale before importing</span>}
      description={<>Read from <strong className="font-medium text-stone-800">{file.name}</strong>. Nothing is saved until you press the green button — compare it with the statement and fix anything highlighted.</>}
      footer={<>
        <p className="mr-auto text-sm text-stone-600">
          {included.length ? <>Marks <strong>{included.length}</strong> as sold · adds <strong>{fmtMoney(round2(included.reduce((s, l) => s + price(l), 0)))}</strong> income{chargeTotal ? <> and <strong>{fmtMoney(chargeTotal)}</strong> mart charges</> : null} to Finances</> : 'Nothing selected'}
        </p>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={() => submit()} disabled={!canImport} loading={save.isPending} className="bg-emerald-600 hover:bg-emerald-700">
          <Check />Mark {included.length} as sold
        </Button>
      </>}>
      {!lines || preview.isLoading ? (
        <div className="flex items-center gap-3 py-10 text-sm text-stone-600"><Loader2 className="size-5 animate-spin" />Finding these animals in your herd…</div>
      ) : (
        <div className="space-y-5">
          {/* The sale at a glance */}
          <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-brand-900 to-brand-700 text-white">
            <div className="flex flex-wrap items-end justify-between gap-3 px-5 pt-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-brand-200">Orkney Auction Mart{st.saleRef ? ` · ${st.saleRef}` : ''}</p>
                <p className="font-display text-xl font-semibold">{st.title ? titleCase(st.title.toLowerCase()) : 'Sale'}{date ? ` · ${fmtDate(date, 'EEEE d MMMM yyyy')}` : ''}</p>
              </div>
              <label className="text-xs text-brand-100">Sale date{' '}
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Sale date"
                  className="ml-1 rounded-md border-0 bg-white/15 px-2 py-1 text-sm text-white ring-1 ring-white/30 [color-scheme:dark]" />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-px bg-white/10 pt-4 sm:grid-cols-5">
              <Big label="Animals" value={`${priced.length}${st.totals.label ? ` ${titleCase(st.totals.label.toLowerCase())}` : ''}`} />
              <Big label="Gross" value={fmtMoney(gross)} />
              <Big label="Mart charges" value={chargeTotal ? `−${fmtMoney(chargeTotal)}` : '—'} />
              <Big label="Net paid" value={chargeTotal || auto.net != null ? fmtMoney(round2(gross - chargeTotal)) : '—'} />
              <Big label="Average" value={st.totals.avgWeightKg ? `${fmtNum(Math.round(st.totals.avgWeightKg))} kg · ${fmtNum(st.totals.ppk ?? 0, 1)}p/kg` : '—'} className="col-span-2 sm:col-span-1" />
            </div>
          </div>

          {/* Checks */}
          <ul className="grid gap-2 sm:grid-cols-2">
            {!date && <CheckItem ok={false} text="The sale date couldn’t be read — enter it at the top" />}
            <CheckItem ok={found === priced.length} warn={found < priced.length && !unresolved.length}
              text={found === priced.length ? `All ${priced.length} animals found in your herd` : `${found} of ${priced.length} found in your herd — ${priced.length - found} need${priced.length - found === 1 ? 's' : ''} a decision below`} />
            <CheckItem ok={addsUp} text={addsUp ? `Prices add up to the statement’s gross, ${fmtMoney(gross)}` : `Prices add up to ${fmtMoney(total)} but the statement says ${fmtMoney(gross)} — check the prices below`} />
            <CheckItem ok={headOk} warn={!headOk} text={headOk ? `Head count matches the statement${st.totals.head ? ` (${st.totals.head})` : ''}` : `The statement says ${st.totals.head} head but ${priced.length} lines were read`} />
            <CheckItem ok={!dobMismatch.length} warn={!!dobMismatch.length} text={dobMismatch.length ? `${dobMismatch.length} date${dobMismatch.length === 1 ? '' : 's'} of birth differ from your records` : 'Dates of birth match your records'} />
            {withdrawals.length > 0 && <CheckItem ok={false} warn text={`${withdrawals.length} under a meat withdrawal period on the sale date`} />}
            {dup && <CheckItem ok={false} text={`This sale was already imported. Undo it under Mart sales → Statements to import it again.`} />}
          </ul>

          {/* Batches */}
          {batches > 0 && (
            <div className="rounded-xl bg-sky-50 p-4 text-sm text-sky-950 ring-1 ring-sky-200">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{batches} batch{batches === 1 ? '' : 'es'} — animals listed together with the same weight and price</p>
                  <p className="mt-1 text-sky-900">
                    {mode === 'per_head'
                      ? <>Each animal is recorded at the price shown on its line{auto.mode === 'per_head' && addsUp ? ' — that’s what makes the total match the statement' : ''}.</>
                      : <>A batch&rsquo;s price is split between its animals (e.g. {fmtMoney(priced.find((l) => l.batchSize > 1)?.printedPrice ?? 0)} ÷ {priced.find((l) => l.batchSize > 1)?.batchSize}){auto.mode === 'per_batch' && addsUp ? ' — that’s what makes the total match the statement' : ''}. The weight is per animal.</>}
                  </p>
                </div>
                <Segmented size="sm" className="shrink-0 self-start" value={mode} onChange={setMode} options={[{ value: 'per_head', label: 'Price per animal' }, { value: 'per_batch', label: 'Price for the batch' }]} />
              </div>
            </div>
          )}

          {/* Lines */}
          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-[15px] font-semibold text-stone-900">Animals on the statement</h3>
              {Object.keys(read.crops).length > 0 && (
                <label className="inline-flex items-center gap-2 text-sm text-stone-600">
                  <input type="checkbox" checked={showOriginal} onChange={(e) => setShowOriginal(e.target.checked)} className="size-4 rounded border-stone-300 text-brand-700" />
                  Show each printed line
                </label>
              )}
            </div>
            <div className="overflow-hidden rounded-xl ring-1 ring-stone-200">
              <div className="hidden grid-cols-[52px_minmax(0,1.6fr)_minmax(0,1fr)_88px_96px_70px_minmax(0,1fr)] gap-3 bg-stone-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-stone-500 lg:grid">
                <span>Lot</span><span>Ear tag → your animal</span><span>Born · sex · breed</span><span className="text-right">Weight</span><span className="text-right">Price</span><span className="text-right">p/kg</span><span>Buyer</span>
              </div>
              <ul className="divide-y divide-stone-100">
                {priced.map((l, i) => (
                  <LineRow key={l.key} line={l} info={rowsInfo[i]} herd={herd.data || []} price={price(l)} weight={weight(l)}
                    crop={showOriginal || rowsInfo[i]?.issues.length ? read.crops[l.raw.replace(/\s+/g, ' ')] : undefined} pages={read.pages}
                    firstOfBatch={l.batchSize > 1 && priced[i - 1]?.group !== l.group} lastOfBatch={l.batchSize > 1 && priced[i + 1]?.group !== l.group}
                    onChange={(patch) => update(l.key, patch)} />
                ))}
              </ul>
            </div>
          </div>

          {/* Charges */}
          <div className="rounded-xl bg-stone-50 p-4">
            <p className="text-sm font-semibold text-stone-800">Mart charges <span className="font-normal text-stone-500">— added to Finances as one expense</span></p>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {(['commission', 'insurance', 'vat', 'other'] as const).map((k) => (
                <label key={k} className="text-xs text-stone-600">{k === 'vat' ? 'VAT on charges' : k === 'other' ? 'Other charges' : titleCase(k)}
                  <span className="mt-1 flex items-center rounded-lg bg-white ring-1 ring-stone-200 focus-within:ring-2 focus-within:ring-brand-500">
                    <span className="pl-2.5 text-stone-400">£</span>
                    <input type="number" step="0.01" min="0" value={charges[k] || ''} placeholder="0.00" aria-label={k}
                      onChange={(e) => setCharges((c) => ({ ...c, [k]: Math.abs(Number(e.target.value) || 0) }))}
                      className="h-9 w-full min-w-0 rounded-lg border-0 bg-transparent px-1.5 text-sm tabular focus:outline-none focus:ring-0" />
                  </span>
                </label>
              ))}
            </div>
            {st.totals.net != null && (
              <p className={cn('mt-3 text-xs', Math.abs(gross - chargeTotal - st.totals.net) < 1 ? 'text-emerald-700' : 'text-amber-700')}>
                {fmtMoney(gross)} − {fmtMoney(chargeTotal)} = {fmtMoney(round2(gross - chargeTotal))}
                {Math.abs(gross - chargeTotal - st.totals.net) < 1 ? ' ✓ matches the net on the statement' : ` — the net was read as ${fmtMoney(st.totals.net)}; check it against the statement`}
              </p>
            )}
          </div>
          <FormError error={error} />
        </div>
      )}
    </Modal>
  )
}

function LineRow({ line: l, info, herd, price, weight, crop, pages, firstOfBatch, lastOfBatch, onChange }: {
  line: Line & { price: number }; info?: PreviewRow; herd: HerdOption[]; price: number; weight: number | null
  crop?: { page: number; x0: number; y0: number; x1: number; y1: number }; pages: ReadResult['pages']
  firstOfBatch: boolean; lastOfBatch: boolean; onChange: (p: Partial<Line>) => void
}) {
  const errors = info?.issues.filter((x) => x.level === 'error') ?? []
  const warns = info?.issues.filter((x) => x.level === 'warn') ?? []
  const skipped = l.choice.kind === 'skip'
  const a = info?.animal && l.choice.kind === 'animal' && l.choice.id === info.animal.id ? info.animal : null
  const picked = l.choice.kind === 'animal' && !a ? herd.find((h) => h.id === (l.choice as { id: number }).id) : null
  const tone = skipped ? 'bg-stone-50 text-stone-400' : errors.length && (a || !info?.animal) && l.choice.kind !== 'create' && !picked ? 'bg-clay-50/70' : warns.length || l.choice.kind === 'create' ? 'bg-amber-50/60' : ''
  const ppk = weight && price ? Math.round((price * 1000) / weight) / 10 : null

  return (
    <li className={cn('px-3 py-2.5 text-sm', tone, l.batchSize > 1 && 'border-l-4 border-l-sky-300')} data-testid="statement-line">
      <div className="grid grid-cols-[52px_minmax(0,1fr)] gap-x-3 gap-y-1.5 lg:grid-cols-[52px_minmax(0,1.6fr)_minmax(0,1fr)_88px_96px_70px_minmax(0,1fr)] lg:items-center">
        <div className="row-span-3 lg:row-span-1">
          <p className="font-semibold tabular text-stone-900">{l.lot}</p>
          {firstOfBatch && <p className="whitespace-nowrap text-[10px] font-semibold text-sky-700">batch ×{l.batchSize}</p>}
        </div>
        <div className="min-w-0">
          <p className="font-mono text-[13px] text-stone-800">{l.tag.replace(/^([A-Z]{2})(\d{6})(\d)(\d{5})$/, '$1 $2 $3 $4')}</p>
          {a ? (
            <Link href={`/livestock/view?id=${a.id}`} target="_blank" className="inline-flex items-center gap-1 text-[13px] font-medium text-brand-700 hover:underline">
              <Check className="size-3.5 text-emerald-600" />{a.managementTag || a.tagNo}{a.name ? ` · ${a.name}` : ''}
            </Link>
          ) : (
            <select value={l.choice.kind === 'animal' ? String(l.choice.id) : l.choice.kind}
              onChange={(e) => onChange({ choice: e.target.value === 'skip' ? { kind: 'skip' } : e.target.value === 'create' ? { kind: 'create' } : { kind: 'animal', id: Number(e.target.value) } })}
              aria-label={`Animal for lot ${l.lot}`}
              className="mt-0.5 h-8 w-full max-w-xs rounded-md border-0 bg-white py-0 pl-2 pr-7 text-[13px] ring-1 ring-inset ring-stone-300 focus:ring-2 focus:ring-brand-500">
              {info?.animal && <option value={info.animal.id}>{info.animal.managementTag || info.animal.tagNo} (matched)</option>}
              <option value="skip">— Choose: skip this line —</option>
              <option value="create">Add to the herd as a new animal</option>
              {info?.suggestions.length ? <optgroup label="Close tag numbers">{info.suggestions.map((s) => <option key={s.id} value={s.id}>{s.managementTag ? `${s.managementTag} · ` : ''}{s.tagNo}{s.dob ? ` · born ${s.dob}` : ''}</option>)}</optgroup> : null}
              <optgroup label="All cattle">{herd.filter((h) => h.status === 'active').map((h) => <option key={h.id} value={h.id}>{h.managementTag ? `${h.managementTag} · ` : ''}{h.tagNo}</option>)}</optgroup>
            </select>
          )}
        </div>
        <p className="text-[13px] text-stone-600">
          {l.dob ? fmtDate(l.dob) : '—'} · {SEX_LABEL[l.sexCode ?? ''] ?? l.sexCode ?? '—'} · {l.breedCode ?? '—'}
        </p>
        <div className="flex items-center gap-3 lg:contents">
          <NumCell label="kg" value={l.editedWeight ?? (l.weightKg != null ? String(l.weightKg) : '')} onChange={(v) => onChange({ editedWeight: v })} edited={l.editedWeight != null} aria={`Weight lot ${l.lot}`} />
          <NumCell label="£" prefix value={l.editedPrice ?? String(l.price)} onChange={(v) => onChange({ editedPrice: v })} edited={l.editedPrice != null} aria={`Price lot ${l.lot}`} />
          <p className="w-[70px] text-right tabular text-[13px] text-stone-600">{ppk ? `${fmtNum(ppk, 1)}p` : '—'}</p>
        </div>
        <p className="truncate text-[13px] text-stone-600 lg:col-auto" title={l.buyer ?? ''}>{l.buyer ? titleCase(l.buyer.toLowerCase()) : '—'}</p>
      </div>
      {(errors.length > 0 || warns.length > 0 || l.choice.kind === 'create' || (l.batchSize > 1 && lastOfBatch && l.printedPrice !== l.price)) && (
        <div className="mt-1.5 flex flex-wrap gap-1.5 pl-[64px]">
          {l.choice.kind === 'create' && <Badge tone="amber"><PlusCircle className="size-3" />Will be added to the herd ({SEX_LABEL[l.sexCode ?? ''] ?? 'animal'}, born {l.dob ?? '?'})</Badge>}
          {errors.filter(() => l.choice.kind !== 'create' && !picked).map((x) => <Badge key={x.text} tone="red"><XCircle className="size-3" />{x.text}</Badge>)}
          {warns.map((x) => <Badge key={x.text} tone="amber"><AlertTriangle className="size-3" />{x.text}</Badge>)}
        </div>
      )}
      {crop && pages[crop.page] && <Crop crop={crop} page={pages[crop.page]} />}
    </li>
  )
}

/** The printed line, cut out of the scanned page, so it can be compared with what was read. */
function Crop({ crop, page }: { crop: { x0: number; y0: number; x1: number; y1: number }; page: { url: string; width: number; height: number } }) {
  const pad = 4
  const x0 = Math.max(0, crop.x0 - 40), y0 = Math.max(0, crop.y0 - pad), x1 = Math.min(page.width, crop.x1 + pad), y1 = Math.min(page.height, crop.y1 + pad)
  const w = x1 - x0, h = y1 - y0
  const scale = 1.2
  return (
    <div className="mt-2 overflow-x-auto pl-[64px] scrollbar-thin">
      <div className="inline-flex items-center gap-2 rounded-md bg-white p-1 ring-1 ring-stone-200">
        <FileText className="size-3.5 shrink-0 text-stone-400" />
        <div aria-label="Printed line" role="img" style={{ width: w * scale, height: h * scale, backgroundImage: `url(${page.url})`, backgroundSize: `${page.width * scale}px ${page.height * scale}px`, backgroundPosition: `-${x0 * scale}px -${y0 * scale}px` }} />
      </div>
    </div>
  )
}

function NumCell({ label, value, onChange, edited, prefix, aria }: { label: string; value: string; onChange: (v: string) => void; edited: boolean; prefix?: boolean; aria: string }) {
  return (
    <label className={cn('flex h-8 items-center justify-end rounded-md px-1.5 tabular ring-1 ring-inset focus-within:ring-2 focus-within:ring-brand-500', edited ? 'bg-amber-50 ring-amber-300' : 'bg-white/70 ring-stone-200', prefix ? 'w-24' : 'w-[88px]')}>
      {prefix && <span className="text-[13px] text-stone-400">{label}</span>}
      <input value={value} inputMode="decimal" onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, ''))} aria-label={aria}
        className="w-full min-w-0 border-0 bg-transparent p-0 text-right text-[13px] focus:outline-none focus:ring-0" />
      {!prefix && <span className="pl-1 text-[12px] text-stone-400">{label}</span>}
    </label>
  )
}

function Big({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={cn('bg-brand-900/30 px-5 py-3', className)}>
      <p className="text-[11px] uppercase tracking-wide text-brand-200">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular">{value}</p>
    </div>
  )
}

function CheckItem({ ok, warn, text }: { ok: boolean; warn?: boolean; text: string }) {
  return (
    <li className={cn('flex items-start gap-2 rounded-lg px-3 py-2 text-sm', ok ? 'bg-emerald-50 text-emerald-900' : warn ? 'bg-amber-50 text-amber-900' : 'bg-clay-50 text-clay-800')}>
      {ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" /> : warn ? <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" /> : <XCircle className="mt-0.5 size-4 shrink-0 text-clay-600" />}
      {text}
    </li>
  )
}

function abs(x: number | null) { return Math.abs(x ?? 0) }
function round2(x: number) { return Math.round(x * 100) / 100 }

// ---------------- Imported statements ----------------

export interface SaleStatementItem {
  id: number; saleRef: string | null; title: string | null; date: string; fileName: string | null; headCount: number; gross: number
  commission: number | null; insurance: number | null; vat: number | null; otherCharges: number | null; net: number | null; status: string
  lots: { lot: string | null; tag: string; animalId: number; weightKg: number | null; price: number; buyer: string | null; batchSize: number; created: boolean }[]
  createdAt: string
}

export function useStatementFlow() {
  const [file, setFile] = useState<File | null>(null)
  const open = useCallback((f: File) => setFile(f), [])
  const dialog = file ? <SaleStatementImport key={`${file.name}${file.size}${file.lastModified}`} file={file} onClose={() => setFile(null)} /> : null
  return { open, dialog }
}
