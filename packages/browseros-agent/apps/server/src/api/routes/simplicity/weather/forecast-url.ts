/**
 * Open-Meteo's current-weather URL. Its default wind unit is km/h, but the
 * metric card labels the value "m/s", so the metric request must ask for
 * m/s (Astro 0.2.4 QA, F-030).
 */
export function forecastURL(
  lat: number,
  lng: number,
  measureUnit: 'Imperial' | 'Metric',
): string {
  const url = new URL('https://api.open-meteo.com/v1/forecast')
  url.searchParams.set('latitude', String(lat))
  url.searchParams.set('longitude', String(lng))
  url.searchParams.set(
    'current',
    'weather_code,temperature_2m,is_day,relative_humidity_2m,wind_speed_10m',
  )
  url.searchParams.set('timezone', 'auto')
  if (measureUnit === 'Metric') {
    url.searchParams.set('wind_speed_unit', 'ms')
  } else {
    url.searchParams.set('temperature_unit', 'fahrenheit')
    url.searchParams.set('wind_speed_unit', 'mph')
  }
  return url.toString()
}
