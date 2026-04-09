import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Shadcn UI 样式合并工具 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
