import { Controller, Get, Post, Patch, Delete, Body, Param, Query } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { TeamsService } from './teams.service'
import { CurrentUser } from '@/common/decorators/current-user.decorator'
import { UserRole } from '@prisma/client'

@ApiTags('团队管理')
@ApiBearerAuth()
@Controller('teams')
export class TeamsController {
  constructor(private service: TeamsService) {}

  @Get()
  getTeams(@CurrentUser('id') userId: string, @Query('page') page = 1, @Query('pageSize') pageSize = 10) {
    return this.service.getTeams(userId, +page, +pageSize)
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.service.getById(id)
  }

  @Post()
  create(@CurrentUser('id') userId: string, @Body() data: { name: string; description?: string }) {
    return this.service.create(userId, data)
  }

  @Patch(':id')
  update(@Param('id') id: string, @CurrentUser('id') userId: string, @Body() data: any) {
    return this.service.update(id, userId, data)
  }

  @Delete(':id')
  delete(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.service.delete(id, userId)
  }

  @Get(':id/members')
  getMembers(@Param('id') teamId: string) {
    return this.service.getMembers(teamId)
  }

  @Post(':id/members/invite')
  inviteMember(@Param('id') teamId: string, @Body() data: { email: string; role: string }) {
    return this.service.inviteMember(teamId, data)
  }

  @Delete(':id/members/:memberId')
  removeMember(@Param('id') teamId: string, @Param('memberId') memberId: string) {
    return this.service.removeMember(teamId, memberId)
  }

  @Patch(':id/members/:memberId')
  updateRole(
    @Param('id') teamId: string,
    @Param('memberId') memberId: string,
    @Body('role') role: UserRole,
  ) {
    return this.service.updateMemberRole(teamId, memberId, role)
  }
}
