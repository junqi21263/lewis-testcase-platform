import { Controller, Get, Post, Patch, Delete, Body, Param, Query } from '@nestjs/common'
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger'
import { TeamsService } from './teams.service'
import { CurrentUser } from '@/common/decorators/current-user.decorator'
import { UserRole } from '@prisma/client'
import { CreateTeamDto } from './dto/create-team.dto'
import { UpdateTeamDto } from './dto/update-team.dto'
import { InviteMemberDto } from './dto/invite-member.dto'
import { UpdateMemberRoleDto } from './dto/update-member-role.dto'

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
  getById(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.service.getById(id, userId)
  }

  @Post()
  create(@CurrentUser('id') userId: string, @Body() data: CreateTeamDto) {
    return this.service.create(userId, data)
  }

  @Patch(':id')
  update(@Param('id') id: string, @CurrentUser('id') userId: string, @Body() data: UpdateTeamDto) {
    return this.service.update(id, userId, data)
  }

  @Delete(':id')
  delete(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.service.delete(id, userId)
  }

  @Get(':id/members')
  getMembers(@Param('id') teamId: string, @CurrentUser('id') userId: string) {
    return this.service.getMembers(teamId, userId)
  }

  @Post(':id/members/invite')
  inviteMember(
    @Param('id') teamId: string,
    @CurrentUser('id') userId: string,
    @Body() data: InviteMemberDto,
  ) {
    return this.service.inviteMember(teamId, userId, data)
  }

  @Delete(':id/members/:memberId')
  removeMember(@Param('id') teamId: string, @Param('memberId') memberId: string, @CurrentUser('id') userId: string) {
    return this.service.removeMember(teamId, memberId, userId)
  }

  @Patch(':id/members/:memberId')
  updateRole(
    @Param('id') teamId: string,
    @Param('memberId') memberId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateMemberRoleDto,
  ) {
    return this.service.updateMemberRole(teamId, memberId, userId, dto.role as UserRole)
  }
}
