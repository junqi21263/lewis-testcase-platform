import { Component, type ErrorInfo, type ReactNode } from 'react'
import { RefreshCw } from 'lucide-react'
import { tryRecoverFromChunkError } from '@/utils/runtimeChunkRecovery'

type Props = {
  children: ReactNode
}

type State = {
  error: Error | null
}

export class RouteErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, _info: ErrorInfo) {
    tryRecoverFromChunkError(error)
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="flex min-h-screen items-center justify-center bg-workspace-page px-6 text-workspace-text-primary">
        <div className="w-full max-w-md rounded-2xl border border-workspace-panel-border/70 bg-workspace-panel/90 p-6 text-center shadow-xl backdrop-blur-xl">
          <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/12 text-primary">
            <RefreshCw className="h-5 w-5" strokeWidth={2} />
          </div>
          <h1 className="text-lg font-semibold">页面资源已更新</h1>
          <p className="mt-2 text-sm leading-relaxed text-workspace-text-secondary">
            当前页面加载到了旧版本资源，请刷新后继续使用。
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-5 inline-flex h-10 items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
          >
            刷新页面
          </button>
        </div>
      </div>
    )
  }
}
