import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { CurrentUser } from '@/common/decorators/current-user.decorator'
import { CaseReviewStatus } from '@prisma/client'
import { ReviewsService } from './reviews.service'

@ApiTags('用例评审')
@ApiBearerAuth()
@Controller('reviews')
export class ReviewsController {
  constructor(private readonly service: ReviewsService) {}

  @Get('records/:recordId/workspace')
  @ApiOperation({ summary: '评审中心工作区数据' })
  getWorkspace(@Param('recordId') recordId: string, @CurrentUser() user: { id: string; role: string; teamId?: string }) {
    return this.service.getWorkspace(recordId, user as any)
  }

  @Get('records/:recordId/cases/:caseId')
  @ApiOperation({ summary: '单条用例评审详情' })
  getCaseDetail(
    @Param('recordId') recordId: string,
    @Param('caseId') caseId: string,
    @CurrentUser() user: { id: string; role: string; teamId?: string },
  ) {
    return this.service.getCaseDetail(recordId, caseId, user as any)
  }

  @Patch('records/:recordId/cases/:caseId')
  @ApiOperation({ summary: '保存用例编辑（生成新版本）' })
  saveCase(
    @Param('recordId') recordId: string,
    @Param('caseId') caseId: string,
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: { id: string; role: string; teamId?: string },
  ) {
    return this.service.saveCaseEdit(recordId, caseId, user as any, body as any)
  }

  @Patch('records/:recordId/cases/:caseId/status')
  @ApiOperation({ summary: '更新单条评审状态' })
  updateStatus(
    @Param('recordId') recordId: string,
    @Param('caseId') caseId: string,
    @Body() body: { status: CaseReviewStatus; comment?: string; commentType?: 'note' | 'change_request' },
    @CurrentUser() user: { id: string; role: string; teamId?: string },
  ) {
    return this.service.updateReviewStatus(
      recordId,
      caseId,
      user as any,
      body.status,
      body.comment,
      body.commentType,
    )
  }

  @Post('records/:recordId/batch-status')
  @ApiOperation({ summary: '批量更新评审状态' })
  batchStatus(
    @Param('recordId') recordId: string,
    @Body() body: { caseIds: string[]; status: CaseReviewStatus; comment?: string },
    @CurrentUser() user: { id: string; role: string; teamId?: string },
  ) {
    return this.service.batchUpdateReviewStatus(recordId, user as any, body.caseIds, body.status, body.comment)
  }

  @Get('cases/:caseId/versions')
  @ApiOperation({ summary: '用例版本列表' })
  listVersions(@Param('caseId') caseId: string, @CurrentUser() user: { id: string; role: string; teamId?: string }) {
    return this.service.listVersions(caseId, user as any)
  }

  @Get('versions/:versionId')
  @ApiOperation({ summary: '版本详情' })
  getVersion(@Param('versionId') versionId: string, @CurrentUser() user: { id: string; role: string; teamId?: string }) {
    return this.service.getVersion(versionId, user as any)
  }

  @Post('versions/:versionId/restore')
  @ApiOperation({ summary: '恢复指定版本' })
  restore(@Param('versionId') versionId: string, @CurrentUser() user: { id: string; role: string; teamId?: string }) {
    return this.service.restoreVersion(versionId, user as any)
  }

  @Get('cases/:caseId/diff')
  @ApiOperation({ summary: '版本 diff' })
  diff(
    @Param('caseId') caseId: string,
    @Query('leftVersionId') leftVersionId: string | undefined,
    @Query('rightVersionId') rightVersionId: string | undefined,
    @CurrentUser() user: { id: string; role: string; teamId?: string },
  ) {
    return this.service.diffVersions(caseId, user as any, { leftVersionId, rightVersionId })
  }

  @Get('cases/:caseId/comments')
  @ApiOperation({ summary: '评论列表' })
  listComments(@Param('caseId') caseId: string, @CurrentUser() user: { id: string; role: string; teamId?: string }) {
    return this.service.listComments(caseId, user as any)
  }

  @Post('records/:recordId/cases/:caseId/comments')
  @ApiOperation({ summary: '添加评论' })
  addComment(
    @Param('recordId') recordId: string,
    @Param('caseId') caseId: string,
    @Body() body: { content: string; commentType?: 'note' | 'change_request' },
    @CurrentUser() user: { id: string; role: string; teamId?: string },
  ) {
    return this.service.addComment(recordId, caseId, user as any, body.content, body.commentType)
  }

  @Post('records/:recordId/bootstrap')
  @ApiOperation({ summary: '为记录初始化评审数据（补救）' })
  bootstrap(
    @Param('recordId') recordId: string,
    @CurrentUser() user: { id: string; role: string; teamId?: string },
  ) {
    return this.service.bootstrapForRecordByRecordId(recordId, user as any)
  }
}
