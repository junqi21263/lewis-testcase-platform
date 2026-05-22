import { Link } from 'react-router-dom'
import { ClipboardCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { rev } from '@/utils/reviewsUi'

export default function ReviewsIndexPage() {
  return (
    <div className={rev.page}>
      <div className="mx-auto flex max-w-lg flex-col items-center gap-4 px-6 py-24 text-center">
        <ClipboardCheck className="h-12 w-12 text-primary/80" />
        <h1 className="text-xl font-bold text-[hsl(var(--review-text-primary))]">用例评审中心</h1>
        <p className="text-sm leading-relaxed text-[hsl(var(--review-text-secondary))]">
          请从「生成记录」选择一条已成功生成的记录，进入该记录下全部用例的评审、编辑与版本管理。
        </p>
        <Button asChild>
          <Link to="/records">前往生成记录</Link>
        </Button>
      </div>
    </div>
  )
}
