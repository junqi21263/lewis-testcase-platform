import { IsBoolean, IsInt, IsOptional, IsString, Max, Min } from 'class-validator'

export class UpdatePreferencesDto {
  @IsOptional()
  @IsBoolean()
  wallpaperEnabled?: boolean

  @IsOptional()
  @IsString()
  wallpaperProvider?: string

  /** 0=每次进入换一张（由前端触发）；>0=按间隔自动切换 */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365 * 24 * 3600)
  wallpaperIntervalSec?: number

  @IsOptional()
  @IsString()
  weatherCityId?: string

  @IsOptional()
  @IsString()
  weatherCityName?: string

  @IsOptional()
  @IsString()
  weatherCityAdm1?: string

  @IsOptional()
  @IsString()
  weatherCityCountry?: string
}

