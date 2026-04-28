-- User preferences for wallpaper/weather features.

CREATE TABLE "user_preferences" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "wallpaperEnabled" BOOLEAN NOT NULL DEFAULT false,
    "wallpaperProvider" TEXT NOT NULL DEFAULT 'bing',
    "wallpaperIntervalSec" INTEGER NOT NULL DEFAULT 0,
    "wallpaperCurrentUrl" VARCHAR(2000),
    "wallpaperLastAt" TIMESTAMP(3),
    "weatherCityId" VARCHAR(64),
    "weatherCityName" VARCHAR(128),
    "weatherCityAdm1" VARCHAR(128),
    "weatherCityCountry" VARCHAR(64),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_preferences_userId_key" ON "user_preferences"("userId");

ALTER TABLE "user_preferences"
ADD CONSTRAINT "user_preferences_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

