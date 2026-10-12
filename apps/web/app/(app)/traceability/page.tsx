'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, CalendarClock, CheckCircle2, Download, Landmark, Link2, Lock, RefreshCw, ShieldCheck, Tag, Unlink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge, Card, CardHeader, EmptyState, PageHeader, PageSkeleton, StatCard } from '@/components/ui/display'
import { FormError, FormGrid, Select, TextField, formValues } from '@/components/ui/form'
import { Tabs, useConfirm } from '@/components/ui/overlay'
import { ApiError, getData } from '@/lib/api'
import { api, useSave } from '@/lib/queries'
import { downloadUrl, fmtDate, fmtDue, fmtNum, fmtRelative, titleCase, todayISO } from '@/lib/format'
import { useSession } from '@/lib/session'
import { cn } from '@/lib/utils'

type Tab = 'deadlines' | 'tags' | 'scoteid' | 'register'

interface Deadline {
  kind: 'tagging' | 'birth' | 'death' | 'move_off' | 'move_on'; animalId: number; tagNo: string; managementTag: string | null
  eventDate: string; dueDate: string; state: 'reported' | 'by_mart' | 'due' | 'overdue'; note?: string
}
interface TagIssue { animalId: number; tagNo: string; managementTag: string | null; status: string; issue: string }
interface RegisterRow {
  animalId: number; tagNo: string; managementTag: string | null; sex: string; breed: string | null; dob: string | null
  damTag: string | null; dateOn: string | null; onFrom: string; dateOff: string | null; offTo: string | null
}
interface ScotEIDStatus {
  available: boolean; connected: boolean; mainCph: string | null; username: string | null; lastSyncAt: string | null
  lastError: string | null; animals: number; events: number; holdings: { cph: string; mainCph: string }[]
}
interface Reconcile {
  onlyScotEID: { tag: string; sex: string | null; dob: string | null; breed: string | null; breedCode: string | null; damTag: string | null }[]
  onlyHere: { animalId: number; tagNo: string; managementTag: string | null; dob: string | null; sex: string }[]
  stillOnHolding: { animalId: number; tagNo: string; managementTag: string | null; status: string; exitDate: string | null }[]
  differences: { animalId: number; tagNo: string; field: string; here: string | null; scoteid: string | null }[]
  events: { id: number; tag: string; label: string; date: string; notificationDate: string | null; animalId: number | null }[]
}

const KIND: Record<Deadline['kind'], string> = {
  tagging: 'Tag calf', birth: 'Register birth', death: 'Report death', move_off: 'Report move off', move_on: 'Report move on',
}

const fmtTag = (t: string) => /^UK\d{12}$/.test(t) ? `UK ${t.slice(2, 8)} ${t.slice(8, 9)} ${t.slice(9)}` : t

function TraceabilityInner() {
  const params = useSearchParams()
  const router = useRouter()
  const tab = (params.get('tab') as Tab) || 'deadlines'
  const setTab = (t: Tab) => router.replace(`/traceability?tab=${t}`, { scroll: false })
  const deadlines = useQuery({ queryKey: ['compliance', 'deadlines'], queryFn: () => getData<Deadline[]>('/api/compliance/deadlines') })
  const tags = useQuery({ queryKey: ['compliance', 'tags'], queryFn: () => getData<TagIssue[]>('/api/compliance/tags') })
  const scoteid = useQuery({ queryKey: ['scoteid'], queryFn: () => getData<ScotEIDStatus>('/api/scoteid') })

  if (!deadlines.data || !tags.data || !scoteid.data) return <PageSkeleton />
  const overdue = deadlines.data.filter((d) => d.state === 'overdue').length
  const due = deadlines.data.filter((d) => d.state === 'due').length

  return (
    <div className="space-y-6">
      <PageHeader title="Traceability" description="Cattle identification and reporting — what ScotEID needs from you, and whether your records agree with theirs." />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Overdue reports" value={fmtNum(overdue)} icon={AlertTriangle} tone={overdue ? 'clay' : 'stone'} sub="Past the legal deadline" />
        <StatCard label="Reports due" value={fmtNum(due)} icon={CalendarClock} tone="wheat" sub="Births, deaths and moves" />
        <StatCard label="Ear tag problems" value={fmtNum(tags.data.length)} icon={Tag} tone={tags.data.length ? 'wheat' : 'stone'} sub="Failed the UK check digit" />
        <StatCard label="ScotEID" value={scoteid.data.connected ? 'Connected' : scoteid.data.available ? 'Not connected' : 'Coming soon'} icon={Landmark} tone="sky"
          sub={scoteid.data.lastSyncAt ? `Synced ${fmtRelative(scoteid.data.lastSyncAt)}` : 'Compare your herd with ScotEID'} />
      </div>
      <Card>
        <div className="px-4 pt-3">
          <Tabs value={tab} onChange={setTab} tabs={[
            { value: 'deadlines', label: 'Reporting', count: overdue + due || null },
            { value: 'tags', label: 'Ear tags', count: tags.data.length || null },
            { value: 'scoteid', label: 'ScotEID' },
            { value: 'register', label: 'Holding register' },
          ]} />
        </div>
        {tab === 'deadlines' && <Deadlines rows={deadlines.data} synced={!!scoteid.data.lastSyncAt} />}
        {tab === 'tags' && <TagIssues rows={tags.data} />}
        {tab === 'scoteid' && <ScotEID status={scoteid.data} />}
        {tab === 'register' && <Register />}
      </Card>
    </div>
  )
}

export default function TraceabilityPage() {
  return <Suspense><TraceabilityInner /></Suspense>
}

function StateBadge({ d }: { d: Deadline }) {
  if (d.state === 'reported') return <Badge tone="green" dot>On ScotEID</Badge>
  if (d.state === 'by_mart') return <Badge tone="blue" dot>Mart reports it</Badge>
  if (d.state === 'overdue') return <Badge tone="red" dot>Overdue</Badge>
  return <Badge tone="amber" dot>Due {fmtDue(d.dueDate)}</Badge>
}

function Deadlines({ rows, synced }: { rows: Deadline[]; synced: boolean }) {
  return (
    <div>
      <div className="mx-5 mt-4 rounded-xl bg-sky-50 px-4 py-3 text-sm text-sky-900 ring-1 ring-sky-600/10">
        <p className="font-medium">Scottish cattle reporting deadlines</p>
        <p className="mt-1 text-sky-800">Tag beef calves within 20 days of birth and register the birth within 27 days. Report moves on or off within 3 days (Scottish marts and abattoirs report for you) and deaths within 7 days.
          {!synced && ' Connect ScotEID to mark off what has already been reported.'}</p>
      </div>
      {!rows.length ? <EmptyState icon={ShieldCheck} title="Nothing to report" description="No births, deaths or movements in the last 60 days." /> : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-y border-stone-100 bg-stone-50/60 text-left text-xs text-stone-500">
              <tr><th className="px-5 py-2.5 font-medium">What</th><th className="px-3 py-2.5 font-medium">Animal</th><th className="px-3 py-2.5 font-medium">Happened</th><th className="px-3 py-2.5 font-medium">Deadline</th><th className="px-3 py-2.5 font-medium">Status</th></tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {rows.map((d) => (
                <tr key={`${d.kind}${d.animalId}`} className="hover:bg-stone-50">
                  <td className="px-5 py-3"><p className="font-medium text-stone-900">{KIND[d.kind]}</p>{d.note && <p className="text-xs text-stone-500">{d.note}</p>}</td>
                  <td className="px-3 py-3"><Link href={`/livestock/view?id=${d.animalId}`} className="font-medium text-brand-700 hover:underline">{d.managementTag || d.tagNo}</Link>{d.managementTag && <p className="text-xs text-stone-400">{d.tagNo}</p>}</td>
                  <td className="px-3 py-3 text-stone-600">{fmtDate(d.eventDate)}</td>
                  <td className="px-3 py-3 text-stone-600">{fmtDate(d.dueDate)}</td>
                  <td className="px-3 py-3"><StateBadge d={d} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="px-5 py-4 text-xs text-stone-400">Report on <a className="underline" href="https://www.scoteid.com" target="_blank" rel="noreferrer">ScotEID.com</a>. Source: ScotEID keeper guide, &ldquo;Cattle Traceability and Record Keeping&rdquo;.</p>
    </div>
  )
}

function TagIssues({ rows }: { rows: TagIssue[] }) {
  const { farm, can } = useSession()
  return (
    <div>
      <div className="mx-5 mt-4 rounded-xl bg-stone-50 px-4 py-3 text-sm text-stone-700 ring-1 ring-stone-900/5">
        UK cattle tags are <span className="font-mono">UK</span> + your 6-digit herd mark + a check digit + a 5-digit animal number. The check digit catches most typing mistakes.
        {!farm.herdMark && can('manager') && <> <Link href="/settings" className="font-medium text-brand-700 hover:underline">Add your herd mark</Link> to also catch home-bred calves recorded with the wrong herd.</>}
      </div>
      {!rows.length ? <EmptyState icon={CheckCircle2} title="All ear tags check out" description="Every cattle tag number has a valid format and check digit." /> : (
        <ul className="mt-4 divide-y divide-stone-100 border-t border-stone-100">
          {rows.map((r) => (
            <li key={`${r.animalId}${r.issue}`} className="flex items-center justify-between gap-4 px-5 py-3">
              <div>
                <p className="font-medium text-stone-900"><span className="font-mono">{r.tagNo}</span>{r.managementTag && <span className="ml-2 text-sm font-normal text-stone-500">{r.managementTag}</span>}{r.status !== 'active' && <Badge className="ml-2" tone="gray">{titleCase(r.status)}</Badge>}</p>
                <p className="text-sm text-amber-800">{r.issue}</p>
              </div>
              <Link href={`/livestock/view?id=${r.animalId}`} className="shrink-0 text-sm font-medium text-brand-700 hover:underline">Open animal</Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Register() {
  const thisYear = Number(todayISO().slice(0, 4))
  const [year, setYear] = useState(thisYear)
  const { data, isLoading } = useQuery({ queryKey: ['compliance', 'register', year], queryFn: () => getData<RegisterRow[]>(`/api/compliance/register?year=${year}`) })
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <p className="max-w-xl text-sm text-stone-600">Every bovine on the holding during the year, with dates on and off. Keep registers for 10 years.</p>
        <div className="flex items-center gap-2">
          <Select value={year} onChange={(e) => setYear(Number(e.target.value))} className="w-28" aria-label="Year">
            {Array.from({ length: 10 }, (_, i) => thisYear - i).map((y) => <option key={y} value={y}>{y}</option>)}
          </Select>
          <Button variant="secondary" onClick={() => downloadUrl(`/api/compliance/register.csv?year=${year}`)}><Download />Download CSV</Button>
        </div>
      </div>
      {isLoading ? <p className="px-5 pb-5 text-sm text-stone-500">Loading…</p> : !data?.length ? <EmptyState icon={Landmark} title="No cattle that year" /> : (
        <div className="overflow-x-auto border-t border-stone-100">
          <table className="w-full text-sm">
            <thead className="bg-stone-50/60 text-left text-xs text-stone-500">
              <tr>{['Ear tag', 'Sex', 'Breed', 'Born', 'Dam', 'On holding', 'From', 'Off holding', 'To / reason'].map((h) => <th key={h} className="whitespace-nowrap px-3 py-2.5 font-medium first:pl-5">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {data.map((r) => (
                <tr key={r.animalId} className="hover:bg-stone-50">
                  <td className="whitespace-nowrap px-3 py-2 pl-5"><Link href={`/livestock/view?id=${r.animalId}`} className="font-mono text-[13px] text-brand-700 hover:underline">{r.tagNo}</Link></td>
                  <td className="px-3 py-2">{r.sex}</td>
                  <td className="px-3 py-2">{r.breed || '—'}</td>
                  <td className="whitespace-nowrap px-3 py-2">{fmtDate(r.dob)}</td>
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-[13px]">{r.damTag || '—'}</td>
                  <td className="whitespace-nowrap px-3 py-2">{fmtDate(r.dateOn)}</td>
                  <td className="px-3 py-2 text-stone-600">{r.onFrom}</td>
                  <td className="whitespace-nowrap px-3 py-2">{r.dateOff ? fmtDate(r.dateOff) : ''}</td>
                  <td className="px-3 py-2 text-stone-600">{r.offTo || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ---------------- ScotEID ----------------

function ScotEID({ status }: { status: ScotEIDStatus }) {
  const { can } = useSession()
  const confirm = useConfirm()
  const sync = useSave(() => api.post<{ data: { animals: number; events: number } }>('/api/scoteid/sync'), {
    invalidate: ['scoteid', 'compliance'], success: (r) => `Synced ${r.data.animals} cattle and ${r.data.events} events from ScotEID`,
  })
  const disconnect = useSave(() => api.del('/api/scoteid/credentials'), { invalidate: ['scoteid', 'compliance'], success: 'ScotEID disconnected' })

  if (!status.available) {
    return (
      <div className="grid gap-6 p-6 lg:grid-cols-2">
        <div>
          <h3 className="text-[15px] font-semibold text-stone-900">Connect your ScotEID account</h3>
          <p className="mt-2 text-sm text-stone-600">Once ScotEID approves HoovesWho as farm software, you&rsquo;ll be able to sign in with your ScotEID details here. HoovesWho will then:</p>
          <ul className="mt-3 space-y-2 text-sm text-stone-700">
            {['Show which cattle ScotEID has on your holding, and which are missing from either side',
              'Spot differences in dates of birth, sex and dams',
              'Mark births, deaths and moves as reported once they appear on ScotEID',
              'Bring in cattle that are on ScotEID but not yet in HoovesWho'].map((t) => <li key={t} className="flex gap-2"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-brand-600" />{t}</li>)}
          </ul>
        </div>
        <div className="rounded-xl bg-stone-50 p-5 text-sm text-stone-600 ring-1 ring-stone-900/5">
          <p className="flex items-center gap-2 font-medium text-stone-800"><Lock className="size-4" />Waiting for ScotEID approval</p>
          <p className="mt-2">ScotEID only lets approved software read keeper records. The connection is built and tested; it switches on as soon as the approval key arrives.</p>
          <p className="mt-2">Until then, the Reporting, Ear tags and Holding register tabs work from your own records.</p>
        </div>
      </div>
    )
  }

  if (!status.connected) return <ConnectForm canEdit={can('owner')} />

  return (
    <div className="space-y-6 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-stone-50 px-4 py-3 ring-1 ring-stone-900/5">
        <div className="text-sm">
          <p className="font-medium text-stone-900"><Link2 className="mr-1.5 inline size-4 text-brand-600" />Holding {status.mainCph} · {status.username}</p>
          <p className="text-stone-500">{status.lastSyncAt ? `Last synced ${fmtRelative(status.lastSyncAt)} · ${status.animals} cattle, ${status.events} events` : 'Not synced yet'}</p>
          {status.lastError && <p className="mt-1 text-clay-700">{status.lastError}</p>}
        </div>
        <div className="flex gap-2">
          {can('manager') && <Button onClick={() => sync.mutate(undefined)} loading={sync.isPending}><RefreshCw />Sync now</Button>}
          {can('owner') && <Button variant="secondary" onClick={async () => { if (await confirm({ title: 'Disconnect ScotEID?', description: 'Your saved ScotEID login and the synced records are removed from HoovesWho.', confirmLabel: 'Disconnect', danger: true })) disconnect.mutate(undefined) }}><Unlink />Disconnect</Button>}
        </div>
      </div>
      {status.lastSyncAt && <Reconciliation />}
    </div>
  )
}

function ConnectForm({ canEdit }: { canEdit: boolean }) {
  const { farm } = useSession()
  const [error, setError] = useState<string | null>(null)
  const connect = useSave((v: Record<string, string>) => api.put('/api/scoteid/credentials', v), { invalidate: ['scoteid', 'me'], success: 'ScotEID connected', silentError: true })
  if (!canEdit) return <EmptyState icon={Landmark} title="ScotEID isn’t connected" description="The farm owner can connect it here with their ScotEID login." />
  return (
    <form className="grid gap-6 p-6 lg:grid-cols-[1fr_1fr]" onSubmit={async (e) => {
      e.preventDefault(); setError(null)
      try { await connect.mutateAsync(formValues(e.currentTarget)) } catch (err) { setError((err as ApiError).message) }
    }}>
      <div>
        <h3 className="text-[15px] font-semibold text-stone-900">Connect ScotEID</h3>
        <p className="mt-2 text-sm text-stone-600">Use the username and password you sign in to ScotEID.com with. HoovesWho only reads your holding&rsquo;s records — it never reports anything without you.</p>
        <p className="mt-3 flex items-start gap-2 text-xs text-stone-500"><Lock className="mt-0.5 size-3.5 shrink-0" />Your password is stored encrypted and is only sent to ScotEID.</p>
      </div>
      <div className="space-y-4">
        <TextField label="Main holding (CPH)" name="mainCph" required placeholder="85/123/4567" defaultValue={farm.holdingNumber || ''} pattern="\d{2}/\d{3}/\d{4}" hint="County / parish / holding" />
        <FormGrid>
          <TextField label="ScotEID username" name="username" required autoComplete="off" />
          <TextField label="ScotEID password" name="password" type="password" required autoComplete="new-password" />
        </FormGrid>
        <FormError error={error} />
        <Button type="submit" loading={connect.isPending}>Connect</Button>
      </div>
    </form>
  )
}

function Reconciliation() {
  const { can } = useSession()
  const { data, isLoading } = useQuery({ queryKey: ['scoteid', 'reconcile'], queryFn: () => getData<Reconcile>('/api/scoteid/reconcile') })
  const [picked, setPicked] = useState<string[]>([])
  const importSel = useSave((tags: string[]) => api.post<{ data: { created: number } }>('/api/scoteid/import', { tags }), {
    invalidate: ['scoteid', 'animals', 'compliance'], success: (r) => `Added ${r.data.created} animal${r.data.created === 1 ? '' : 's'} from ScotEID`, onSuccess: () => setPicked([]),
  })
  if (isLoading || !data) return <p className="text-sm text-stone-500">Comparing…</p>
  const allGood = !data.onlyScotEID.length && !data.onlyHere.length && !data.stillOnHolding.length && !data.differences.length

  return (
    <div className="space-y-6">
      {allGood && <div className="flex items-center gap-3 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800 ring-1 ring-emerald-600/15"><CheckCircle2 className="size-5" />Your herd matches ScotEID.</div>}

      {data.onlyScotEID.length > 0 && (
        <Card className="shadow-none">
          <CardHeader title={`On ScotEID but not in HoovesWho (${data.onlyScotEID.length})`} description="Cattle ScotEID has on your holding that you haven’t recorded here."
            action={can('manager') && <Button size="sm" disabled={!picked.length} loading={importSel.isPending} onClick={() => importSel.mutate(picked)}>Add {picked.length || ''} to herd</Button>} />
          <ul className="divide-y divide-stone-100 border-t border-stone-100">
            {data.onlyScotEID.map((a) => (
              <li key={a.tag}>
                <label className="flex cursor-pointer items-center gap-3 px-5 py-2.5 hover:bg-stone-50">
                  {can('manager') && <input type="checkbox" checked={picked.includes(a.tag)} onChange={() => setPicked((p) => p.includes(a.tag) ? p.filter((x) => x !== a.tag) : [...p, a.tag])} className="size-4 rounded border-stone-300 text-brand-700" aria-label={`Select ${a.tag}`} />}
                  <span className="font-mono text-sm text-stone-900">{fmtTag(a.tag)}</span>
                  <span className="text-sm text-stone-500">{[a.sex && titleCase(a.sex), a.breed ? titleCase(a.breed) : a.breedCode, a.dob && `born ${fmtDate(a.dob)}`].filter(Boolean).join(' · ')}</span>
                </label>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {data.onlyHere.length > 0 && (
        <Card className="shadow-none">
          <CardHeader title={`In HoovesWho but not on your holding in ScotEID (${data.onlyHere.length})`} description="Check the tag number, register the birth, or report the move on." />
          <ul className="divide-y divide-stone-100 border-t border-stone-100">
            {data.onlyHere.map((a) => (
              <li key={a.animalId} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                <Link href={`/livestock/view?id=${a.animalId}`} className="font-mono text-brand-700 hover:underline">{a.tagNo}</Link>
                <span className="text-stone-500">{[a.managementTag, a.dob && `born ${fmtDate(a.dob)}`].filter(Boolean).join(' · ')}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {data.stillOnHolding.length > 0 && (
        <Card className="shadow-none">
          <CardHeader title={`Gone here, still on your holding in ScotEID (${data.stillOnHolding.length})`} description="Report the death or movement on ScotEID." />
          <ul className="divide-y divide-stone-100 border-t border-stone-100">
            {data.stillOnHolding.map((a) => (
              <li key={a.animalId} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                <Link href={`/livestock/view?id=${a.animalId}`} className="font-mono text-brand-700 hover:underline">{a.tagNo}</Link>
                <span className="text-stone-500">{titleCase(a.status)} {fmtDate(a.exitDate)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {data.differences.length > 0 && (
        <Card className="shadow-none">
          <CardHeader title={`Details that differ (${data.differences.length})`} description="Correct whichever side is wrong — ScotEID changes need a request to ScotEID." />
          <div className="overflow-x-auto border-t border-stone-100">
            <table className="w-full text-sm">
              <thead className="bg-stone-50/60 text-left text-xs text-stone-500"><tr><th className="px-5 py-2 font-medium">Animal</th><th className="px-3 py-2 font-medium">Field</th><th className="px-3 py-2 font-medium">HoovesWho</th><th className="px-3 py-2 font-medium">ScotEID</th></tr></thead>
              <tbody className="divide-y divide-stone-100">
                {data.differences.map((d) => (
                  <tr key={`${d.animalId}${d.field}`}>
                    <td className="px-5 py-2"><Link href={`/livestock/view?id=${d.animalId}`} className="font-mono text-brand-700 hover:underline">{d.tagNo}</Link></td>
                    <td className="px-3 py-2">{d.field}</td>
                    <td className="px-3 py-2">{d.here ?? '—'}</td>
                    <td className="px-3 py-2 font-medium text-stone-900">{d.scoteid ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {data.events.length > 0 && (
        <Card className="shadow-none">
          <CardHeader title="Recent ScotEID events" description="What ScotEID has recorded against your holding." />
          <ul className={cn('divide-y divide-stone-100 border-t border-stone-100')}>
            {data.events.slice(0, 30).map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 px-5 py-2 text-sm">
                <span><span className="font-medium text-stone-800">{e.label}</span> · {e.animalId ? <Link href={`/livestock/view?id=${e.animalId}`} className="font-mono text-brand-700 hover:underline">{fmtTag(e.tag)}</Link> : <span className="font-mono">{fmtTag(e.tag)}</span>}</span>
                <span className="text-stone-500">{fmtDate(e.date)}{e.notificationDate && e.notificationDate !== e.date ? ` · reported ${fmtDate(e.notificationDate)}` : ''}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}
