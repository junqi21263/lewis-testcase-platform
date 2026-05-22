import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { ReviewComment, TestCaseCommentType } from '@/types/reviews'
import { rev } from '@/utils/reviewsUi'

export function ReviewCommentList({ comments }: { comments: ReviewComment[] }) {
  if (!comments.length) {
    return <p className="text-sm text-[hsl(var(--review-text-muted))]">暂无评论</p>
  }
  return (
    <ul className="flex flex-col gap-3">
      {comments.map((c) => (
        <li
          key={c.id}
          className="rounded-xl border border-[hsl(var(--review-border))] bg-[hsl(var(--review-panel-bg))] px-4 py-3"
        >
          <div className="flex items-center justify-between gap-2 text-[10px] text-[hsl(var(--review-text-muted))]">
            <span>{c.authorName}</span>
            <span>{new Date(c.createdAt).toLocaleString()}</span>
          </div>
          <span className="mt-1.5 inline-block rounded-md bg-[hsl(var(--review-chip-bg))] px-1.5 py-0.5 text-[10px] font-medium text-[hsl(var(--review-text-secondary))]">
            {c.commentType === 'change_request' ? '修改建议' : '备注'}
          </span>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[hsl(var(--review-text-primary))]">
            {c.content}
          </p>
        </li>
      ))}
    </ul>
  )
}

export function ReviewCommentComposer(props: {
  onSubmit: (content: string, type: TestCaseCommentType) => Promise<void>
  busy?: boolean
}) {
  const [content, setContent] = useState('')
  const [type, setType] = useState<TestCaseCommentType>('note')

  const submit = async () => {
    const t = content.trim()
    if (!t) return
    await props.onSubmit(t, type)
    setContent('')
  }

  return (
    <div className="mt-5 rounded-[14px] border border-[hsl(var(--review-border))] bg-[hsl(var(--review-panel-bg))] p-4">
      <p className="mb-3 text-xs font-semibold text-[hsl(var(--review-text-secondary))]">
        发表评论（仅保存评论，不会替代底部「保存」）
      </p>
      <div className="mb-3 flex flex-wrap gap-2">
        <button
          type="button"
          className={type === 'note' ? rev.chipActive + ' ' + rev.chip : rev.chipGhost + ' ' + rev.chip}
          onClick={() => setType('note')}
        >
          备注
        </button>
        <button
          type="button"
          className={
            type === 'change_request' ? rev.chipActive + ' ' + rev.chip : rev.chipGhost + ' ' + rev.chip
          }
          onClick={() => setType('change_request')}
        >
          修改建议
        </button>
      </div>
      <textarea
        className={rev.textarea + ' min-h-[96px]'}
        placeholder="填写评论或修改建议…"
        value={content}
        onChange={(e) => setContent(e.target.value)}
      />
      <div className="mt-3 flex justify-end">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className={rev.btnSecondary}
          disabled={props.busy || !content.trim()}
          onClick={() => void submit()}
        >
          提交评论
        </Button>
      </div>
    </div>
  )
}
