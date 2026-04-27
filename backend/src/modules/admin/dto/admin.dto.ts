import { IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator'
import { UserRole } from '@prisma/client'

export class AdminResetPasswordDto {
  @IsString()
  @MinLength(8)
  newPassword!: string
}

export class AdminUpdateUserRoleDto {
  @IsEnum(UserRole)
  role!: UserRole
}

export class AdminFindUserQueryDto {
  @IsOptional()
  @IsString()
  keyword?: string

  @IsOptional()
  @IsEmail()
  email?: string
}

