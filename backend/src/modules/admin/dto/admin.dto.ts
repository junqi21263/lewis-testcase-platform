import { IsDateString, IsEmail, IsEnum, IsIn, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator'
import { Type } from 'class-transformer'
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

export class AdminCreateInviteCodeDto {
  @IsOptional()
  @IsString()
  @MinLength(4)
  @MaxLength(64)
  code?: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxUses?: number

  @IsOptional()
  @IsDateString()
  expiresAt?: string

  @IsOptional()
  @IsString()
  @MaxLength(500)
  remark?: string
}

export class AdminUpdateInviteCodeStatusDto {
  @IsIn(['ACTIVE', 'DISABLED'])
  status!: 'ACTIVE' | 'DISABLED'
}
