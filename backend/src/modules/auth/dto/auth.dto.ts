import { IsEmail, IsString, MinLength, MaxLength, IsOptional, Matches } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'

const USERNAME_RE = /^[a-zA-Z0-9_\u4e00-\u9fa5.-]+$/

export class LoginDto {
  @ApiProperty({ example: 'admin_user' })
  @IsString()
  @MinLength(2, { message: '用户名至少2个字符' })
  @MaxLength(50, { message: '用户名最多50个字符' })
  @Matches(USERNAME_RE, {
    message: '用户名仅支持字母、数字、下划线、中文、点与短横线',
  })
  username: string

  @ApiProperty({ example: 'Admin@123456' })
  @IsString()
  @MinLength(6, { message: '密码至少6位' })
  password: string
}

export class RegisterDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail({}, { message: '邮箱格式不正确' })
  email: string

  @ApiProperty({ example: 'TestUser' })
  @IsString()
  @MinLength(2, { message: '用户名至少2个字符' })
  @MaxLength(50, { message: '用户名最多50个字符' })
  @Matches(USERNAME_RE, {
    message: '用户名仅支持字母、数字、下划线、中文、点与短横线',
  })
  username: string

  @ApiProperty()
  @IsString()
  @MinLength(6, { message: '密码至少6位' })
  password: string

  @ApiProperty({ required: false, example: 'avatar.png' })
  @IsOptional()
  @IsString()
  avatar?: string
}

export class ChangePasswordDto {
  @IsString()
  oldPassword: string

  @IsString()
  @MinLength(6, { message: '新密码至少6位' })
  newPassword: string
}

export class ForgotPasswordDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail({}, { message: '邮箱格式不正确' })
  email: string
}

export class ResetPasswordDto {
  @ApiProperty({ required: false, example: 'user@example.com' })
  @IsOptional()
  @IsEmail({}, { message: '邮箱格式不正确' })
  email?: string

  @ApiProperty({ example: 'reset-token' })
  @IsString()
  token: string

  @ApiProperty({ example: 'NewPassword123' })
  @IsString()
  @MinLength(6, { message: '新密码至少6位' })
  newPassword: string
}

export class VerifyEmailDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail({}, { message: '邮箱格式不正确' })
  email: string

  @ApiProperty({ example: 'verification-token' })
  @IsString()
  token: string
}

export class ResendVerificationDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail({}, { message: '邮箱格式不正确' })
  email: string
}