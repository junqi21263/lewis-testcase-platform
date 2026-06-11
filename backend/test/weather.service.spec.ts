import axios from 'axios'
import { WeatherService } from '@/modules/weather/weather.service'

jest.mock('axios')

const mockedAxios = axios as jest.Mocked<typeof axios>

describe('WeatherService', () => {
  beforeEach(() => {
    jest.resetAllMocks()
  })

  it('returns stale unavailable weather instead of throwing when upstream current weather fails', async () => {
    mockedAxios.get.mockRejectedValueOnce(new Error('timeout of 10000ms exceeded'))

    const service = new WeatherService()
    const result = await service.now('43.70643,-79.39864')

    expect(result).toEqual({
      locationId: '43.70643,-79.39864',
      updateTime: null,
      obsTime: null,
      temp: null,
      feelsLike: null,
      text: '暂不可用',
      icon: 'unknown',
      windDir: null,
      windScale: null,
      humidity: null,
      stale: true,
    })
  })

  it('falls back to wttr current weather when Open-Meteo is unavailable', async () => {
    mockedAxios.get
      .mockRejectedValueOnce(new Error('SSL EOF'))
      .mockResolvedValueOnce({
        data: {
          current_condition: [
            {
              localObsDateTime: '2026-06-11 18:20',
              temp_C: '22',
              FeelsLikeC: '24',
              humidity: '68',
              weatherDesc: [{ value: 'Partly cloudy' }],
              weatherCode: '116',
              winddirDegree: '135',
            },
          ],
        },
      })

    const service = new WeatherService()
    const result = await service.now('43.70643,-79.39864')

    expect(mockedAxios.get).toHaveBeenCalledTimes(2)
    expect(result).toEqual({
      locationId: '43.70643,-79.39864',
      updateTime: '2026-06-11 18:20',
      obsTime: '2026-06-11 18:20',
      temp: 22,
      feelsLike: 24,
      text: '多云',
      icon: 'cloud',
      windDir: '135',
      windScale: null,
      humidity: 68,
      stale: false,
    })
  })
})
