import L from 'leaflet'

// Leaflet finishes a zoom animation on a 250 ms timer; if the map was removed meanwhile (navigating away, closing a
// sheet) it throws "_leaflet_pos of undefined". Skip the finish when the map is gone.
const proto = L.Map.prototype as any
if (!proto.__safeZoomEnd) {
  const end = proto._onZoomTransitionEnd
  proto._onZoomTransitionEnd = function (this: any, ...args: unknown[]) { if (this._mapPane) return end.apply(this, args) }
  proto.__safeZoomEnd = true
}

export const DEFAULT_CENTER: [number, number] = [54.5, -3.2] // UK
export const DEFAULT_ZOOM = 6

export function baseLayers() {
  const satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 20, maxNativeZoom: 19,
    attribution: 'Imagery © Esri, Maxar, Earthstar Geographics',
  })
  const labels = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 20, maxNativeZoom: 19, pane: 'overlayPane',
  })
  const streets = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 20, maxNativeZoom: 19,
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  })
  const hybrid = L.layerGroup([satellite, labels])
  return { Satellite: hybrid, Map: streets } as Record<string, L.Layer>
}

/** Geodesic polygon area in hectares (spherical excess; accurate for field-scale shapes). */
export function areaHa(latlngs: L.LatLng[]): number {
  const R = 6378137
  const rad = Math.PI / 180
  let area = 0
  const n = latlngs.length
  if (n < 3) return 0
  for (let i = 0; i < n; i++) {
    const p1 = latlngs[i]
    const p2 = latlngs[(i + 1) % n]
    area += (p2.lng - p1.lng) * rad * (2 + Math.sin(p1.lat * rad) + Math.sin(p2.lat * rad))
  }
  return Math.abs((area * R * R) / 2) / 10_000
}

export function polygonToGeoJSON(layer: L.Polygon): { geojson: string; areaHa: number } {
  const ring = (layer.getLatLngs()[0] as L.LatLng[])
  const coords = ring.map((p) => [Number(p.lng.toFixed(7)), Number(p.lat.toFixed(7))])
  coords.push(coords[0])
  return { geojson: JSON.stringify({ type: 'Polygon', coordinates: [coords] }), areaHa: Math.round(areaHa(ring) * 100) / 100 }
}

export function geoJSONToLatLngs(geojson: string | null): L.LatLngExpression[] | null {
  if (!geojson) return null
  try {
    const g = JSON.parse(geojson)
    if (g.type !== 'Polygon') return null
    return (g.coordinates[0] as [number, number][]).slice(0, -1).map(([lng, lat]) => [lat, lng] as [number, number])
  } catch {
    return null
  }
}

export async function geocode(q: string): Promise<{ label: string; lat: number; lng: number }[]> {
  const res = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&q=${encodeURIComponent(q)}`, {
    headers: { 'Accept-Language': 'en-GB' },
  })
  if (!res.ok) return []
  const rows = await res.json() as { display_name: string; lat: string; lon: string }[]
  return rows.map((r) => ({ label: r.display_name, lat: Number(r.lat), lng: Number(r.lon) }))
}
