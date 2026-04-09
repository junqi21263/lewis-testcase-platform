/**
 * UploadErrorBoundary —— 上传模块的错误边界
 * 捕获子组件渲染错误，展示友好的降级 UI + 重试按钮
 */

import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  errorMessage: string
}

export default class UploadErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, errorMessage: '' }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, errorMessage: error.message }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // 生产环境可接入 Sentry 等监控平台
    console.error('[UploadErrorBoundary]', error, info.componentStack)
  }

  handleReset = () => {
    this.setState({ hasError: false, errorMessage: '' })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
          <div className="w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center">
            <AlertTriangle className="w-7 h-7 text-destructive" />
          </div>
          <div>
            <p className="font-semibold text-foreground">上传模块出现异常</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-xs">
              {this.state.errorMessage || '页面渲染出错，请刷新重试'}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={this.handleReset} className="gap-2">
            <RefreshCw className="w-4 h-4" />
            重新加载
          </Button>
        </div>
      )
    }
    return this.props.children
  }
}
