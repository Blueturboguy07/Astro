import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudMoon,
  CloudRain,
  CloudSnow,
  CloudSun,
  type LucideIcon,
  Moon,
  Snowflake,
  Sun,
} from 'lucide-react'

/**
 * The weather icon by its name ("clear-day", "rainy-2-night.svg", ...).
 * The cards pointed at /weather-ico/*.svg files that were never packaged,
 * so every card showed a broken image (Astro 0.2.4 QA, F-064).
 */
export function weatherIconFor(name: string): LucideIcon {
  const n = name.replace(/\.svg$/, '')
  const night = n.endsWith('-night')
  if (n.includes('thunderstorm')) return CloudLightning
  if (n.startsWith('snowy') || n.includes('sleet')) return CloudSnow
  if (n.startsWith('frost')) return Snowflake
  if (n.startsWith('rainy-1')) return CloudDrizzle
  if (n.startsWith('rainy') || n.includes('rain')) return CloudRain
  if (n.startsWith('fog')) return CloudFog
  if (n.startsWith('cloudy-1')) return night ? CloudMoon : CloudSun
  if (n.startsWith('cloudy')) return Cloud
  if (n.startsWith('clear')) return night ? Moon : Sun
  return Cloud
}

const WeatherIcon = ({
  name,
  label,
  className,
}: {
  name: string
  label?: string
  className?: string
}) => {
  const Icon = weatherIconFor(name)
  return (
    <Icon
      className={className}
      aria-label={label || undefined}
      aria-hidden={label ? undefined : true}
      role={label ? 'img' : undefined}
    />
  )
}

export default WeatherIcon
