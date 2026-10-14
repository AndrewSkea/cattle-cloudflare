'use client'

import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Loader2, LocateFixed } from 'lucide-react'
import { baseLayers, DEFAULT_CENTER, DEFAULT_ZOOM, geoJSONToLatLngs } from './leaflet-base'

export interface MapPoint { key: string | number; lat: number; lng: number; color: string; text: string; title?: string }

interface Props {
  polygon: string | null
  center: { latitude: number | null; longitude: number | null }
  points: MapPoint[]
  /** Tap the map (or use GPS) to add a point */
  onAdd?: (lat: number, lng: number) => void
  onMove?: (key: string | number, lat: number, lng: number) => void
  height?: number
}

const icon = (p: MapPoint) => L.divIcon({
  className: '',
  html: `<div style="min-width:30px;height:24px;padding:0 6px;border-radius:9999px;background:${p.color};border:2px solid white;box-shadow:0 1px 6px rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;font:600 11px/1 system-ui,sans-serif;color:#111;white-space:nowrap">${p.text.replace(/[<>&]/g, '')}</div>`,
  iconSize: [34, 24], iconAnchor: [17, 12],
})

/** A field on satellite imagery with readings as coloured, labelled pins. */
export default function FieldPointsMap({ polygon, center, points, onAdd, onMove, height = 300 }: Props) {
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const layer = useRef(L.layerGroup())
  const cbs = useRef({ onAdd, onMove })
  cbs.current = { onAdd, onMove }
  const [locating, setLocating] = useState(false)
  const [gpsError, setGpsError] = useState<string | null>(null)

  useEffect(() => {
    if (!el.current || map.current) return
    const layers = baseLayers()
    const m = L.map(el.current, { zoomControl: true, doubleClickZoom: !onAdd })
    layers.Satellite.addTo(m)
    const ll = geoJSONToLatLngs(polygon)
    if (ll) {
      const poly = L.polygon(ll, { color: '#facc15', weight: 2.5, fillOpacity: 0.08, interactive: false }).addTo(m)
      m.fitBounds(poly.getBounds(), { padding: [16, 16], maxZoom: 18 })
    } else if (center.latitude != null && center.longitude != null) m.setView([center.latitude, center.longitude], 16)
    else m.setView(DEFAULT_CENTER, DEFAULT_ZOOM)
    layer.current.addTo(m)
    m.on('click', (e: L.LeafletMouseEvent) => cbs.current.onAdd?.(e.latlng.lat, e.latlng.lng))
    map.current = m
    return () => { m.stop(); m.remove(); map.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    layer.current.clearLayers()
    for (const p of points) {
      const mk = L.marker([p.lat, p.lng], { icon: icon(p), draggable: !!onMove, title: p.title })
      if (onMove) mk.on('dragend', () => { const q = mk.getLatLng(); cbs.current.onMove?.(p.key, q.lat, q.lng) })
      mk.addTo(layer.current)
    }
  }, [points, onMove])

  const gps = () => {
    if (!navigator.geolocation) { setGpsError('This device has no GPS'); return }
    setLocating(true); setGpsError(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false)
        const { latitude, longitude } = pos.coords
        map.current?.panTo([latitude, longitude])
        cbs.current.onAdd?.(latitude, longitude)
      },
      (e) => { setLocating(false); setGpsError(e.code === 1 ? 'Location permission was refused' : 'Couldn’t get your location') },
      { enableHighAccuracy: true, timeout: 15000 },
    )
  }

  return (
    <div className="relative">
      <div ref={el} style={{ height }} className="z-0 overflow-hidden rounded-xl ring-1 ring-stone-200" />
      {onAdd && (
        <div className="pointer-events-none absolute inset-x-2 bottom-2 z-[500] flex items-end justify-between gap-2">
          <span className="rounded-md bg-black/60 px-2 py-1 text-[11px] text-white">Tap the map to add a reading there</span>
          <button type="button" onClick={gps} className="pointer-events-auto inline-flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 text-xs font-medium text-stone-800 shadow ring-1 ring-black/10">
            {locating ? <Loader2 className="size-3.5 animate-spin" /> : <LocateFixed className="size-3.5" />}Where I am
          </button>
        </div>
      )}
      {gpsError && <p className="mt-1 text-xs text-clay-600">{gpsError}</p>}
    </div>
  )
}
