'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Maximize2, Minus, Plus } from 'lucide-react'
import { fmtAge, fmtDate, fmtMoney, fmtNum } from '@/lib/format'
import { STATUS_META } from '@/lib/constants'
import { useSession } from '@/lib/session'
import { cn } from '@/lib/utils'
import type { FamilyTree, FamilyTreeNode, FamilyTreeUp } from '@/lib/types'

// Box size and spacing (SVG units = px at 100% zoom)
const W = 132
const H = 52
const GX = 14
const GY = 46

interface Placed {
  key: string
  x: number // centre
  y: number // top
  node: FamilyTreeNode | null
  /** Shown for a sire that isn't on the farm (AI or a hired bull) */
  external?: string
  role?: string
}

interface Shape { key: string; node: FamilyTreeNode | null; external?: string; role?: string; children: Shape[] }

/** Tidy layout: leaves get consecutive slots, parents sit centred over their children. Returns x per key. */
function layout(root: Shape): Map<string, number> {
  const xs = new Map<string, number>()
  let next = 0
  const walk = (s: Shape): number => {
    if (!s.children.length) { const x = next++ * (W + GX); xs.set(s.key, x); return x }
    const cx = s.children.map(walk)
    const x = (cx[0] + cx[cx.length - 1]) / 2
    xs.set(s.key, x)
    return x
  }
  walk(root)
  return xs
}

function upShape(t: FamilyTreeUp | null, nodes: FamilyTree['nodes'], key: string, role: string, depth: number, maxUp: number): Shape | null {
  if (!t) return null
  const kids: Shape[] = []
  if (depth < maxUp) {
    const sire = t.sire ? upShape(t.sire, nodes, `${key}s`, 'Sire', depth + 1, maxUp)
      : t.sireName ? { key: `${key}s`, node: null, external: t.sireName, role: 'Sire', children: [] } : null
    const dam = upShape(t.dam, nodes, `${key}d`, 'Dam', depth + 1, maxUp)
    if (sire) kids.push(sire)
    if (dam) kids.push(dam)
  }
  return { key, node: t.id ? nodes[t.id] : null, role, children: kids }
}

function downShape(t: FamilyTree['down'], nodes: FamilyTree['nodes'], key: string): Shape {
  return { key, node: nodes[t.id], children: t.children.map((c) => downShape(c, nodes, `${key}.${c.id}`)) }
}

function label(n: FamilyTreeNode) { return n.managementTag || n.tagNo }

function sexWord(n: FamilyTreeNode) {
  if (n.sex === 'female') return 'Female'
  return n.castrated ? 'Steer' : 'Male'
}

/**
 * Interactive family tree: ancestors above the animal, descendants below. Hover, focus or tap a box for a summary;
 * click (or tap again) to open that animal.
 */
export function FamilyTreeDiagram({ tree, maxUp = 3, emptyHint }: { tree: FamilyTree; maxUp?: number; emptyHint?: string }) {
  const router = useRouter()
  const scroller = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<{ p: Placed; rect: DOMRect } | null>(null)
  const [tapped, setTapped] = useState<string | null>(null)

  const { placed, edges, width, height, rootX } = useMemo(() => {
    const ups = upShape(tree.up, tree.nodes, 'r', 'This animal', 0, maxUp)!
    const downs = downShape(tree.down, tree.nodes, 'r')
    const ux = layout(ups)
    const dx = layout(downs)
    const shiftUp = -ux.get('r')!
    const shiftDown = -dx.get('r')!
    const placed: Placed[] = []
    const edges: { from: Placed; to: Placed }[] = []
    const byKey = new Map<string, Placed>()
    // Ancestors: generation g sits g rows above the animal
    const walkUp = (s: Shape, gen: number) => {
      const p: Placed = { key: `u${s.key}`, x: ux.get(s.key)! + shiftUp, y: -gen * (H + GY), node: s.node, external: s.external, role: s.role }
      if (gen === 0) { byKey.set('root', p); placed.push(p) } else placed.push(p)
      byKey.set(`u${s.key}`, p)
      for (const c of s.children) { const cp = walkUp(c, gen + 1); edges.push({ from: cp, to: gen === 0 ? byKey.get('root')! : p }) }
      return p
    }
    walkUp(ups, 0)
    const walkDown = (s: Shape, gen: number, parent: Placed | null) => {
      const p = gen === 0 ? byKey.get('root')! : { key: `d${s.key}`, x: dx.get(s.key)! + shiftDown, y: gen * (H + GY), node: s.node }
      if (gen > 0) { placed.push(p); edges.push({ from: parent!, to: p }) }
      for (const c of s.children) walkDown(c, gen + 1, p)
    }
    walkDown(downs, 0, null)
    const minX = Math.min(...placed.map((p) => p.x)) - W / 2
    const maxX = Math.max(...placed.map((p) => p.x)) + W / 2
    const minY = Math.min(...placed.map((p) => p.y))
    const maxY = Math.max(...placed.map((p) => p.y)) + H
    const pad = 12
    for (const p of placed) { p.x += pad - minX; p.y += pad - minY }
    return { placed, edges, width: maxX - minX + pad * 2, height: maxY - minY + pad * 2, rootX: byKey.get('root')!.x }
  }, [tree, maxUp])

  // Start zoomed to fit the width (but not too small to read), with the animal in view.
  const [scale, setScale] = useState(1)
  const fitScale = () => Math.min(1, ((scroller.current?.clientWidth || width) - 8) / width)
  const fit = () => setScale(Math.max(0.3, fitScale()))
  // Wide trees (a bull's calves) stay readable and scroll sideways; the fit button shows the whole tree.
  useLayoutEffect(() => setScale(Math.max(0.75, fitScale())), [width]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const el = scroller.current
    if (el) el.scrollLeft = Math.max(0, rootX * scale - el.clientWidth / 2)
  }, [rootX, scale])

  const open = (p: Placed) => { if (p.node) router.push(`/livestock/view?id=${p.node.id}&tab=family`) }
  const show = (p: Placed, el: Element) => { if (p.node) setHover({ p, rect: el.getBoundingClientRect() }) }

  const onlyRoot = placed.length === 1
  return (
    <div className="relative">
      <div ref={scroller} className="max-h-[70vh] overflow-auto rounded-xl bg-stone-50/60 ring-1 ring-stone-100 scrollbar-thin" onScroll={() => setHover(null)}>
        <svg width={width * scale} height={height * scale} viewBox={`0 0 ${width} ${height}`} role="group" aria-label="Family tree" className="block select-none">
          <g fill="none" stroke="#d6d3d1" strokeWidth={1.5}>
            {edges.map((e, i) => {
              const x1 = e.from.x, y1 = e.from.y + H, x2 = e.to.x, y2 = e.to.y
              const my = (y1 + y2) / 2
              return <path key={i} d={`M${x1},${y1} V${my} H${x2} V${y2}`} />
            })}
          </g>
          {placed.map((p) => {
            const n = p.node
            const isRoot = n?.id === tree.rootId && p.key === placed[0].key
            if (!n) {
              return (
                <g key={p.key} transform={`translate(${p.x - W / 2},${p.y})`}>
                  <rect width={W} height={H} rx={10} fill="#fff" stroke="#d6d3d1" strokeDasharray="4 3" />
                  <text x={W / 2} y={22} textAnchor="middle" className="fill-stone-600 text-[12px] font-medium">{truncate(p.external || 'Unknown', 18)}</text>
                  <text x={W / 2} y={38} textAnchor="middle" className="fill-stone-400 text-[10px]">{p.role === 'Sire' ? 'Sire · not on farm' : 'Not on record'}</text>
                </g>
              )
            }
            const female = n.sex === 'female'
            const gone = n.status !== 'active'
            const sub = gone
              ? `${STATUS_META[n.status]?.label || n.status}${n.exitDate ? ` ${n.exitDate.slice(0, 4)}` : ''}`
              : [n.breed ? shortBreed(n.breed) : null, n.dob ? n.dob.slice(0, 4) : n.birthYear].filter(Boolean).join(' · ')
            return (
              <g key={p.key} transform={`translate(${p.x - W / 2},${p.y})`} role="link" tabIndex={0}
                aria-label={`${label(n)}${n.name ? ` ${n.name}` : ''}, ${sexWord(n).toLowerCase()}${gone ? `, ${STATUS_META[n.status]?.label.toLowerCase()}` : ''}`}
                className="cursor-pointer outline-none [&:focus-visible>rect]:stroke-brand-600 [&:focus-visible>rect]:[stroke-width:2.5]"
                onMouseEnter={(e) => show(p, e.currentTarget)} onMouseLeave={() => setHover(null)}
                onFocus={(e) => show(p, e.currentTarget)} onBlur={() => setHover(null)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(p) } }}
                onPointerUp={(e) => {
                  // Touch: first tap shows the summary, second opens the animal
                  if (e.pointerType === 'touch' && tapped !== p.key) { setTapped(p.key); show(p, e.currentTarget); return }
                  open(p)
                }}>
                <rect width={W} height={H} rx={10}
                  fill={gone ? '#fafaf9' : female ? '#f5f3ff' : '#f0f9ff'}
                  stroke={isRoot ? '#2f6449' : gone ? '#d6d3d1' : female ? '#c4b5fd' : '#7dd3fc'}
                  strokeWidth={isRoot ? 2.5 : 1.25} strokeDasharray={gone ? '5 3' : undefined} />
                <circle cx={14} cy={18} r={4} fill={female ? '#a78bfa' : '#38bdf8'} opacity={gone ? 0.45 : 1} />
                <text x={24} y={22} className={cn('text-[13px] font-semibold', gone ? 'fill-stone-500' : 'fill-stone-900')}>{truncate(label(n) + (n.name ? ` · ${n.name}` : ''), 15)}</text>
                <text x={14} y={40} className={cn('text-[10.5px]', gone ? 'fill-clay-600' : 'fill-stone-500')}>{truncate(String(sub || n.tagNo), 22)}</text>
              </g>
            )
          })}
        </svg>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-stone-500">
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-violet-400" />Female</span>
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-sky-400" />Male</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-4 rounded-sm border border-dashed border-stone-400" />No longer on farm</span>
        <span className="ml-auto hidden md:inline">Hover for details · click to open</span>
        <div className="ml-auto flex gap-1 rounded-lg bg-white p-0.5 shadow-sm ring-1 ring-stone-200 md:ml-2">
          <button type="button" aria-label="Zoom out" onClick={() => setScale((s) => Math.max(0.3, s / 1.25))} className="grid size-7 place-items-center rounded-md text-stone-600 hover:bg-stone-100"><Minus className="size-4" /></button>
          <button type="button" aria-label="Fit whole tree" onClick={fit} className="grid size-7 place-items-center rounded-md text-stone-600 hover:bg-stone-100"><Maximize2 className="size-3.5" /></button>
          <button type="button" aria-label="Zoom in" onClick={() => setScale((s) => Math.min(2, s * 1.25))} className="grid size-7 place-items-center rounded-md text-stone-600 hover:bg-stone-100"><Plus className="size-4" /></button>
        </div>
      </div>
      {onlyRoot && emptyHint && <p className="mt-3 text-sm text-stone-500">{emptyHint}</p>}
      {hover?.p.node && <TreeCard n={hover.p.node} rect={hover.rect} role={hover.p.role} />}
    </div>
  )
}

function TreeCard({ n, rect, role }: { n: FamilyTreeNode; rect: DOMRect; role?: string }) {
  const { currency } = useSession()
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: rect.left, top: rect.bottom + 8 })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const w = el.offsetWidth, h = el.offsetHeight
    let left = rect.left + rect.width / 2 - w / 2
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8))
    const top = rect.bottom + 8 + h > window.innerHeight ? rect.top - h - 8 : rect.bottom + 8
    setPos({ left, top: Math.max(8, top) })
  }, [rect])
  const gone = n.status !== 'active'
  const rows: [string, React.ReactNode][] = [
    ['Sex', sexWord(n)],
    ['Breed', n.breed],
    ['Born', n.dob ? fmtDate(n.dob) : n.birthYear],
    [gone ? `Age at ${n.status === 'died' ? 'death' : 'exit'}` : 'Age', n.ageMonths != null ? fmtAge(n.ageMonths) : null],
    ['Weight', n.latestWeightKg != null ? `${fmtNum(n.latestWeightKg)} kg${n.latestWeightDate ? ` (${fmtDate(n.latestWeightDate)})` : ''}` : null],
    ['Status', gone ? `${STATUS_META[n.status]?.label || n.status}${n.exitDate ? ` ${fmtDate(n.exitDate)}` : ''}` : 'On farm'],
    ['Sale', n.salePrice ? `${fmtMoney(n.salePrice, currency, { decimals: false })}${n.saleWeightKg ? ` · ${fmtNum(n.saleWeightKg)} kg` : ''}` : null],
    ['Reason', gone && n.exitReason && !/^(sold|died)$/i.test(n.exitReason) ? n.exitReason : null],
    ['Offspring', n.offspring || null],
  ]
  return (
    <div ref={ref} role="tooltip" style={{ left: pos.left, top: pos.top }}
      className="pointer-events-none fixed z-50 w-64 animate-fade-in rounded-xl bg-white p-3 text-sm shadow-pop ring-1 ring-stone-900/10">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-semibold text-stone-900">{label(n)}{n.name && <span className="font-normal text-stone-500"> · {n.name}</span>}</p>
          <p className="truncate text-xs text-stone-500">{n.tagNo}</p>
        </div>
        {role && role !== 'This animal' && <span className="shrink-0 rounded bg-stone-100 px-1.5 py-0.5 text-[10px] font-medium text-stone-500">{role}</span>}
      </div>
      <dl className="mt-2 grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-xs">
        {rows.filter(([, v]) => v != null && v !== '').map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-stone-400">{k}</dt>
            <dd className={cn('text-stone-800', k === 'Status' && gone && 'font-medium text-clay-700')}>{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

function truncate(s: string, n: number) { return s.length > n ? `${s.slice(0, n - 1)}…` : s }

function shortBreed(b: string) {
  return ({ 'Aberdeen Angus': 'Angus', Charolais: 'Char', Simmental: 'Simm', Limousin: 'Lim' } as Record<string, string>)[b] || b
}
