'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Fix Leaflet default marker icons
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl:
    'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl:
    'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

const FIELD_TYPE_COLORS: Record<string, string> = {
  grazing: '#22c55e',
  silage: '#f59e0b',
  housing: '#3b82f6',
  hay: '#9ca3af',
}

function getFieldColor(fieldType: string | null, color: string | null): string {
  if (color) return color
  if (fieldType && FIELD_TYPE_COLORS[fieldType]) return FIELD_TYPE_COLORS[fieldType]
  return '#6b7280'
}

/**
 * Calculate the area of a polygon defined by lat/lng coordinates using the
 * Shoelace formula on a local flat projection. Accurate for farm-scale areas.
 * Returns area in acres.
 */
function calculatePolygonAreaAcres(points: L.LatLng[]): number {
  if (points.length < 3) return 0

  // Use the centroid as the projection origin
  const avgLat = points.reduce((s, p) => s + p.lat, 0) / points.length
  const latRad = (avgLat * Math.PI) / 180

  // Meters per degree at this latitude
  const metersPerDegLat = 111320
  const metersPerDegLng = 111320 * Math.cos(latRad)

  // Project to local meters and apply Shoelace formula
  const projected = points.map((p) => ({
    x: (p.lng - points[0].lng) * metersPerDegLng,
    y: (p.lat - points[0].lat) * metersPerDegLat,
  }))

  let area = 0
  for (let i = 0; i < projected.length; i++) {
    const j = (i + 1) % projected.length
    area += projected[i].x * projected[j].y
    area -= projected[j].x * projected[i].y
  }
  area = Math.abs(area) / 2

  // Convert square meters to acres (1 acre = 4046.8564224 m²)
  return area / 4046.8564224
}

interface FarmMapProps {
  fields: Array<{
    id: number
    name: string
    fieldType: string | null
    polygon: string | null
    centerLat: number | null
    centerLng: number | null
    color: string | null
    currentCattle: any[]
    cattleCount: number
    acreage: number | null
  }>
  selectedFieldId: number | null
  onFieldClick: (id: number) => void
  onPolygonDrawn: (geojson: string, center: { lat: number; lng: number }, acreage: number) => void
  drawMode: boolean
}

export default function FarmMap({
  fields,
  selectedFieldId,
  onFieldClick,
  onPolygonDrawn,
  drawMode,
}: FarmMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layersRef = useRef<L.LayerGroup | null>(null)
  const drawLayerRef = useRef<L.LayerGroup | null>(null)
  const [drawPoints, setDrawPoints] = useState<L.LatLng[]>([])
  const drawPointsRef = useRef<L.LatLng[]>([])

  // Keep ref in sync with state
  useEffect(() => {
    drawPointsRef.current = drawPoints
  }, [drawPoints])

  // Initialize map once
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return

    const map = L.map(mapContainerRef.current, {
      center: [56.0, -3.5],
      zoom: 13,
      zoomControl: true,
    })

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map)

    layersRef.current = L.layerGroup().addTo(map)
    drawLayerRef.current = L.layerGroup().addTo(map)
    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  // Render field polygons
  useEffect(() => {
    const layers = layersRef.current
    if (!layers) return
    layers.clearLayers()

    fields.forEach((field) => {
      if (!field.polygon) return

      try {
        const geojson = JSON.parse(field.polygon)
        const color = getFieldColor(field.fieldType, field.color)
        const isSelected = field.id === selectedFieldId

        const layer = L.geoJSON(geojson, {
          style: {
            color: color,
            weight: isSelected ? 4 : 2,
            opacity: isSelected ? 1 : 0.8,
            fillColor: color,
            fillOpacity: isSelected ? 0.35 : 0.2,
          },
        })

        const acreageText = field.acreage ? `<br/>${field.acreage.toFixed(2)} acres` : ''
        layer.bindTooltip(
          `<strong>${field.name}</strong><br/>${field.fieldType || 'Unknown type'}${acreageText}<br/>${field.cattleCount} cattle`,
          { sticky: true }
        )

        layer.on('click', () => {
          onFieldClick(field.id)
        })

        layer.addTo(layers)
      } catch {
        // Skip fields with invalid polygon JSON
      }
    })

    // Fit bounds if there are fields with polygons
    const fieldsWithPolygons = fields.filter((f) => f.polygon)
    if (fieldsWithPolygons.length > 0 && mapRef.current) {
      try {
        const allCoords: L.LatLng[] = []
        fieldsWithPolygons.forEach((f) => {
          const geojson = JSON.parse(f.polygon!)
          L.geoJSON(geojson).eachLayer((layer) => {
            if ((layer as any).getLatLngs) {
              const extractLatLngs = (latlngs: any): void => {
                if (Array.isArray(latlngs)) {
                  latlngs.forEach((ll) => {
                    if (ll instanceof L.LatLng) {
                      allCoords.push(ll)
                    } else if (Array.isArray(ll)) {
                      extractLatLngs(ll)
                    }
                  })
                }
              }
              extractLatLngs((layer as any).getLatLngs())
            }
          })
        })
        if (allCoords.length > 0) {
          const bounds = L.latLngBounds(allCoords)
          mapRef.current.fitBounds(bounds, { padding: [50, 50] })
        }
      } catch {
        // Ignore bounds errors
      }
    }
  }, [fields, selectedFieldId, onFieldClick])

  // Handle draw mode
  useEffect(() => {
    const map = mapRef.current
    const drawLayer = drawLayerRef.current
    if (!map || !drawLayer) return

    if (!drawMode) {
      drawLayer.clearLayers()
      setDrawPoints([])
      map.getContainer().style.cursor = ''
      return
    }

    map.getContainer().style.cursor = 'crosshair'

    const onClick = (e: L.LeafletMouseEvent) => {
      const point = e.latlng
      const newPoints = [...drawPointsRef.current, point]
      setDrawPoints(newPoints)

      // Add marker at click point
      L.circleMarker(point, {
        radius: 6,
        color: '#ef4444',
        fillColor: '#ef4444',
        fillOpacity: 1,
      }).addTo(drawLayer)

      // Redraw lines
      drawLayer.eachLayer((layer) => {
        if (layer instanceof L.Polyline && !(layer instanceof L.CircleMarker)) {
          drawLayer.removeLayer(layer)
        }
      })

      if (newPoints.length >= 2) {
        L.polyline(newPoints, {
          color: '#ef4444',
          weight: 2,
          dashArray: '6, 6',
        }).addTo(drawLayer)
      }
    }

    const onDblClick = (e: L.LeafletMouseEvent) => {
      // Prevent default zoom on double-click
      const domEvent = e.originalEvent
      if (domEvent) {
        domEvent.preventDefault()
        domEvent.stopPropagation()
      }
      finishDrawing()
    }

    map.on('click', onClick)
    map.on('dblclick', onDblClick)

    return () => {
      map.off('click', onClick)
      map.off('dblclick', onDblClick)
      map.getContainer().style.cursor = ''
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawMode])

  const finishDrawing = useCallback(() => {
    const points = drawPointsRef.current
    if (points.length < 3) return

    // Build GeoJSON polygon
    const coordinates = points.map((p) => [p.lng, p.lat])
    // Close the ring
    coordinates.push([points[0].lng, points[0].lat])

    const geojson = {
      type: 'Feature' as const,
      properties: {},
      geometry: {
        type: 'Polygon' as const,
        coordinates: [coordinates],
      },
    }

    // Calculate center
    const latSum = points.reduce((s, p) => s + p.lat, 0)
    const lngSum = points.reduce((s, p) => s + p.lng, 0)
    const center = {
      lat: latSum / points.length,
      lng: lngSum / points.length,
    }

    // Calculate area from polygon
    const acreage = calculatePolygonAreaAcres(points)

    onPolygonDrawn(JSON.stringify(geojson), center, acreage)

    // Clear draw layer
    if (drawLayerRef.current) {
      drawLayerRef.current.clearLayers()
    }
    setDrawPoints([])
  }, [onPolygonDrawn])

  // Listen for Enter key to finish drawing
  useEffect(() => {
    if (!drawMode) return

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        finishDrawing()
      } else if (e.key === 'Escape') {
        if (drawLayerRef.current) {
          drawLayerRef.current.clearLayers()
        }
        setDrawPoints([])
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [drawMode, finishDrawing])

  return (
    <div className="relative w-full h-full">
      <div ref={mapContainerRef} className="w-full h-full" />

      {/* Draw mode overlay */}
      {drawMode && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] bg-white rounded-lg shadow-lg border border-gray-200 px-4 py-2 flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <span className="text-sm font-medium text-gray-700">
            Drawing mode: Click to add points
            {drawPoints.length > 0 && ` (${drawPoints.length} points)`}
          </span>
          {drawPoints.length >= 3 && (
            <button
              onClick={finishDrawing}
              className="ml-2 px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-md transition-colors"
            >
              Finish
            </button>
          )}
          {drawPoints.length > 0 && (
            <button
              onClick={() => {
                if (drawLayerRef.current) {
                  drawLayerRef.current.clearLayers()
                }
                setDrawPoints([])
              }}
              className="px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-md transition-colors"
            >
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  )
}
