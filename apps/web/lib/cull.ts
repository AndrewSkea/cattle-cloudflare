import { differenceInCalendarDays, parseISO } from 'date-fns'
import { fmtDate } from './format'
import type { AnimalListItem, BirthRecord, BreedingRecord } from './types'

export interface CullReason { text: string; weight: number }
export interface CullCandidate {
  id: number
  tag: string
  ageMonths: number | null
  breed: string | null
  reasons: CullReason[]
  score: number
  /** Due date when she is in calf now: worth waiting for the calf before selling */
  dueDate: string | null
  lastCalved: string | null
  calves: number
}

const days = (a: string, b: string) => differenceInCalendarDays(parseISO(b), parseISO(a))

/**
 * Cows (and older heifers) worth considering for culling, with the reasons. Each reason has a weight;
 * a cow is listed when the weights add up to 2 or more, so one strong reason (scanned empty) or two minor ones.
 */
export function cullCandidates(animals: AnimalListItem[], births: BirthRecord[], breeding: BreedingRecord[], today: string): CullCandidate[] {
  const birthsBy = new Map<number, BirthRecord[]>()
  for (const b of births) {
    if (!birthsBy.has(b.damId)) birthsBy.set(b.damId, [])
    birthsBy.get(b.damId)!.push(b)
  }
  const breedingBy = new Map<number, BreedingRecord[]>()
  for (const b of breeding) {
    if (b.event === 'heat') continue
    if (!breedingBy.has(b.animalId)) breedingBy.set(b.animalId, [])
    breedingBy.get(b.animalId)!.push(b)
  }
  const out: CullCandidate[] = []
  for (const a of animals) {
    if (a.status !== 'active' || a.species !== 'cattle' || a.sex !== 'female' || (a.ageMonths ?? 0) < 24) continue
    const bs = (birthsBy.get(a.id) || []).slice().sort((x, y) => x.date.localeCompare(y.date))
    const recs = (breedingBy.get(a.id) || []).slice().sort((x, y) => x.date.localeCompare(y.date) || x.id - y.id)
    const latest = recs[recs.length - 1]
    const pregnant = latest && latest.outcome === 'pending' && latest.scanResult !== 'empty' ? latest : null
    const reasons: CullReason[] = []
    const lastBirth = bs[bs.length - 1]?.date ?? null

    if (latest && !pregnant && days(latest.date, today) <= 400 && (latest.scanResult === 'empty' || latest.outcome === 'failed' || latest.outcome === 'aborted')) {
      reasons.push({ text: latest.scanResult === 'empty' ? `Scanned empty ${fmtDate(latest.date, 'MMM yyyy')}` : `Not in calf (${fmtDate(latest.date, 'MMM yyyy')})`, weight: 3 })
    }
    if (!pregnant) {
      if (lastBirth && days(lastBirth, today) > 456) reasons.push({ text: `No calf since ${fmtDate(lastBirth, 'MMM yyyy')}`, weight: 2 })
      if (!lastBirth && (a.ageMonths ?? 0) >= 30) reasons.push({ text: `${Math.floor((a.ageMonths ?? 0) / 12)} years old and never calved`, weight: 2 })
    }
    const intervals: number[] = []
    for (let i = 1; i < bs.length; i++) { const d = days(bs[i - 1].date, bs[i].date); if (d > 200) intervals.push(d) }
    if (intervals.length >= 2) {
      const avg = intervals.reduce((s, x) => s + x, 0) / intervals.length
      if (avg > 425) reasons.push({ text: `Calves every ${Math.round(avg)} days on average`, weight: avg > 485 ? 2 : 1 })
    }
    if ((a.ageMonths ?? 0) >= 144) reasons.push({ text: `${Math.floor((a.ageMonths ?? 0) / 12)} years old`, weight: (a.ageMonths ?? 0) >= 168 ? 2 : 1 })
    const recent = bs.filter((b) => days(b.date, today) <= 3 * 365)
    const lost = recent.filter((b) => b.outcome !== 'alive')
    if (lost.length) reasons.push({ text: `Lost ${lost.length === 1 ? 'a calf' : `${lost.length} calves`} (${[...new Set(lost.map((b) => b.date.slice(0, 4)))].join(', ')})`, weight: Math.min(2, lost.length) })
    const hard = recent.filter((b) => b.ease && ['hard_pull', 'vet', 'caesarean'].includes(b.ease))
    if (hard.length) reasons.push({ text: `Hard calving (${[...new Set(hard.map((b) => b.date.slice(0, 4)))].join(', ')})`, weight: 1 })
    const note = a.notes?.match(/[^.\n]*\b(farrow|barren|cull)\w*[^.\n]*/i)
    if (note) reasons.push({ text: `Notes: “${note[0].trim().slice(0, 60)}”`, weight: 2 })

    const score = reasons.reduce((s, r) => s + r.weight, 0)
    if (score < 2) continue
    out.push({
      id: a.id, tag: a.managementTag || a.tagNo, ageMonths: a.ageMonths, breed: a.breed, reasons: reasons.sort((x, y) => y.weight - x.weight),
      score, dueDate: pregnant?.expectedDueDate ?? null, lastCalved: lastBirth, calves: bs.filter((b) => b.outcome === 'alive').length,
    })
  }
  return out.sort((x, y) => y.score - x.score || (y.ageMonths ?? 0) - (x.ageMonths ?? 0))
}
