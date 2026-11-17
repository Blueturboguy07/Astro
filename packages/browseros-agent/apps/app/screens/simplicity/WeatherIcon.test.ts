import { describe, expect, it } from 'bun:test'
import { CloudRain, CloudSun, Moon, Sun } from 'lucide-react'
import { weatherIconFor } from './WeatherIcon'

describe('weatherIconFor (F-064)', () => {
  it('maps the icon names of both weather cards', () => {
    expect(weatherIconFor('clear-day')).toBe(Sun)
    expect(weatherIconFor('clear-night.svg')).toBe(Moon)
    expect(weatherIconFor('cloudy-1-day')).toBe(CloudSun)
    expect(weatherIconFor('rainy-3-night.svg')).toBe(CloudRain)
  })
})
