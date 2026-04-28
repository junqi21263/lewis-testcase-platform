import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { WeatherBadge } from '@/components/weather/WeatherBadge'

export function WeatherBadgeStory() {
  return (
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<WeatherBadge />} />
        <Route path="/settings" element={<div data-testid="settings-page">settings</div>} />
      </Routes>
    </MemoryRouter>
  )
}

