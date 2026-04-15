import { request } from '@/utils/request'
import type { PromptTemplate } from '@/types'

export interface RequirementSnapshotPayload {
  id: string
  content: string
  selected: boolean
  sourceFile: string
}

export interface DocumentParseRecord {
  id: string
  creatorId: string
  teamId: string | null
  title: string
  rawText: string
  requirements: RequirementSnapshotPayload[]
  filledPrompt: string
  templateId: string | null
  fileIds: string[]
  createdAt: string
  template?: Pick<PromptTemplate, 'id' | 'name'> | null
}

export interface CreateDocumentParseRecordPayload {
  title: string
  rawText: string
  requirements: RequirementSnapshotPayload[]
  filledPrompt: string
  templateId?: string
  fileIds: string[]
}

export const documentParseApi = {
  create: (payload: CreateDocumentParseRecordPayload) =>
    request.post<DocumentParseRecord>('/document-parse', payload),

  recent: (limit = 10) =>
    request.get<DocumentParseRecord[]>('/document-parse/recent', { params: { limit } }),
}
