import { Controller, Post, Get, Body, Patch, UseGuards, HttpCode, HttpStatus } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { AuthService } from './auth.service'
import { LoginDto, RegisterDto, ChangePasswordDto } from './dto/auth.dto'
import { Public } from '@/common/decorators/public.decorator'
import { CurrentUser } from '@/common/decorators/current-user.decorator'
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard'

@ApiTags('认证')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '用户登录' })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto)
  }

  @Public()
  @Post('register')
  @ApiOperation({ summary: '用户注册' })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto)
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '退出登录' })
  logout() {
    // JWT 无状态，客户端删除 token 即可
    return { message: '已退出登录' }
  }

  @Get('profile')
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取当前用户信息' })
  getProfile(@CurrentUser('id') userId: string) {
    return this.authService.getProfile(userId)
  }

  @Patch('profile')
  @ApiBearerAuth()
  @ApiOperation({ summary: '更新个人资料' })
  updateProfile(
    @CurrentUser('id') userId: string,
    @Body() data: { username?: string; avatar?: string },
  ) {
    return this.authService.updateProfile(userId, data)
  }

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: '修改密码' })
  changePassword(@CurrentUser('id') userId: string, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(userId, dto)
  }
}
