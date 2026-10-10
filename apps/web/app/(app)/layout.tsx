'use client'

import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { AppShell } from '@/components/shell'
import { useMe } from '@/lib/session'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { data: me, isLoading, isError, refetch } = useMe()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (isLoading || isError) return
    if (!me) router.replace(`/login?next=${encodeURIComponent(pathname + window.location.search)}`)
    else if (!me.farm) router.replace('/onboarding')
  }, [me, isLoading, isError, router, pathname])

  if (isError) {
    return (
      <div className="grid min-h-screen place-items-center p-6 text-center">
        <div>
          <p className="font-medium text-stone-900">We couldn’t reach the server.</p>
          <button className="mt-3 text-sm font-medium text-brand-700 hover:underline" onClick={() => refetch()}>Try again</button>
        </div>
      </div>
    )
  }
  if (!me?.farm) {
    return <div className="grid min-h-screen place-items-center"><Loader2 className="size-6 animate-spin text-brand-600" /></div>
  }
  return <AppShell>{children}</AppShell>
}
