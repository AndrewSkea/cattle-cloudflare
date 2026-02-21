'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { useAuth } from '@/lib/auth-context'
import {
  LayoutDashboard,
  CircleDot,
  Map,
  Heart,
  GitBranch,
  Activity,
  PoundSterling,
  BarChart3,
  CheckSquare,
  Upload,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
  User,
  Settings,
} from 'lucide-react'

const navLinks = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/cattle', label: 'Cattle', icon: CircleDot },
  { href: '/fields', label: 'Fields', icon: Map },
  { href: '/breeding', label: 'Breeding', icon: Heart },
  { href: '/lineage', label: 'Lineage', icon: GitBranch },
  { href: '/health', label: 'Health', icon: Activity },
  { href: '/financials', label: 'Financials', icon: PoundSterling },
  { href: '/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/tasks', label: 'Tasks', icon: CheckSquare },
  { href: '/upload', label: 'Upload', icon: Upload },
  { href: '/settings/profile', label: 'Profile', icon: User },
  { href: '/settings/farm', label: 'Farm Settings', icon: Settings },
]

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const pathname = usePathname()
  const router = useRouter()
  const { user, farms, activeFarmId, isLoading, isAuthenticated, switchFarm, logout } = useAuth()

  useEffect(() => {
    const saved = localStorage.getItem('sidebar-collapsed')
    if (saved === 'true') setCollapsed(true)
  }, [])

  useEffect(() => {
    localStorage.setItem('sidebar-collapsed', String(collapsed))
  }, [collapsed])

  // Close mobile menu on route change
  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  // Auth redirects
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login')
    } else if (!isLoading && isAuthenticated && farms.length === 0) {
      router.push('/onboarding')
    }
  }, [isLoading, isAuthenticated, farms, router])

  const isActive = (href: string) => pathname === href || pathname?.startsWith(href + '/')

  const activeFarm = farms.find(f => f.id === activeFarmId)

  // Show loading while checking auth
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-green-200 border-t-green-600 rounded-full" />
      </div>
    )
  }

  if (!isAuthenticated || farms.length === 0) {
    return null
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 bg-white border-r border-gray-200 flex flex-col transition-all duration-300 ease-in-out
          ${collapsed ? 'w-[68px]' : 'w-64'}
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        {/* Logo */}
        <div className={`flex items-center h-16 border-b border-gray-200 px-4 ${collapsed ? 'justify-center' : ''}`}>
          <Link href="/dashboard" className="flex items-center gap-2 min-w-0">
            <span className="text-2xl flex-shrink-0">🐄</span>
            {!collapsed && (
              <span className="text-lg font-bold text-gray-900 truncate">
                HoovesWho
              </span>
            )}
          </Link>
        </div>

        {/* Farm Switcher */}
        {!collapsed && activeFarm && (
          <div className="px-3 py-2 border-b border-gray-200">
            <select
              value={activeFarmId || ''}
              onChange={(e) => switchFarm(Number(e.target.value))}
              className="w-full px-2 py-1.5 text-sm bg-gray-50 border border-gray-200 rounded-lg"
            >
              {farms.map(f => (
                <option key={f.id} value={f.id}>{f.name} ({f.role})</option>
              ))}
            </select>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-4 px-3">
          <ul className="space-y-1">
            {navLinks.map((link) => {
              const Icon = link.icon
              const active = isActive(link.href)
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
                      ${active
                        ? 'bg-green-50 text-green-700'
                        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                      }
                      ${collapsed ? 'justify-center' : ''}
                    `}
                    title={collapsed ? link.label : undefined}
                  >
                    <Icon className={`w-5 h-5 flex-shrink-0 ${active ? 'text-green-600' : 'text-gray-400'}`} />
                    {!collapsed && <span>{link.label}</span>}
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>

        {/* User section */}
        <div className="border-t border-gray-200 p-3">
          <div className={`flex items-center gap-3 ${collapsed ? 'justify-center' : ''}`}>
            {user?.avatarUrl && (
              <img src={user.avatarUrl} alt="" className="w-8 h-8 rounded-full flex-shrink-0" referrerPolicy="no-referrer" />
            )}
            {!collapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{user?.name}</p>
                <button onClick={logout} className="text-xs text-gray-500 hover:text-red-600">
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Collapse toggle (desktop only) */}
        <div className="hidden lg:block border-t border-gray-200 p-3">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="flex items-center justify-center w-full px-3 py-2 rounded-lg text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? (
              <ChevronRight className="w-5 h-5" />
            ) : (
              <>
                <ChevronLeft className="w-5 h-5 mr-2" />
                <span>Collapse</span>
              </>
            )}
          </button>
        </div>

        {/* Mobile close button */}
        <button
          onClick={() => setMobileOpen(false)}
          className="lg:hidden absolute top-4 right-4 p-1 rounded-md text-gray-500 hover:bg-gray-100"
        >
          <X className="w-5 h-5" />
        </button>
      </aside>

      {/* Main content area */}
      <div className={`flex-1 flex flex-col min-h-screen transition-all duration-300 ${collapsed ? 'lg:ml-[68px]' : 'lg:ml-64'}`}>
        {/* Mobile header */}
        <header className="lg:hidden sticky top-0 z-30 flex items-center h-14 bg-white border-b border-gray-200 px-4">
          <button
            onClick={() => setMobileOpen(true)}
            className="p-2 -ml-2 rounded-md text-gray-600 hover:bg-gray-100"
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <span className="ml-3 text-lg font-bold text-gray-900">🐄 HoovesWho</span>
          {activeFarm && (
            <span className="ml-auto text-sm text-gray-500 truncate">{activeFarm.name}</span>
          )}
        </header>

        {/* Page content */}
        <main className="flex-1">{children}</main>
      </div>
    </div>
  )
}
