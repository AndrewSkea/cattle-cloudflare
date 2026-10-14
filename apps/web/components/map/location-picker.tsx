'use client'

import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Loader2, LocateFixed, Search } from 'lucide-react'
import { baseLayers, DEFAULT_CENTER, DEFAULT_ZOOM, geocode } from './leaflet-base'

const pin = L.divIcon({
  className: '',
  html: '<div style="width:22px;height:22px;border-radius:9999px;background:#275040;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,.45)"></div>',
  iconSize: [22, 22], iconAnchor: [11, 11],
})

export interface LatLngZoom { latitude: number; longitude: number; zoom: number }

/** Click / drag to place the farm, or search an address or postcode. */
export default function LocationPicker({ value, onChange, height = 320 }: { value: LatLngZoom | null; onChange: (v: LatLngZoom) => void; height?: number }) {
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const marker = useRef<L.Marker | null>(null)
  const cb = useRef(onChange)
  cb.current = onChange
  const [q, setQ] = useState('')
  const [results, setResults] = useState<{ label: string; lat: number; lng: number }[]>([])
  const [searching, setSearching] = useState(false)

  const place = (lat: number, lng: number, zoom?: number) => {
    const m = map.current!
    if (zoom) m.setView([lat, lng], zoom)
    if (!marker.current) {
      marker.current = L.marker([lat, lng], { icon: pin, draggable: true }).addTo(m)
      marker.current.on('dragend', () => {
        const p = marker.current!.getLatLng()
        cb.current({ latitude: p.lat, longitude: p.lng, zoom: m.getZoom() })
      })
    } else marker.current.setLatLng([lat, lng])
    cb.current({ latitude: lat, longitude: lng, zoom: zoom ?? m.getZoom() })
  }

  useEffect(() => {
    if (!el.current || map.current) return
    const layers = baseLayers()
    const m = L.map(el.current, { zoomControl: true, attributionControl: true })
      .setView(value ? [value.latitude, value.longitude] : DEFAULT_CENTER, value?.zoom ?? DEFAULT_ZOOM)
    layers.Satellite.addTo(m)
    L.control.layers(layers, undefined, { position: 'topright' }).addTo(m)
    map.current = m
    if (value) {
      marker.current = L.marker([value.latitude, value.longitude], { icon: pin, draggable: true }).addTo(m)
      marker.current.on('dragend', () => {
        const p = marker.current!.getLatLng()
        cb.current({ latitude: p.lat, longitude: p.lng, zoom: m.getZoom() })
      })
    }
    m.on('click', (e: L.LeafletMouseEvent) => place(e.latlng.lat, e.latlng.lng))
    m.on('zoomend', () => {
      if (marker.current) {
        const p = marker.current.getLatLng()
        cb.current({ latitude: p.lat, longitude: p.lng, zoom: m.getZoom() })
      }
    })
    return () => { m.stop(); m.remove(); map.current = null; marker.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const search = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!q.trim()) return
    setSearching(true)
    try { setResults(await geocode(q)) } finally { setSearching(false) }
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-stone-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') search(e) }}
              placeholder="Search address, village or postcode"
              className="h-9 w-full rounded-lg border-0 bg-white pl-9 pr-3 text-sm shadow-sm ring-1 ring-inset ring-stone-200 focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <button type="button" onClick={() => search()} className="h-9 rounded-lg bg-white px-3 text-sm font-medium text-stone-700 shadow-sm ring-1 ring-inset ring-stone-200 hover:bg-stone-50">
            {searching ? <Loader2 className="size-4 animate-spin" /> : 'Search'}
          </button>
          <button type="button" title="Use my location" onClick={() => navigator.geolocation?.getCurrentPosition((p) => place(p.coords.latitude, p.coords.longitude, 16))}
            className="grid size-9 place-items-center rounded-lg bg-white text-stone-600 shadow-sm ring-1 ring-inset ring-stone-200 hover:bg-stone-50">
            <LocateFixed className="size-4" />
          </button>
        </div>
        {results.length > 0 && (
          <ul className="absolute z-[1000] mt-1 w-full overflow-hidden rounded-xl bg-white p-1 shadow-pop ring-1 ring-stone-900/10">
            {results.map((r) => (
              <li key={`${r.lat},${r.lng}`}>
                <button type="button" onClick={() => { place(r.lat, r.lng, 16); setResults([]); setQ(r.label.split(',').slice(0, 2).join(',')) }}
                  className="w-full truncate rounded-lg px-3 py-2 text-left text-sm text-stone-700 hover:bg-stone-100">{r.label}</button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div ref={el} style={{ height }} className="overflow-hidden rounded-xl ring-1 ring-stone-200" />
      <p className="text-xs text-stone-500">Click the map or drag the pin to your farmyard.</p>
    </div>
  )
}
