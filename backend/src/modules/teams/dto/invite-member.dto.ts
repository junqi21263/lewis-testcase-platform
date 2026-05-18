import { ApiProperty } from '@nestjs/swagger'
import { UserRole } from '@prisma/client'
import { IsEmail, IsIn } from 'class-validator'

export class InviteMemberDto {
  @ApiProperty()
  @IsEmail()
  email: string

  @ApiProperty({ enum: [UserRole.ADMIN, UserRole.MEMBER, UserRole.VIEWER] })
  @IsIn([UserRole.ADMIN, UserRole.MEMBER, UserRole.VIEWER])
  role: UserRole
}
