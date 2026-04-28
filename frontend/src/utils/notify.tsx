import toast from 'react-hot-toast'
import { copyTextToClipboard } from '@/utils/clipboard'

function trimLong(s: string, max = 140): { short: string; long?: string } {
  const t = s.trim()
  if (t.length <= max) return { short: t }
  return { short: `${t.slice(0, max)}…`, long: t }
}

export const notify = {
  success: (message: string) => toast.success(message, { duration: 3000 }),
  info: (message: string) => toast(message, { duration: 3500 }),
  warn: (message: string) => toast(message, { duration: 4500 }),
  error: (message: string) => {
    const { short, long } = trimLong(message)
    if (!long) return toast.error(short, { duration: 5000 })
    return toast.custom(
      (t) => (
        <div
          className={[
            'max-w-lg w-full rounded-md border bg-background shadow-lg p-3 space-y-2',
            t.visible ? 'animate-in fade-in-0 zoom-in-95' : 'animate-out fade-out-0 zoom-out-95',
          ].join(' ')}
        >
          <div className="text-sm font-medium text-destructive">发生错误</div>
          <div className="text-sm text-muted-foreground break-words">{short}</div>
          <div className="flex justify-end gap-2">
            <button
              className="text-xs px-2 py-1 rounded border hover:bg-accent"
              onClick={async () => {
                await copyTextToClipboard(long)
                toast.success('已复制错误详情')
              }}
            >
              复制详情
            </button>
            <button
              className="text-xs px-2 py-1 rounded border hover:bg-accent"
              onClick={() => toast.dismiss(t.id)}
            >
              关闭
            </button>
          </div>
        </div>
      ),
      { duration: 8000 },
    )
  },
}

