import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '@/prisma/prisma.service'
import { CreateDocumentParseRecordDto } from './dto/create-document-parse-record.dto'

@Injectable()
export class DocumentParseService {
  constructor(private prisma: PrismaService) {}

  async create(userId: string, dto: CreateDocumentParseRecordDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { teamId: true },
    })

    return this.prisma.documentParseRecord.create({
      data: {
        creatorId: userId,
        teamId: user?.teamId ?? null,
        title: dto.title.slice(0, 300),
        rawText: dto.rawText,
        requirements: JSON.parse(JSON.stringify(dto.requirements)) as Prisma.InputJsonValue,
        filledPrompt: dto.filledPrompt,
        templateId: dto.templateId?.trim() || null,
        fileIds: JSON.parse(JSON.stringify(dto.fileIds)) as Prisma.InputJsonValue,
      },
    })
  }

  async listRecent(userId: string, limit = 10) {
    return this.prisma.documentParseRecord.findMany({
      where: { creatorId: userId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 50),
      include: {
        template: { select: { id: true, name: true } },
      },
    })
  }
}
