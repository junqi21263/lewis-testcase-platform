import { Controller, Get, Query } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { WeatherService } from './weather.service'

@ApiTags('天气')
@ApiBearerAuth()
@Controller('weather')
export class WeatherController {
  constructor(private weather: WeatherService) {}

  @Get('cities')
  @ApiOperation({ summary: '城市搜索（用于手动选择城市）' })
  cities(@Query('query') query = '') {
    return this.weather.cityLookup(query)
  }

  @Get('current')
  @ApiOperation({ summary: '当前天气（按 locationId）' })
  current(@Query('cityId') cityId = '') {
    return this.weather.now(cityId)
  }
}

