import type { WeatherNow } from '@/api/weather'

export type WeatherCondition =
  | 'sunny'
  | 'night'
  | 'cloudy'
  | 'rain'
  | 'thunder'
  | 'fog'
  | 'snow'
  | 'default'

const RAIN_ICONS = new Set(['300', '301', '305', '306', '307', '308', '309', '310', '311', '312', '313', '314', '315', '316', '317', '318', '350', '351', '399'])
const SNOW_ICONS = new Set(['400', '401', '402', '403', '404', '405', '406', '407', '408', '409', '410', '456', '457', '499'])
const FOG_ICONS = new Set(['500', '501', '502', '503', '504', '509', '510', '511', '512', '513', '514', '515'])
const THUNDER_ICONS = new Set(['302', '303', '304'])
const CLOUD_ICONS = new Set(['101', '102', '103', '104', '151', '152', '153', '154'])
const SUN_ICONS = new Set(['100', '150'])
const NIGHT_ICONS = new Set(['150', '151', '152', '153', '154'])

function fromIconCode(icon: string | null | undefined): WeatherCondition | null {
  if (!icon) return null
  const code = icon.trim()
  if (THUNDER_ICONS.has(code)) return 'thunder'
  if (RAIN_ICONS.has(code)) return 'rain'
  if (SNOW_ICONS.has(code)) return 'snow'
  if (FOG_ICONS.has(code)) return 'fog'
  if (NIGHT_ICONS.has(code) && (code === '150' || code.startsWith('15'))) return 'night'
  if (SUN_ICONS.has(code)) return code === '150' ? 'night' : 'sunny'
  if (CLOUD_ICONS.has(code)) return code === '150' || code === '151' ? 'night' : 'cloudy'
  return null
}

function fromText(text: string | null | undefined): WeatherCondition | null {
  if (!text) return null
  const t = text.toLowerCase()
  if (/雷|暴雨|阵雨.*雷/.test(text)) return 'thunder'
  if (/雪|冰雹/.test(text)) return 'snow'
  if (/雾|霾|沙|尘/.test(text)) return 'fog'
  if (/雨| drizzle|shower/i.test(t) || /雨/.test(text)) return 'rain'
  if (/夜|晴间多云.*夜/.test(text)) return 'night'
  if (/阴|云|多云|少云/.test(text)) return 'cloudy'
  if (/晴/.test(text)) return 'sunny'
  return null
}

export function resolveWeatherCondition(now: WeatherNow | null): WeatherCondition {
  if (!now) return 'default'
  const fromIcon = fromIconCode(now.icon)
  if (fromIcon) return fromIcon
  const fromTxt = fromText(now.text)
  if (fromTxt) return fromTxt
  return 'default'
}

export function weatherConditionLabel(c: WeatherCondition): string {
  const m: Record<WeatherCondition, string> = {
    sunny: '晴天',
    night: '夜晚',
    cloudy: '多云',
    rain: '下雨',
    thunder: '雷雨',
    fog: '雾',
    snow: '下雪',
    default: '默认氛围',
  }
  return m[c]
}
