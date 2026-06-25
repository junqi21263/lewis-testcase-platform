import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { PassportModule } from '@nestjs/passport'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { AuthService } from './auth.service'
import { AuthController } from './auth.controller'
import { JwtStrategy } from './strategies/jwt.strategy'
import { PasswordValidator } from '@/common/validators/password.validator'
import { MailModule } from '@/modules/mail/mail.module'
import { getJwtExpiresIn, getJwtSecret } from './jwt-config.util'
import { CaptchaService } from './captcha.service'
import { RedisModule } from '@/redis/redis.module'
import { JwtDenylistService } from './jwt-denylist.service'

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    MailModule,
    RedisModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: getJwtSecret(config),
        signOptions: { expiresIn: getJwtExpiresIn(config) },
      }),
    }),
  ],
  providers: [AuthService, JwtStrategy, PasswordValidator, CaptchaService, JwtDenylistService],
  controllers: [AuthController],
  exports: [AuthService, JwtModule, JwtDenylistService],
})
export class AuthModule {}
