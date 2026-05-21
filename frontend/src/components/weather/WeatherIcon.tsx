import { Cloud, CloudFog, CloudLightning, CloudRain, CloudSnow, Moon, Sun } from 'lucide-react'
import { cn } from '@/utils/cn'
import type { WeatherCondition } from '@/utils/weatherCondition'

type Props = {
  condition: WeatherCondition
  className?: string
  size?: number
}

const iconMap = {
  sunny: Sun,
  night: Moon,
  cloudy: Cloud,
  rain: CloudRain,
  thunder: CloudLightning,
  fog: CloudFog,
  snow: CloudSnow,
  default: Cloud,
} as const

const animMap: Record<WeatherCondition, string> = {
  sunny: 'weather-icon--sunny',
  night: 'weather-icon--night',
  cloudy: 'weather-icon--cloudy',
  rain: 'weather-icon--rain',
  thunder: 'weather-icon--thunder',
  fog: 'weather-icon--fog',
  snow: 'weather-icon--snow',
  default: 'weather-icon--cloudy',
}

export function WeatherIcon({ condition, className, size = 18 }: Props) {
  const Icon = iconMap[condition] ?? Cloud
  return (
    <span
      className={cn(
        'weather-icon relative inline-flex shrink-0 items-center justify-center text-[hsl(var(--settings-weather-icon-color))]',
        animMap[condition],
        className,
      )}
      aria-hidden
    >
      <Icon style={{ width: size, height: size }} strokeWidth={2} />
      {condition === 'rain' || condition === 'thunder' ? (
        <span className="weather-icon__rain-streak pointer-events-none absolute inset-0" aria-hidden />
      ) : null}
      {condition === 'snow' ? (
        <span className="weather-icon__snow-dots pointer-events-none absolute inset-0" aria-hidden />
      ) : null}
    </span>
  )
}
