import { Controller, Get, Post, Patch, Delete, Body, Param, Query } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { TemplatesService } from './templates.service'
import { CurrentUser } from '@/common/decorators/current-user.decorator'

@ApiTags('提示词模板')
@ApiBearerAuth()
@Controller('templates')
export class TemplatesController {
  constructor(private service: TemplatesService) {}

  @Get()
  @ApiOperation({ summary: '获取模板列表' })
  getList(
    @CurrentUser('id') userId: string,
    @Query('page') page = 1,
    @Query('pageSize') pageSize = 20,
    @Query('category') category?: string,
    @Query('keyword') keyword?: string,
  ) {
    return this.service.getTemplates(userId, { page: +page, pageSize: +pageSize, category, keyword })
  }

  @Get(':id')
  @ApiOperation({ summary: '获取模板详情' })
  getById(@Param('id') id: string) {
    return this.service.getById(id)
  }

  @Post()
  @ApiOperation({ summary: '创建模板' })
  create(@CurrentUser('id') userId: string, @Body() data: any) {
    return this.service.create(userId, data)
  }

  @Patch(':id')
  @ApiOperation({ summary: '更新模板' })
  update(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: string,
    @Body() data: any,
  ) {
    return this.service.update(id, userId, data, role)
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除模板' })
  delete(@Param('id') id: string, @CurrentUser('id') userId: string, @CurrentUser('role') role: string) {
    return this.service.delete(id, userId, role)
  }
}
