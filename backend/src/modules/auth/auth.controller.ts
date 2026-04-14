import { Controller, Post, Get, Patch, HttpCode, HttpStatus, Body } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { AuthService } from './auth.service'
import {
  LoginDto,
  RegisterSendCodeDto,
  RegisterConfirmDto,
  RegisterResendCodeDto,
  ChangePasswordDto,
  ForgotPasswordDto,
  ResetPasswordDto,
} from './dto/auth.dto'
import { Public } from '@/common/decorators/public.decorator'
import { CurrentUser } from '@/common/decorators/current-user.decorator'

@ApiTags('认证')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '用户登录' })
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto)
  }

  @Public()
  @Post('register/send-code')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '注册 - 发送邮箱验证码' })
  async registerSendCode(@Body() dto: RegisterSendCodeDto) {
    return this.authService.registerSendCode(dto)
  }

  @Public()
  @Post('register/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '注册 - 提交验证码并创建账号' })
  async registerConfirm(@Body() dto: RegisterConfirmDto) {
    return this.authService.registerConfirm(dto)
  }

  @Public()
  @Post('register/resend-code')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '注册 - 重发验证码' })
  async registerResendCode(@Body() dto: RegisterResendCodeDto) {
    return this.authService.registerResendCode(dto)
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '忘记密码 - 发送邮箱验证码' })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto)
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '重置密码（邮箱验证码 + 新密码）' })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto)
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

  @Patch('change-password')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: '修改密码' })
  changePassword(@CurrentUser('id') userId: string, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(userId, dto)
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: '退出登录' })
  logout(@CurrentUser('id') userId: string) {
    return this.authService.logout(userId)
  }
}
