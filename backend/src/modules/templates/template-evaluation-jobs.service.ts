import { Injectable, NotFoundException } from '@nestjs/common'
import { Response, Request } from 'express'
import { v4 as uuid } from 'uuid'
import { AiService } from '@/modules/ai/ai.service'
import type { EvaluateTemplateDto } from './dto/evaluate-template.dto'
import type { PromptEvaluationReport } from './prompt-template-evaluation.util'

export type TemplateEvaluationJobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'

export type TemplateEvaluationJobStage =
  | 'queued'
  | 'format_check'
  | 'original_evaluation'
  | 'ai_optimization'
  | 'guardrail_check'
  | 'optimized_evaluation'
  | 'comparison'
  | 'completed'
  | 'failed'
  | 'cancelled'

export type TemplateEvaluationJobSnapshot = {
  jobId: string
  templateId: string
  templateName: string
  templateVersion: number
  userId: string
  status: TemplateEvaluationJobStatus
  stage: TemplateEvaluationJobStage
  progress: number
  message: string
  logs: string[]
  createdAt: string
  updatedAt: string
  startedAt?: string
  completedAt?: string
  error?: string
  report?: PromptEvaluationReport
}

type TemplateSnapshot = {
  id: string
  name: string
  version: number
  content: string
}

type InternalJob = TemplateEvaluationJobSnapshot & {
  dto: EvaluateTemplateDto
  content: string
  cancelled: boolean
  idle?: Promise<void>
  subscribers: Set<Response>
}

@Injectable()
export class TemplateEvaluationJobsService {
  private readonly jobs = new Map<string, InternalJob>()

  constructor(private readonly ai: AiService) {}

  create(userId: string, template: TemplateSnapshot, dto: EvaluateTemplateDto): TemplateEvaluationJobSnapshot {
    const now = new Date().toISOString()
    const job: InternalJob = {
      jobId: uuid(),
      templateId: template.id,
      templateName: template.name,
      templateVersion: template.version,
      userId,
      status: 'queued',
      stage: 'queued',
      progress: 0,
      message: '评测任务已创建，等待后台执行',
      logs: ['评测任务已创建'],
      createdAt: now,
      updatedAt: now,
      dto,
      content: template.content,
      cancelled: false,
      subscribers: new Set(),
    }
    this.jobs.set(job.jobId, job)
    job.idle = new Promise((resolve) => {
      setTimeout(() => {
        void this.run(job).finally(resolve)
      }, 0)
    })
    return this.snapshot(job)
  }

  get(userId: string, jobId: string): TemplateEvaluationJobSnapshot {
    return this.snapshot(this.requireJob(userId, jobId))
  }

  cancel(userId: string, jobId: string): TemplateEvaluationJobSnapshot {
    const job = this.requireJob(userId, jobId)
    if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
      return this.snapshot(job)
    }
    job.cancelled = true
    this.update(job, {
      status: 'cancelled',
      stage: 'cancelled',
      message: '评测任务已取消',
      completedAt: new Date().toISOString(),
    })
    return this.snapshot(job)
  }

  async waitForIdleForTest(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId)
    await job?.idle
  }

  streamEvents(userId: string, jobId: string, res: Response, req?: Request) {
    const job = this.requireJob(userId, jobId)
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
    res.setHeader('Cache-Control', 'no-cache, no-transform')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')
    res.flushHeaders?.()

    const write = () => {
      if (!res.writableEnded) res.write(`data: ${JSON.stringify(this.snapshot(job))}\n\n`)
    }
    const cleanup = () => {
      job.subscribers.delete(res)
      try {
        if (!res.writableEnded) res.end()
      } catch {
        /* ignore */
      }
    }
    req?.on('close', cleanup)
    job.subscribers.add(res)
    write()
    if (['completed', 'failed', 'cancelled'].includes(job.status)) cleanup()
  }

  private requireJob(userId: string, jobId: string): InternalJob {
    const job = this.jobs.get(jobId)
    if (!job || job.userId !== userId) throw new NotFoundException('评测任务不存在')
    return job
  }

  private snapshot(job: InternalJob): TemplateEvaluationJobSnapshot {
    const {
      dto: _dto,
      content: _content,
      cancelled: _cancelled,
      idle: _idle,
      subscribers: _subscribers,
      ...snapshot
    } = job
    return {
      ...snapshot,
      logs: [...job.logs],
    }
  }

  private update(job: InternalJob, patch: Partial<TemplateEvaluationJobSnapshot>) {
    Object.assign(job, patch, { updatedAt: new Date().toISOString() })
    if (patch.message) job.logs = [...job.logs, patch.message].slice(-80)
    this.broadcast(job)
  }

  private broadcast(job: InternalJob) {
    const payload = `data: ${JSON.stringify(this.snapshot(job))}\n\n`
    for (const sub of [...job.subscribers]) {
      try {
        if (sub.writableEnded) {
          job.subscribers.delete(sub)
        } else {
          sub.write(payload)
        }
      } catch {
        job.subscribers.delete(sub)
      }
    }
  }

  private assertNotCancelled(job: InternalJob) {
    if (job.cancelled || job.status === 'cancelled') {
      throw new Error('评测任务已取消')
    }
  }

  private async run(job: InternalJob) {
    if (job.cancelled) return
    this.update(job, {
      status: 'running',
      stage: 'format_check',
      progress: 5,
      startedAt: new Date().toISOString(),
      message: '开始 Prompt 格式体检',
    })
    try {
      const report = await this.ai.evaluatePromptTemplate({
        templateId: job.templateId,
        templateName: job.templateName,
        templateVersion: job.templateVersion,
        content: job.content,
        modelConfigId: job.dto.modelConfigId,
        sampleLimit: job.dto.sampleLimit,
        temperature: job.dto.temperature,
        maxTokens: job.dto.maxTokens,
        onProgress: (event) => {
          this.assertNotCancelled(job)
          this.update(job, event)
        },
      })
      this.assertNotCancelled(job)
      this.update(job, {
        status: 'completed',
        stage: 'completed',
        progress: 100,
        message: 'Prompt 评测完成',
        completedAt: new Date().toISOString(),
        report,
      })
    } catch (err) {
      if (job.cancelled || String((err as Error)?.message ?? err).includes('已取消')) {
        this.update(job, {
          status: 'cancelled',
          stage: 'cancelled',
          message: '评测任务已取消',
          completedAt: new Date().toISOString(),
        })
        return
      }
      this.update(job, {
        status: 'failed',
        stage: 'failed',
        progress: Math.max(job.progress, 1),
        message: 'Prompt 评测失败',
        error: err instanceof Error ? err.message : String(err),
        completedAt: new Date().toISOString(),
      })
    }
  }
}
