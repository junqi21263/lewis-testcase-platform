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
          className="rounded-xl border border-[hsl(var(--review-border))] bg-[hsl(var(--review-input-bg))] px-3 py-2.5"
        >
          <div className="flex items-center justify-between gap-2 text-[10px] text-[hsl(var(--review-text-muted))]">
            <span>{c.authorName}</span>
            <span>{new Date(c.createdAt).toLocaleString()}</span>
          </div>
          <span className="mt-1 inline-block text-[10px] font-medium text-primary">
            {c.commentType === 'change_request' ? '修改建议' : '备注'}
          </span>
          <p className="mt-1 whitespace-pre-wrap text-sm text-[hsl(var(--review-text-secondary))]">
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
    <div className="flex flex-col gap-2 border-t border-[hsl(var(--review-border))] pt-4">
      <div className="flex gap-2">
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
        className={rev.input + ' min-h-[80px] resize-y'}
        placeholder="填写评论或修改建议…"
        value={content}
        onChange={(e) => setContent(e.target.value)}
      />
      <Button size="sm" disabled={props.busy || !content.trim()} onClick={() => void submit()}>
        提交评论
      </Button>
    </div>
  )
}
