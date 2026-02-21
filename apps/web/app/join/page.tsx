import { Suspense } from 'react'
import JoinClient from './join-client'

function Loading() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="animate-spin w-8 h-8 border-4 border-green-200 border-t-green-600 rounded-full" />
    </div>
  )
}

export default function JoinPage() {
  return (
    <Suspense fallback={<Loading />}>
      <JoinClient />
    </Suspense>
  )
}
