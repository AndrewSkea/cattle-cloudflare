export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-green-50 to-emerald-50">
      <div className="text-center">
        <h1 className="text-6xl font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent mb-4">
          Cattle Management System
        </h1>
        <p className="text-2xl text-muted-foreground mb-8">
          Modern, cloud-native herd management
        </p>
        <a
          href="/dashboard"
          className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-8 py-6 text-lg shadow-lg hover:shadow-xl"
        >
          Get Started →
        </a>
      </div>
    </div>
  )
}
