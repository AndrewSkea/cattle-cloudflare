'use client'

import { useQuery } from '@tanstack/react-query'
import { Droplets, Wind } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { Card } from './ui/display'

const CODES: Record<number, [string, string]> = {
  0: ['☀️', 'Clear'], 1: ['🌤️', 'Mostly clear'], 2: ['⛅', 'Partly cloudy'], 3: ['☁️', 'Overcast'],
  45: ['🌫️', 'Fog'], 48: ['🌫️', 'Freezing fog'], 51: ['🌦️', 'Light drizzle'], 53: ['🌦️', 'Drizzle'], 55: ['🌧️', 'Heavy drizzle'],
  56: ['🌧️', 'Freezing drizzle'], 57: ['🌧️', 'Freezing drizzle'], 61: ['🌦️', 'Light rain'], 63: ['🌧️', 'Rain'], 65: ['🌧️', 'Heavy rain'],
  66: ['🌧️', 'Freezing rain'], 67: ['🌧️', 'Freezing rain'], 71: ['🌨️', 'Light snow'], 73: ['🌨️', 'Snow'], 75: ['❄️', 'Heavy snow'],
  77: ['🌨️', 'Snow grains'], 80: ['🌦️', 'Showers'], 81: ['🌧️', 'Showers'], 82: ['⛈️', 'Heavy showers'], 85: ['🌨️', 'Snow showers'],
  86: ['🌨️', 'Snow showers'], 95: ['⛈️', 'Thunderstorm'], 96: ['⛈️', 'Thunderstorm'], 99: ['⛈️', 'Thunderstorm'],
}
const code = (c: number) => CODES[c] || ['🌡️', '—']

interface Forecast {
  current: { temperature_2m: number; weather_code: number; wind_speed_10m: number; precipitation: number }
  daily: { time: string[]; weather_code: number[]; temperature_2m_max: number[]; temperature_2m_min: number[]; precipitation_sum: number[] }
}

export function WeatherCard({ lat, lng }: { lat: number; lng: number }) {
  const { data, isError } = useQuery<Forecast>({
    queryKey: ['weather', lat.toFixed(2), lng.toFixed(2)],
    queryFn: async () => {
      const u = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,weather_code,wind_speed_10m,precipitation&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=auto&forecast_days=6&wind_speed_unit=mph`
      const r = await fetch(u)
      if (!r.ok) throw new Error('weather')
      return r.json()
    },
    staleTime: 30 * 60_000,
    retry: 1,
  })
  if (isError) return null
  return (
    <Card className="overflow-hidden">
      <div className="bg-gradient-to-br from-sky-600 to-brand-800 p-5 text-white">
        {!data ? <div className="h-[92px] animate-pulse rounded-lg bg-white/10" /> : (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-sky-100/90">On the farm now</p>
              <p className="mt-1 font-display text-4xl font-semibold">{Math.round(data.current.temperature_2m)}°</p>
              <p className="text-sm text-sky-50">{code(data.current.weather_code)[1]}</p>
            </div>
            <div className="text-right">
              <span className="text-5xl leading-none">{code(data.current.weather_code)[0]}</span>
              <div className="mt-2 flex items-center justify-end gap-3 text-xs text-sky-100">
                <span className="flex items-center gap-1"><Wind className="size-3.5" />{Math.round(data.current.wind_speed_10m)} mph</span>
                <span className="flex items-center gap-1"><Droplets className="size-3.5" />{data.current.precipitation} mm</span>
              </div>
            </div>
          </div>
        )}
      </div>
      {data && (
        <div className="grid grid-cols-5 divide-x divide-stone-100">
          {data.daily.time.slice(1, 6).map((d, i) => (
            <div key={d} className="px-1 py-3 text-center">
              <p className="text-[11px] font-medium text-stone-500">{format(parseISO(d), 'EEE')}</p>
              <p className="my-1 text-xl">{code(data.daily.weather_code[i + 1])[0]}</p>
              <p className="text-xs font-semibold text-stone-800 tabular">{Math.round(data.daily.temperature_2m_max[i + 1])}°<span className="font-normal text-stone-400"> {Math.round(data.daily.temperature_2m_min[i + 1])}°</span></p>
              {data.daily.precipitation_sum[i + 1] >= 1 && <p className="mt-0.5 text-[10px] text-sky-600 tabular">{Math.round(data.daily.precipitation_sum[i + 1])} mm</p>}
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}
