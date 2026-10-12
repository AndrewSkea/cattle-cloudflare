'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  BarChart3, Bell, Boxes, CalendarDays, Check, ChevronsUpDown, ClipboardList, Gavel, GitBranch, HeartPulse, Landmark, LayoutDashboard, LogOut,
  Map as MapIcon, Menu as MenuIcon, PawPrint, Plus, Search, Settings, Sprout, Tractor, User, Users, Wallet, X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSession, useSignOut, useSwitchFarm } from '@/lib/session'
import { useAnimalOptions } from '@/lib/queries'
import { animalLabel, initials } from '@/lib/format'
import { ROLE_META, speciesInfo } from '@/lib/constants'
import { Avatar, Badge } from './ui/display'
import { FeedbackButton } from './feedback'
import { InstallAppButton } from './install'
import { type QuickAddKind, QuickAddItems, QuickAddSheets } from './quick-add'
import { Menu, MenuDivider, MenuItem } from './ui/overlay'
import type { Role } from '@/lib/types'

/** `section`: the item can be hidden in Farm settings (HIDEABLE_SECTIONS) */
interface NavItem { href: string; label: string; icon: React.ComponentType<{ className?: string }>; min?: Role; section?: string }

const NAV: { section: string; items: NavItem[] }[] = [
  { section: 'Overview', items: [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/calendar', label: 'Calendar', icon: CalendarDays, section: 'calendar' },
    { href: '/tasks', label: 'Tasks', icon: ClipboardList, section: 'tasks' },
  ] },
  { section: 'Livestock', items: [
    { href: '/livestock', label: 'Animals', icon: PawPrint },
    { href: '/breeding', label: 'Breeding', icon: Sprout },
    { href: '/health', label: 'Health', icon: HeartPulse, section: 'health' },
    { href: '/families', label: 'Families', icon: GitBranch, section: 'families' },
    { href: '/traceability', label: 'Traceability', icon: Landmark, section: 'traceability' },
  ] },
  { section: 'Farm', items: [
    { href: '/land', label: 'Land & map', icon: MapIcon, section: 'land' },
    { href: '/equipment', label: 'Equipment', icon: Tractor, section: 'equipment' },
    { href: '/inventory', label: 'Inventory', icon: Boxes, section: 'inventory' },
  ] },
  { section: 'Business', items: [
    { href: '/mart', label: 'Mart sales', icon: Gavel, section: 'mart' },
    { href: '/finance', label: 'Finances', icon: Wallet, min: 'manager', section: 'finance' },
    { href: '/reports', label: 'Reports', icon: BarChart3, section: 'reports' },
    { href: '/team', label: 'Team', icon: Users },
  ] },
]

export function Logo({ className, light }: { className?: string; light?: boolean }) {
  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      <span className={cn('grid size-8 place-items-center rounded-xl', light ? 'bg-white/10' : 'bg-brand-50 ring-1 ring-brand-100')}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon.svg" alt="" className="size-5" />
      </span>
      <span className={cn('font-display text-lg font-semibold tracking-tight', light ? 'text-white' : 'text-stone-900')}>HoovesWho</span>
    </span>
  )
}

function FarmSwitcher() {
  const { me, farm, role } = useSession()
  const switchFarm = useSwitchFarm()
  return (
    <Menu align="left" className="w-full" trigger={
      <button className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition hover:bg-white/5 focus-ring">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-wheat-400/90 font-display text-sm font-semibold text-brand-950">{initials(farm.name)}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-white">{farm.name}</span>
          <span className="block truncate text-xs text-brand-200/80">{ROLE_META[role].label}{farm.holdingNumber ? ` · ${farm.holdingNumber}` : ''}</span>
        </span>
        <ChevronsUpDown className="size-4 text-brand-200/70" />
      </button>
    }>
      <p className="px-2.5 pb-1 pt-1.5 text-xs font-medium text-stone-400">Your farms</p>
      {me.farms.map((f) => (
        <MenuItem key={f.id} onClick={() => f.id !== farm.id && switchFarm(f.id)}>
          <span className="flex-1 truncate">{f.name}</span>
          {f.id === farm.id ? <Check className="size-4 text-brand-700" /> : <span className="text-xs text-stone-400">{ROLE_META[f.role].label}</span>}
        </MenuItem>
      ))}
      <MenuDivider />
      <MenuItem icon={Plus} href="/onboarding?new=1">Create or join a farm</MenuItem>
    </Menu>
  )
}

/** The nav list scrolls on short screens; a fade at the bottom shows there is more below. */
function ScrollFade({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLElement>(null)
  const [more, setMore] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const check = () => setMore(el.scrollHeight - el.scrollTop - el.clientHeight > 4)
    check()
    const ro = new ResizeObserver(check)
    ro.observe(el)
    el.addEventListener('scroll', check, { passive: true })
    return () => { ro.disconnect(); el.removeEventListener('scroll', check) }
  }, [])
  return (
    <div className="relative min-h-0 flex-1">
      <nav ref={ref} className="h-full space-y-4 overflow-y-auto px-3 py-3 scrollbar-thin">{children}</nav>
      <div aria-hidden className={cn('pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-brand-900 to-transparent transition-opacity', more ? 'opacity-100' : 'opacity-0')} />
    </div>
  )
}

/** Menu items this person can use on this farm: role allows it and the farm hasn't hidden the section. */
function useNavItems() {
  const { can, shows } = useSession()
  return (items: NavItem[]) => items.filter((i) => (!i.min || can(i.min)) && (!i.section || shows(i.section)))
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname()
  const visible = useNavItems()
  return (
    <div className="flex h-full flex-col bg-brand-900 text-brand-100">
      <div className="px-4 pb-2 pt-5">
        <Link href="/dashboard" onClick={onNavigate}><Logo light /></Link>
      </div>
      <div className="px-2 pb-2 pt-3"><FarmSwitcher /></div>
      <ScrollFade>
        {NAV.map((g) => {
          const items = visible(g.items)
          if (!items.length) return null
          return (
            <div key={g.section}>
              <p className="px-2.5 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-brand-300/60">{g.section}</p>
              <ul className="space-y-0.5">
                {items.map((i) => {
                  const active = pathname === i.href || pathname.startsWith(i.href + '/')
                  return (
                    <li key={i.href}>
                      <Link href={i.href} onClick={onNavigate} aria-current={active ? 'page' : undefined}
                        className={cn('group flex items-center gap-3 rounded-lg px-2.5 py-1.5 text-sm font-medium transition',
                          active ? 'bg-white/10 text-white' : 'text-brand-100/80 hover:bg-white/5 hover:text-white')}>
                        <i.icon className={cn('size-[18px]', active ? 'text-wheat-300' : 'text-brand-300/80 group-hover:text-brand-200')} />
                        {i.label}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        })}
      </ScrollFade>
      <div className="space-y-0.5 border-t border-white/10 p-3">
        <InstallAppButton className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium text-brand-100/80 transition hover:bg-white/5 hover:text-white" />
        <Link href="/settings" onClick={onNavigate} className={cn('flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium transition',
          pathname.startsWith('/settings') ? 'bg-white/10 text-white' : 'text-brand-100/80 hover:bg-white/5 hover:text-white')}>
          <Settings className="size-[18px] text-brand-300/80" /> Farm settings
        </Link>
      </div>
    </div>
  )
}

function QuickFind({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: animals = [] } = useAnimalOptions()
  const router = useRouter()
  const visible = useNavItems()
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => { if (open) { setQ(''); setActive(0); setTimeout(() => inputRef.current?.focus(), 30) } }, [open])

  const pages = visible(NAV.flatMap((g) => g.items)).concat([{ href: '/settings', label: 'Farm settings', icon: Settings }, { href: '/profile', label: 'Profile', icon: User }])
  const results = useMemo(() => {
    const s = q.trim().toLowerCase()
    const pageHits = pages.filter((p) => !s || p.label.toLowerCase().includes(s)).map((p) => ({ key: p.href, label: p.label, sub: 'Page', href: p.href, emoji: null as string | null }))
    const animalHits = s ? animals.filter((a) => `${a.tagNo} ${a.managementTag || ''} ${a.name || ''} ${a.breed || ''} ${a.formerTags || ''}`.toLowerCase().includes(s)).slice(0, 12)
      .map((a) => ({ key: `a${a.id}`, label: animalLabel(a), sub: `${a.tagNo}${a.formerTags ? ` · was ${a.formerTags}` : ''}${a.status !== 'active' ? ` · ${a.status}` : ''}`, href: `/livestock/view?id=${a.id}`, emoji: speciesInfo(a.species).emoji })) : []
    return [...animalHits, ...pageHits].slice(0, 16)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, animals])

  if (!open) return null
  const go = (href: string) => { onClose(); router.push(href) }
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[12vh]">
      <div className="absolute inset-0 animate-fade-in bg-stone-950/35 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative w-full max-w-xl animate-scale-in overflow-hidden rounded-2xl bg-white shadow-pop ring-1 ring-stone-900/10">
        <div className="flex items-center gap-3 border-b border-stone-100 px-4">
          <Search className="size-5 text-stone-400" />
          <input ref={inputRef} value={q} onChange={(e) => { setQ(e.target.value); setActive(0) }} placeholder="Find an animal by tag or name, or jump to a page…"
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)) }
              if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
              if (e.key === 'Enter' && results[active]) go(results[active].href)
              if (e.key === 'Escape') onClose()
            }}
            className="h-14 w-full border-0 bg-transparent p-0 text-[15px] focus:outline-none focus:ring-0" />
          <kbd className="rounded-md bg-stone-100 px-1.5 py-0.5 text-[11px] text-stone-500">Esc</kbd>
        </div>
        <ul className="max-h-[50vh] overflow-y-auto p-2">
          {results.length === 0 && <li className="px-3 py-8 text-center text-sm text-stone-500">Nothing found for “{q}”</li>}
          {results.map((r, i) => (
            <li key={r.key}>
              <button onMouseEnter={() => setActive(i)} onClick={() => go(r.href)}
                className={cn('flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left', i === active && 'bg-stone-100')}>
                <span className="grid size-7 place-items-center rounded-md bg-stone-100 text-sm">{r.emoji || '→'}</span>
                <span className="flex-1 truncate text-sm font-medium text-stone-800">{r.label}</span>
                <span className="text-xs text-stone-400">{r.sub}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

/** Phone-only tab bar: the pages used out in the field, with Quick add in the middle. */
function BottomBar() {
  const pathname = usePathname()
  const { can, shows } = useSession()
  const [sheet, setSheet] = useState<QuickAddKind>(null)
  const tabs: NavItem[] = [
    { href: '/dashboard', label: 'Home', icon: LayoutDashboard },
    { href: '/livestock', label: 'Animals', icon: PawPrint },
    { href: '/breeding', label: 'Breeding', icon: Sprout },
    shows('tasks') ? { href: '/tasks', label: 'Tasks', icon: ClipboardList } : { href: '/reports', label: 'Reports', icon: BarChart3 },
  ]
  const tab = (t: NavItem) => {
    const active = pathname === t.href || pathname.startsWith(t.href + '/')
    return (
      <Link key={t.href} href={t.href} aria-current={active ? 'page' : undefined}
        className={cn('flex flex-1 flex-col items-center gap-0.5 pb-1 pt-2 text-[11px] font-medium', active ? 'text-brand-800' : 'text-stone-500')}>
        <t.icon className={cn('size-[22px]', active ? 'text-brand-700' : 'text-stone-400')} />{t.label}
      </Link>
    )
  }
  return (
    <>
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 border-t border-stone-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden">
        <div className="mx-auto flex max-w-md items-stretch">
          {tabs.slice(0, 2).map(tab)}
          <div className="flex flex-1 items-center justify-center">
            {can('worker') ? (
              <Menu side="top" align="center" trigger={
                <button aria-label="Quick add" className="grid size-12 place-items-center rounded-full bg-brand-700 text-white shadow-lift transition active:scale-95 focus-ring"><Plus className="size-6" /></button>
              }>
                <QuickAddItems onPick={setSheet} />
              </Menu>
            ) : <span />}
          </div>
          {tabs.slice(2).map(tab)}
        </div>
      </nav>
      <QuickAddSheets sheet={sheet} onClose={() => setSheet(null)} />
    </>
  )
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [findOpen, setFindOpen] = useState(false)
  const { user } = useSession()
  const signOut = useSignOut()

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setFindOpen((o) => !o) }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 lg:block"><Sidebar /></aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 animate-fade-in bg-stone-950/40" onClick={() => setMobileOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 animate-slide-up shadow-pop">
            <Sidebar onNavigate={() => setMobileOpen(false)} />
            <button className="absolute right-3 top-5 rounded-lg p-1.5 text-brand-100 hover:bg-white/10" onClick={() => setMobileOpen(false)} aria-label="Close menu"><X className="size-5" /></button>
          </div>
        </div>
      )}
      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 border-b border-stone-200/70 bg-stone-50/85 backdrop-blur-md">
          <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:px-6 lg:px-8">
            <button className="-ml-1 rounded-lg p-2 text-stone-600 hover:bg-stone-200/60 lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open menu"><MenuIcon className="size-5" /></button>
            <button onClick={() => setFindOpen(true)}
              className="flex h-9 w-full max-w-md items-center gap-2.5 rounded-lg bg-white px-3 text-sm text-stone-400 shadow-sm ring-1 ring-stone-200 transition hover:ring-stone-300 focus-ring">
              <Search className="size-4" />
              <span className="flex-1 text-left">Find animal or page…</span>
              <kbd className="hidden rounded bg-stone-100 px-1.5 py-0.5 text-[11px] font-medium text-stone-500 sm:block">⌘K</kbd>
            </button>
            <div className="ml-auto flex items-center gap-2">
              <FeedbackButton />
              <Menu trigger={
                <button className="flex items-center gap-2 rounded-full p-0.5 transition hover:ring-4 hover:ring-stone-200/70 focus-ring" aria-label="Account menu">
                  <Avatar name={initials(user?.name, user?.email)} src={user?.avatarUrl} size={32} />
                </button>
              }>
                <div className="px-2.5 pb-2 pt-1.5">
                  <p className="truncate text-sm font-semibold text-stone-900">{user?.name || 'Your account'}</p>
                  <p className="truncate text-xs text-stone-500">{user?.email}</p>
                </div>
                <MenuDivider />
                <MenuItem icon={User} href="/profile">Profile</MenuItem>
                <MenuItem icon={Bell} href="/profile#reminders">Reminders</MenuItem>
                <MenuItem icon={Settings} href="/settings">Farm settings</MenuItem>
                <MenuDivider />
                <MenuItem icon={LogOut} onClick={signOut}>Sign out</MenuItem>
              </Menu>
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-4 pb-28 pt-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      </div>
      <BottomBar />
      <QuickFind open={findOpen} onClose={() => setFindOpen(false)} />
    </div>
  )
}

export function RoleBadge({ role }: { role: Role }) {
  return <Badge tone={ROLE_META[role].tone}>{ROLE_META[role].label}</Badge>
}
