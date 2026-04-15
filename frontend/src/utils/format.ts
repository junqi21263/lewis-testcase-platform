import { format, formatDistanceToNow } from 'date-fns'
import { zhCN } from 'date-fns/locale'

/** 格式化日期 */
export function formatDate(date: string | Date, pattern = 'yyyy-MM-dd HH:mm:ss'): string {
  return format(new Date(date), pattern, { locale: zhCN })
}

/** 相对时间（如：3分钟前） */
export function timeAgo(date: string | Date): string {
  return formatDistanceToNow(new Date(date), { locale: zhCN, addSuffix: true })
}

/** 文件大小格式化 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
}

/** 优先级颜色映射 */
export const priorityColorMap: Record<string, string> = {
  P0: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  P1: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  P2: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  P3: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
}

/** 状态颜色映射（用例集/用例等） */
export const statusColorMap: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
  REVIEWING: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  APPROVED: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  ARCHIVED: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  PENDING: 'bg-gray-100 text-gray-700 dark:bg-zinc-800/60 dark:text-zinc-300',
  PROCESSING: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  SUCCESS: 'bg-green-100 text-green-700 dark:bg-emerald-950/30 dark:text-emerald-300',
  FAILED: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300',
}

/** 生成记录状态（单独样式，避免与用例集 ARCHIVED 紫色冲突） */
export const generationRecordStatusClass: Record<string, string> = {
  PENDING: 'bg-zinc-500/15 text-zinc-300 border-zinc-500/30',
  PROCESSING: 'bg-blue-500/15 text-blue-300 border-blue-500/40',
  SUCCESS: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40',
  FAILED: 'bg-red-500/15 text-red-300 border-red-500/40',
  ARCHIVED: 'bg-muted/80 text-muted-foreground border-border',
  CANCELLED: 'bg-slate-500/15 text-slate-300 border-slate-500/35',
}
