import Link from 'next/link'

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation */}
      <nav className="bg-white border-b border-gray-200 shadow-sm">
        <div className="container mx-auto px-6">
          <div className="flex items-center justify-between h-16">
            <Link href="/dashboard" className="flex items-center space-x-2">
              <span className="text-2xl font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
                🐄 Cattle Management
              </span>
            </Link>

            <div className="flex items-center space-x-6">
              <Link href="/dashboard" className="text-sm font-medium transition-colors hover:text-primary">
                Dashboard
              </Link>
              <Link href="/cattle" className="text-sm font-medium transition-colors hover:text-primary">
                Cattle
              </Link>
              <Link href="/analytics" className="text-sm font-medium transition-colors hover:text-primary">
                Analytics
              </Link>
              <Link href="/breeding" className="text-sm font-medium transition-colors hover:text-primary">
                Breeding
              </Link>
              <Link href="/financials" className="text-sm font-medium transition-colors hover:text-primary">
                Financials
              </Link>
              <Link href="/lineage" className="text-sm font-medium transition-colors hover:text-primary">
                Lineage
              </Link>
              <Link href="/health" className="text-sm font-medium transition-colors hover:text-primary">
                Health
              </Link>
              <Link href="/upload" className="text-sm font-medium transition-colors hover:text-primary">
                Upload
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main>{children}</main>
    </div>
  )
}
