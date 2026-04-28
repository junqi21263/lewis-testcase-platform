import { Injectable } from '@nestjs/common'
import { PrismaService } from '@/prisma/prisma.service'
import { UpdatePreferencesDto } from './dto/update-preferences.dto'

@Injectable()
export class PreferencesService {
  constructor(private prisma: PrismaService) {}

  async getOrCreate(userId: string) {
    return this.prisma.userPreference.upsert({
      where: { userId },
      create: { userId },
      update: {},
    })
  }

  async update(userId: string, dto: UpdatePreferencesDto) {
    return this.prisma.userPreference.upsert({
      where: { userId },
      create: {
        userId,
        wallpaperEnabled: dto.wallpaperEnabled ?? false,
        wallpaperProvider: dto.wallpaperProvider ?? 'bing',
        wallpaperIntervalSec: dto.wallpaperIntervalSec ?? 0,
        weatherCityId: dto.weatherCityId,
        weatherCityName: dto.weatherCityName,
        weatherCityAdm1: dto.weatherCityAdm1,
        weatherCityCountry: dto.weatherCityCountry,
      },
      update: {
        ...(dto.wallpaperEnabled !== undefined ? { wallpaperEnabled: dto.wallpaperEnabled } : {}),
        ...(dto.wallpaperProvider !== undefined ? { wallpaperProvider: dto.wallpaperProvider } : {}),
        ...(dto.wallpaperIntervalSec !== undefined
          ? { wallpaperIntervalSec: dto.wallpaperIntervalSec }
          : {}),
        ...(dto.weatherCityId !== undefined ? { weatherCityId: dto.weatherCityId } : {}),
        ...(dto.weatherCityName !== undefined ? { weatherCityName: dto.weatherCityName } : {}),
        ...(dto.weatherCityAdm1 !== undefined ? { weatherCityAdm1: dto.weatherCityAdm1 } : {}),
        ...(dto.weatherCityCountry !== undefined
          ? { weatherCityCountry: dto.weatherCityCountry }
          : {}),
      },
    })
  }

  async setWallpaperCurrent(userId: string, next: { url: string; at?: Date }) {
    const at = next.at ?? new Date()
    return this.prisma.userPreference.upsert({
      where: { userId },
      create: {
        userId,
        wallpaperCurrentUrl: next.url,
        wallpaperLastAt: at,
      },
      update: {
        wallpaperCurrentUrl: next.url,
        wallpaperLastAt: at,
      },
    })
  }
}

