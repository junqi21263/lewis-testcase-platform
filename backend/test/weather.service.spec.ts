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
})
