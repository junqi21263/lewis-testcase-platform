import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Cron } from '@nestjs/schedule'
import { FileStatus, FileType } from '@prisma/client'
import { execSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import { PrismaService } from '@/prisma/prisma.service'

/**
 * 轻量云磁盘治理：过期 PDF 源文件删除（保留 parsedContent）、孤儿分片目录、
 * 可选模型缓存裁剪、磁盘阈值触发外部清理脚本与日志轮转。
 * 总开关：LIGHTWEIGHT_CLOUD_CLEANUP=1
 */
@Injectable()
export class LightweightCloudCleanupService implements OnModuleInit {
  private readonly logger = new Logger(LightweightCloudCleanupService.name)

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  onModuleInit() {
    if (!this.enabled()) return
    this.logger.log(
      'Lightweight cloud cleanup enabled (PDF retention, chunks, model cache roots, disk watch)',
    )
  }

  private enabled(): boolean {
    return this.config.get<string>('LIGHTWEIGHT_CLOUD_CLEANUP') === '1'
  }

  private uploadDir(): string {
    return this.config.get<string>('UPLOAD_DIR') || './uploads'
  }

  /** 每天 04:00 */
  @Cron('0 4 * * *')
  async scheduledDaily(): Promise<void> {
    if (!this.enabled()) return
    await this.purgePdfUploadsPastRetention()
    await this.purgeOrphanChunkSessions()
    await this.trimModelCacheRoots()
    this.runShellCleanupScript(false)
  }

  /** 每 10 分钟检查磁盘 */
  @Cron('*/10 * * * *')
  async diskPressureWatch(): Promise<void> {
    if (!this.enabled()) return
    const raw = this.config.get<string>('LIGHTWEIGHT_DISK_THRESHOLD_PERCENT') || '85'
    const threshold = parseInt(raw, 10)
    const t = Number.isFinite(threshold) && threshold > 0 && threshold <= 100 ? threshold : 85
    const pct = this.getDiskUsagePercent()
    if (pct == null || pct < t) return

    this.logger.warn(`磁盘占用 ${pct}% ≥ ${t}%，触发轻量云清理`)
    await this.purgePdfUploadsPastRetention()
    await this.purgeOrphanChunkSessions()
    await this.trimModelCacheRoots()
    this.runShellCleanupScript(true)
  }

  /** 解析完成的 PDF：默认保留 LIGHTWEIGHT_UPLOAD_RETENTION_DAYS（默认 3）天后删除本地文件；DB 保留 parsedContent */
  async purgePdfUploadsPastRetention(): Promise<number> {
    const raw = this.config.get<string>('LIGHTWEIGHT_UPLOAD_RETENTION_DAYS') || '3'
    const days = parseInt(raw, 10)
    const d = Number.isFinite(days) && days > 0 ? days : 3
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - d)

    const rows = await this.prisma.uploadedFile.findMany({
      where: {
        fileType: FileType.PDF,
        storagePurgedAt: null,
        parseFinishedAt: { lte: cutoff },
        status: { in: [FileStatus.PARSED, FileStatus.FAILED] },
        path: { not: null },
      },
      select: { id: true, path: true },
    })
    if (rows.length === 0) return 0

    const ids = rows.map((r) => r.id)
    for (const r of rows) {
      if (r.path && fs.existsSync(r.path)) {
        try {
          fs.unlinkSync(r.path)
        } catch (e) {
          this.logger.warn(`删除过期 PDF 失败 ${r.path}`, e as Error)
        }
      }
    }

    await this.prisma.generationRecord.updateMany({
      where: { fileId: { in: ids } },
      data: { fileId: null },
    })

    await this.prisma.uploadedFile.updateMany({
      where: { id: { in: ids } },
      data: { path: null, storagePurgedAt: new Date() },
    })

    this.logger.log(`轻量云：已释放 ${rows.length} 个过期 PDF 本地文件（解析文本仍保留）`)
    return rows.length
  }

  /** 长时间未完成合并的分片会话目录 */
  async purgeOrphanChunkSessions(): Promise<number> {
    const raw = this.config.get<string>('LIGHTWEIGHT_ORPHAN_CHUNK_MAX_AGE_HOURS') || '48'
    const hours = parseInt(raw, 10)
    const h = Number.isFinite(hours) && hours > 0 ? hours : 48
    const ageMs = h * 3600_000
    const chunksRoot = path.join(this.uploadDir(), 'chunks')
    if (!fs.existsSync(chunksRoot)) return 0

    let removed = 0
    const now = Date.now()
    for (const uid of fs.readdirSync(chunksRoot)) {
      const udir = path.join(chunksRoot, uid)
      try {
        if (!fs.statSync(udir).isDirectory()) continue
      } catch {
        continue
      }
      for (const fid of fs.readdirSync(udir)) {
        const d = path.join(udir, fid)
        try {
          if (!fs.statSync(d).isDirectory()) continue
          const st = fs.statSync(d)
          if (now - st.mtimeMs > ageMs) {
            fs.rmSync(d, { recursive: true, force: true })
            removed++
          }
        } catch (e) {
          this.logger.warn(`清理孤儿分片目录失败 ${d}`, e as Error)
        }
      }
    }
    if (removed > 0) {
      this.logger.log(`轻量云：已清理 ${removed} 个过期分片会话目录`)
    }
    return removed
  }

  /**
   * 每个根目录下仅保留最近修改的 N 项（文件或子目录）。用于 OCR 语言包等缓存。
   * 配置 LIGHTWEIGHT_MODEL_CACHE_ROOTS（逗号分隔）；勿指向 node_modules，除非你清楚后果。
   */
  async trimModelCacheRoots(): Promise<void> {
    const rootsRaw = this.config.get<string>('LIGHTWEIGHT_MODEL_CACHE_ROOTS')?.trim()
    if (!rootsRaw) return
    const rawKeep = this.config.get<string>('LIGHTWEIGHT_MODEL_CACHE_KEEP') || '1'
    const keep = parseInt(rawKeep, 10)
    const k = Number.isFinite(keep) && keep >= 1 ? keep : 1

    for (const root of rootsRaw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)) {
      if (!fs.existsSync(root)) continue
      this.trimDirKeepNewest(root, k)
    }
  }

  private trimDirKeepNewest(root: string, keep: number): void {
    let entries: { mtime: number; full: string }[] = []
    try {
      for (const name of fs.readdirSync(root)) {
        const full = path.join(root, name)
        const st = fs.statSync(full)
        entries.push({ mtime: st.mtimeMs, full })
      }
    } catch (e) {
      this.logger.warn(`读取模型缓存目录失败 ${root}`, e as Error)
      return
    }
    if (entries.length <= keep) return
    entries.sort((a, b) => b.mtime - a.mtime)
    for (const v of entries.slice(keep)) {
      try {
        fs.rmSync(v.full, { recursive: true, force: true })
        this.logger.log(`轻量云：已删除旧模型缓存项 ${v.full}`)
      } catch (e) {
        this.logger.warn(`删除模型缓存失败 ${v.full}`, e as Error)
      }
    }
  }

  private getDiskUsagePercent(): number | null {
    const mount = this.config.get<string>('LIGHTWEIGHT_DISK_CHECK_PATH')?.trim() || '/'
    try {
      const out = execSync(`df -P "${mount}" 2>/dev/null | tail -1`, {
        encoding: 'utf-8',
        maxBuffer: 4096,
      })
      const parts = out.trim().split(/\s+/)
      const cap = parts.find((p) => /^\d{1,3}%$/.test(p))
      if (!cap) return null
      return parseInt(cap.replace('%', ''), 10)
    } catch {
      return null
    }
  }

  private runShellCleanupScript(fromDiskPressure: boolean): void {
    const configured = this.config.get<string>('LIGHTWEIGHT_CLEANUP_SCRIPT_PATH')?.trim()
    const script = configured || path.join(process.cwd(), 'scripts', 'lightweight-cloud-cleanup.sh')
    if (!fs.existsSync(script)) {
      if (fromDiskPressure) {
        this.logger.warn(`清理脚本不存在，跳过日志轮转等: ${script}`)
      }
      return
    }
    try {
      execSync(`bash "${script}"`, {
        stdio: 'pipe',
        env: {
          ...process.env,
          LIGHTWEIGHT_CLEANUP_FROM_DISK_PRESSURE: fromDiskPressure ? '1' : '0',
        },
        maxBuffer: 2 * 1024 * 1024,
      })
    } catch (e) {
      this.logger.warn(`执行清理脚本失败 ${script}`, e as Error)
    }
  }
}
