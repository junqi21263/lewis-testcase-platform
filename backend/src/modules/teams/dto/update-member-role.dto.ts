import { ApiProperty } from '@nestjs/swagger'
import { UserRole } from '@prisma/client'
import { IsIn } from 'class-validator'

export class UpdateMemberRoleDto {
  @ApiProperty({ enum: [UserRole.ADMIN, UserRole.MEMBER, UserRole.VIEWER] })
  @IsIn([UserRole.ADMIN, UserRole.MEMBER, UserRole.VIEWER])
  role: UserRole
}
