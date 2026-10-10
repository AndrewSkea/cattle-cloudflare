import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="grid min-h-screen place-items-center bg-stone-50 p-6 text-center">
      <div>
        <p className="font-display text-6xl font-semibold text-brand-700">404</p>
        <h1 className="mt-3 text-xl font-semibold text-stone-900">This gate’s shut</h1>
        <p className="mt-1 text-sm text-stone-500">The page you’re looking for doesn’t exist.</p>
        <Link href="/dashboard" className="mt-6 inline-flex h-10 items-center rounded-lg bg-brand-700 px-5 text-sm font-medium text-white hover:bg-brand-800">Back to the farm</Link>
      </div>
    </div>
  )
}
