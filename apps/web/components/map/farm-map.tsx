'use client'

import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import '@geoman-io/leaflet-geoman-free'
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css'
import { Check, X } from 'lucide-react'
import type { Parcel, Structure } from '@/lib/types'
import { landUse, structureKind } from '@/lib/constants'
import { fmtArea } from '@/lib/format'
import { baseLayers, DEFAULT_CENTER, DEFAULT_ZOOM, geoJSONToLatLngs, polygonToGeoJSON } from './leaflet-base'

export type MapMode =
  | { kind: 'view' }
  | { kind: 'draw-parcel' }
  | { kind: 'edit-parcel'; id: number }
  | { kind: 'place-structure'; id?: number }
  | { kind: 'draw-boundary' }

export type Selection = { type: 'parcel' | 'structure'; id: number } | null

interface Props {
  center: { latitude: number | null; longitude: number | null; zoom: number | null }
  boundary?: string | null
  parcels: Parcel[]
  structures: Structure[]
  areaUnit?: 'ha' | 'ac'
  selected?: Selection
  mode: MapMode
  height?: number | string
  onSelect?: (s: Selection) => void
  onDrawn?: (geojson: string, areaHa: number) => void
  onEdited?: (id: number, geojson: string, areaHa: number) => void
  onPlaced?: (lat: number, lng: number, id?: number) => void
  onCancel?: () => void
}

export default function FarmMap(props: Props) {
  const { center, boundary, parcels, structures, areaUnit = 'ha', selected, mode, height = 560 } = props
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const parcelLayer = useRef<L.FeatureGroup>(L.featureGroup())
  const structureLayer = useRef<L.FeatureGroup>(L.featureGroup())
  const boundaryLayer = useRef<L.FeatureGroup>(L.featureGroup())
  const polygons = useRef(new Map<number, L.Polygon>())
  const fitted = useRef(false)
  const cbs = useRef(props)
  cbs.current = props

  // Init
  useEffect(() => {
    if (!el.current || map.current) return
    const layers = baseLayers()
    const m = L.map(el.current, { zoomControl: true })
    m.setView(center.latitude != null && center.longitude != null ? [center.latitude, center.longitude] : DEFAULT_CENTER, center.zoom ?? (center.latitude != null ? 15 : DEFAULT_ZOOM))
    layers.Satellite.addTo(m)
    L.control.layers(layers, undefined, { position: 'topright' }).addTo(m)
    L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(m)
    boundaryLayer.current.addTo(m)
    parcelLayer.current.addTo(m)
    structureLayer.current.addTo(m)
    m.pm.setGlobalOptions({ allowSelfIntersection: false, snappable: true, snapDistance: 15, templineStyle: { color: '#facc15' }, hintlineStyle: { color: '#facc15', dashArray: '5,5' }, pathOptions: { color: '#facc15', weight: 3 } } as any)
    m.on('pm:create', (e: any) => {
      const layer = e.layer as L.Polygon
      const { geojson, areaHa } = polygonToGeoJSON(layer)
      m.removeLayer(layer)
      cbs.current.onDrawn?.(geojson, areaHa)
    })
    map.current = m
    return () => { m.remove(); map.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Farm boundary
  useEffect(() => {
    boundaryLayer.current.clearLayers()
    const ll = geoJSONToLatLngs(boundary ?? null)
    if (ll) L.polygon(ll, { color: '#fde68a', weight: 2.5, dashArray: '8 6', fill: false, interactive: false }).addTo(boundaryLayer.current)
  }, [boundary])

  // Parcels
  useEffect(() => {
    const g = parcelLayer.current
    g.clearLayers()
    polygons.current.clear()
    for (const p of parcels) {
      const ll = geoJSONToLatLngs(p.polygon)
      if (!ll) continue
      const color = p.color || landUse(p.landUse).color
      const isSel = selected?.type === 'parcel' && selected.id === p.id
      const poly = L.polygon(ll, { color: isSel ? '#fde047' : color, weight: isSel ? 4 : 2.5, fillColor: color, fillOpacity: isSel ? 0.45 : 0.3 })
      poly.bindTooltip(`${p.name}${p.animalCount ? ` · ${p.animalCount}` : ''}`, { permanent: true, direction: 'center', className: 'field-label' })
      const popup = `<div style="min-width:160px"><div style="font-weight:600">${escapeHtml(p.name)}</div><div style="color:#78716c;font-size:12px;margin-top:2px">${landUse(p.landUse).label} · ${fmtArea(p.areaHa, areaUnit)}</div>${p.animalCount ? `<div style="margin-top:6px;font-size:12px">${p.animalCount} animals grazing</div>` : ''}</div>`
      poly.on('click', (e: L.LeafletMouseEvent) => {
        const m = cbs.current.mode
        if (m.kind === 'place-structure') {
          L.DomEvent.stopPropagation(e)
          cbs.current.onPlaced?.(e.latlng.lat, e.latlng.lng, m.id)
        } else if (m.kind === 'view') {
          L.popup().setLatLng(e.latlng).setContent(popup).openOn(map.current!)
          cbs.current.onSelect?.({ type: 'parcel', id: p.id })
        }
      })
      poly.addTo(g)
      polygons.current.set(p.id, poly)
    }
    if (!fitted.current && map.current) {
      const all = L.featureGroup([...g.getLayers(), ...boundaryLayer.current.getLayers()])
      if (all.getLayers().length) { map.current.fitBounds(all.getBounds(), { padding: [30, 30], maxZoom: 17 }); fitted.current = true }
    }
  }, [parcels, selected, areaUnit])

  // Structures
  useEffect(() => {
    const g = structureLayer.current
    g.clearLayers()
    for (const s of structures) {
      if (s.latitude == null || s.longitude == null) continue
      const isSel = selected?.type === 'structure' && selected.id === s.id
      const icon = L.divIcon({
        className: '',
        html: `<div class="structure-pin" style="${isSel ? 'border-color:#facc15;transform:scale(1.15)' : ''}">${structureKind(s.kind).emoji}</div>`,
        iconSize: [32, 32], iconAnchor: [16, 16],
      })
      const m = L.marker([s.latitude, s.longitude], { icon, title: s.name })
      m.bindTooltip(s.name, { direction: 'top', offset: [0, -14] })
      m.on('click', () => cbs.current.onSelect?.({ type: 'structure', id: s.id }))
      m.addTo(g)
    }
  }, [structures, selected])

  // Fly to selection
  useEffect(() => {
    const m = map.current
    if (!m || !selected) return
    if (selected.type === 'parcel') {
      const poly = polygons.current.get(selected.id)
      if (poly) m.flyToBounds(poly.getBounds(), { padding: [60, 60], maxZoom: 17, duration: 0.6 })
    } else {
      const s = structures.find((x) => x.id === selected.id)
      if (s?.latitude != null && s.longitude != null) m.flyTo([s.latitude, s.longitude], Math.max(m.getZoom(), 17), { duration: 0.6 })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.type, selected?.id])

  // Modes
  useEffect(() => {
    const m = map.current
    if (!m) return
    const container = m.getContainer()
    m.pm.disableDraw()
    polygons.current.forEach((p) => p.pm.disable())
    container.style.cursor = ''
    let clickHandler: ((e: L.LeafletMouseEvent) => void) | null = null

    if (mode.kind === 'draw-parcel' || mode.kind === 'draw-boundary') {
      m.pm.enableDraw('Polygon', { finishOn: null, continueDrawing: false } as any)
    } else if (mode.kind === 'edit-parcel') {
      polygons.current.get(mode.id)?.pm.enable({ allowSelfIntersection: false })
    } else if (mode.kind === 'place-structure') {
      container.style.cursor = 'crosshair'
      clickHandler = (e) => cbs.current.onPlaced?.(e.latlng.lat, e.latlng.lng, mode.id)
      m.on('click', clickHandler)
    }
    return () => {
      if (clickHandler) m.off('click', clickHandler)
      container.style.cursor = ''
    }
  }, [mode])

  const saveEdit = () => {
    if (mode.kind !== 'edit-parcel') return
    const poly = polygons.current.get(mode.id)
    if (!poly) return
    const { geojson, areaHa } = polygonToGeoJSON(poly)
    poly.pm.disable()
    props.onEdited?.(mode.id, geojson, areaHa)
  }

  const hint = mode.kind === 'draw-parcel' || mode.kind === 'draw-boundary'
    ? 'Click to add corners. Click the first point to finish.'
    : mode.kind === 'edit-parcel' ? 'Drag the corners to reshape. Click a midpoint to add a corner.'
      : mode.kind === 'place-structure' ? 'Click the map where the building is.' : null

  return (
    <div className="relative">
      <div ref={el} style={{ height }} className="overflow-hidden rounded-2xl ring-1 ring-stone-900/10" />
      {hint && (
        <div className="absolute left-1/2 top-3 z-[1000] flex -translate-x-1/2 items-center gap-2 rounded-full bg-stone-900/90 py-1.5 pl-4 pr-1.5 text-sm text-white shadow-pop backdrop-blur">
          <span>{hint}</span>
          {mode.kind === 'edit-parcel' && (
            <button onClick={saveEdit} className="flex items-center gap-1 rounded-full bg-wheat-400 px-3 py-1 text-xs font-semibold text-brand-950 hover:bg-wheat-300"><Check className="size-3.5" />Save shape</button>
          )}
          <button onClick={() => props.onCancel?.()} className="flex items-center gap-1 rounded-full bg-white/15 px-3 py-1 text-xs font-medium hover:bg-white/25"><X className="size-3.5" />Cancel</button>
        </div>
      )}
    </div>
  )
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}
