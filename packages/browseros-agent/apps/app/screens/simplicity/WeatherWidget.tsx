'use client'

import { Wind } from 'lucide-react'
import { useEffect, useState } from 'react'
import { getApproxLocation } from '@/lib/simplicity/actions'
import { apiFetch } from '@/lib/simplicity/api-fetch'

const WeatherWidget = () => {
  const [data, setData] = useState({
    temperature: 0,
    condition: '',
    location: '',
    humidity: 0,
    windSpeed: 0,
    icon: '',
    temperatureUnit: 'C',
    windSpeedUnit: 'm/s',
  })

  const [loading, setLoading] = useState(true)

  const getLocation = async (
    callback: (location: {
      latitude: number
      longitude: number
      city: string
    }) => void,
  ) => {
    if (navigator.geolocation) {
      const result = await navigator.permissions.query({
        name: 'geolocation',
      })

      if (result.state === 'granted') {
        navigator.geolocation.getCurrentPosition(async (position) => {
          const res = await fetch(
            `https://api-bdc.io/data/reverse-geocode-client?latitude=${position.coords.latitude}&longitude=${position.coords.longitude}&localityLanguage=en`,
            {
              method: 'GET',
              headers: {
                'Content-Type': 'application/json',
              },
            },
          )

          const data = await res.json()

          callback({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            city: data.locality,
          })
        })
      } else if (result.state === 'prompt') {
        callback(await getApproxLocation())
        navigator.geolocation.getCurrentPosition((_position) => {})
      } else if (result.state === 'denied') {
        callback(await getApproxLocation())
      }
    } else {
      callback(await getApproxLocation())
    }
  }

  const updateWeather = async () => {
    getLocation(async (location) => {
      const res = await apiFetch(`/api/weather`, {
        method: 'POST',
        body: JSON.stringify({
          lat: location.latitude,
          lng: location.longitude,
          measureUnit: localStorage.getItem('measureUnit') ?? 'Metric',
        }),
      })

      const data = await res.json()

      if (res.status !== 200) {
        setLoading(false)
        return
      }

      setData({
        temperature: data.temperature,
        condition: data.condition,
        location: location.city,
        humidity: data.humidity,
        windSpeed: data.windSpeed,
        icon: data.icon,
        temperatureUnit: data.temperatureUnit,
        windSpeedUnit: data.windSpeedUnit,
      })
      setLoading(false)
    })
  }

  useEffect(() => {
    updateWeather()
    const intervalId = setInterval(updateWeather, 30 * 1000)
    return () => clearInterval(intervalId)
  }, [updateWeather])

  return (
    <div className="flex h-24 max-h-[96px] min-h-[96px] w-full flex-row items-center gap-3 rounded-2xl border border-light-200 bg-light-secondary px-3 py-2 shadow-light-200/10 shadow-sm dark:border-dark-200 dark:bg-dark-secondary dark:shadow-black/25">
      {loading ? (
        <>
          <div className="flex h-full w-16 min-w-16 max-w-16 animate-pulse flex-col items-center justify-center">
            <div className="mb-2 h-10 w-10 rounded-full bg-light-200 dark:bg-dark-200" />
            <div className="h-4 w-10 rounded bg-light-200 dark:bg-dark-200" />
          </div>
          <div className="flex h-full flex-1 animate-pulse flex-col justify-between py-1">
            <div className="flex flex-row items-center justify-between">
              <div className="h-3 w-20 rounded bg-light-200 dark:bg-dark-200" />
              <div className="h-3 w-12 rounded bg-light-200 dark:bg-dark-200" />
            </div>
            <div className="mt-1 h-3 w-16 rounded bg-light-200 dark:bg-dark-200" />
            <div className="mt-auto flex w-full flex-row justify-between border-light-200 border-t pt-1 dark:border-dark-200">
              <div className="h-3 w-16 rounded bg-light-200 dark:bg-dark-200" />
              <div className="h-3 w-8 rounded bg-light-200 dark:bg-dark-200" />
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="flex h-full w-16 min-w-16 max-w-16 flex-col items-center justify-center">
            <img
              src={`/weather-ico/${data.icon}.svg`}
              alt={data.condition}
              className="h-10 w-auto"
            />
            <span className="font-semibold text-base text-black dark:text-white">
              {data.temperature}°{data.temperatureUnit}
            </span>
          </div>
          <div className="flex h-full flex-1 flex-col justify-between py-2">
            <div className="flex flex-row items-center justify-between">
              <span className="font-semibold text-black text-sm dark:text-white">
                {data.location}
              </span>
              <span className="flex items-center font-medium text-black/60 text-xs dark:text-white/60">
                <Wind className="mr-1 h-3 w-3" />
                {data.windSpeed} {data.windSpeedUnit}
              </span>
            </div>
            <span className="text-black/50 text-xs italic dark:text-white/50">
              {data.condition}
            </span>
            <div className="mt-auto flex w-full flex-row justify-between border-light-200/50 border-t pt-2 font-medium text-black/50 text-xs dark:border-dark-200/50 dark:text-white/50">
              <span>Humidity {data.humidity}%</span>
              <span className="font-semibold text-black/70 dark:text-white/70">
                Now
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default WeatherWidget
