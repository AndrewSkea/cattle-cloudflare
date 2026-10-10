/**
 * API client. The app and API share an origin, so requests are relative and the session cookie
 * is sent automatically. During `next dev` (port 3000) requests go to the local worker instead.
 */

export class ApiError extends Error {
  constructor(public status: number, message: string, public details?: any) {
    super(message)
  }
}

function base(): string {
  if (typeof window !== 'undefined' && window.location.port === '3000') return 'http://localhost:8787'
  return ''
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${base()}${path}`, {
    method,
    credentials: 'include',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (res.status === 401 && typeof window !== 'undefined') {
    const p = window.location.pathname
    if (!['/', '/login', '/join'].includes(p)) {
      window.location.href = `/login?next=${encodeURIComponent(p + window.location.search)}`
    }
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(res.status, data?.error || `Request failed (${res.status})`, data?.details)
  return data as T
}

export const api = {
  get: <T = any>(path: string) => request<T>('GET', path),
  post: <T = any>(path: string, body: unknown = {}) => request<T>('POST', path, body),
  put: <T = any>(path: string, body: unknown) => request<T>('PUT', path, body),
  del: <T = any>(path: string, body?: unknown) => request<T>('DELETE', path, body),
  url: (path: string) => `${base()}${path}`,
}

/** Unwraps `{ data }` responses. */
export async function getData<T = any>(path: string): Promise<T> {
  return (await api.get<{ data: T }>(path)).data
}
