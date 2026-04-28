import { Body, Controller, Get, Ip, Param, Patch, Post, Query } from '@nestjs/common'
import { UserRole } from '@prisma/client'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { Roles } from '../../common/decorators/roles.decorator'
import { AdminService } from './admin.service'
import { AdminResetPasswordDto, AdminUpdateUserRoleDto } from './dto/admin.dto'

@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  /** 简化版用户管理：仅 SUPER_ADMIN 可用 */
  @Get('users')
  @Roles(UserRole.SUPER_ADMIN)
  async listUsers(
    @Query('keyword') keyword?: string,
    @Query('page') pageRaw?: string,
    @Query('pageSize') pageSizeRaw?: string,
  ) {
    const page = Math.max(1, parseInt(pageRaw || '1', 10) || 1)
    const pageSize = Math.min(100, Math.max(1, parseInt(pageSizeRaw || '20', 10) || 20))
    return this.admin.listUsers({ keyword, take: pageSize, skip: (page - 1) * pageSize })
  }

  @Post('users/:id/reset-password')
  @Roles(UserRole.SUPER_ADMIN)
  async resetPassword(
    @Param('id') id: string,
    @Body() dto: AdminResetPasswordDto,
    @CurrentUser('id') operatorId: string,
    @Ip() ip: string,
  ) {
    return this.admin.resetUserPassword(id, dto.newPassword, operatorId, ip)
  }

  @Patch('users/:id/role')
  @Roles(UserRole.SUPER_ADMIN)
  async updateRole(
    @Param('id') id: string,
    @Body() dto: AdminUpdateUserRoleDto,
    @CurrentUser('id') operatorId: string,
    @Ip() ip: string,
  ) {
    return this.admin.updateUserRole(id, dto.role, operatorId, ip)
  }

  @Get('audit-logs')
  @Roles(UserRole.SUPER_ADMIN)
  async auditLogs(@Query('page') pageRaw?: string, @Query('pageSize') pageSizeRaw?: string) {
    const page = Math.max(1, parseInt(pageRaw || '1', 10) || 1)
    const pageSize = Math.min(100, Math.max(1, parseInt(pageSizeRaw || '20', 10) || 20))
    return this.admin.listAuditLogs({ take: pageSize, skip: (page - 1) * pageSize })
  }
}

