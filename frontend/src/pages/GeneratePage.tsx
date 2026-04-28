import { useState, useCallback, useEffect } from 'react'
import { Upload, FileText, Type, Wand2, Loader2, ChevronRight, X, RefreshCw } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useGenerateStore } from '@/store/generateStore'
import { filesApi } from '@/api/files'
import { aiApi } from '@/api/ai'
import { templatesApi } from '@/api/templates'
import { downloadSuiteExport, testcasesApi } from '@/api/testcases'
import { recordsApi } from '@/api/records'
import { parseAiCasesFromText } from '@/utils/parseAiCasesFromText'
import { formatFileSize, priorityColorMap } from '@/utils/format'
import { loadRecentTemplateIds, pushRecentTemplateId } from '@/utils/recentTemplates'
import {
  exportFilenameTimestamp,
  testcaseDelimitedValues,
  TESTCASE_EXPORT_COLUMNS_CN,
} from '@/utils/testcaseExportFormat'
import { copyTextToClipboard } from '@/utils/clipboard'
import { extractModuleFromTags } from '@/utils/parseLooseAiOutput'
import toast from 'react-hot-toast'
import type { TestCase, PromptTemplate, FileStatus } from '@/types'
import { useNavigate } from 'react-router-dom'

const fileStatusLabels: Record<FileStatus, string> = {
  PENDING: '等待解析',
  PARSING: '解析中…',
  PARSED: '解析完成',
  FAILED: '解析失败',
}

/** 上传后轮询解析状态（图片 OCR 可能需数十秒） */
async function pollFileUntilParsed(fileId: string) {
  for (let i = 0; i < 120; i++) {
    await new Promise((r) => setTimeout(r, 1000))
    try {
      const f = await filesApi.getFileById(fileId)
      useGenerateStore.getState().setUploadedFile(f)
      if (f.status === 'PARSED') {
        if (f.fileType === 'IMAGE' && !f.parsedContent?.trim()) {
          toast.error('图片未识别出文字，请在下方用文本补充需求，或换更清晰的截图')
        } else {
          toast.success('文档解析完成，可以开始生成')
        }
        return
      }
      if (f.status === 'FAILED') {
        toast.error('文件解析失败，无法用于生成，请换文件重试')
        return
      }
    } catch {
      return
    }
  }
  toast.error('解析超时，请刷新页面或重新上传')
}

/** 文件上传区域组件 */
function FileUploadZone() {
  const { setUploadedFile, uploadedFile } = useGenerateStore()
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)

  const handleDrop = useCallback(
    async (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      const file = e.dataTransfer.files[0]
      if (!file) return
      await uploadFile(file)
    },
    [],
  )

  const uploadFile = async (file: File) => {
    const allowed = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/plain', 'application/x-yaml',
      'image/png', 'image/jpeg']
    if (!allowed.some((t) => file.type.includes(t.split('/')[1])) && !file.name.match(/\.(pdf|docx|xlsx|txt|yaml|yml|png|jpg|jpeg)$/i)) {
      toast.error('不支持的文件格式，请上传 PDF/Word/Excel/YAML/图片 文件')
      return
    }
    setUploading(true)
    setProgress(0)
    try {
      const result = await filesApi.upload(file, setProgress)
      setUploadedFile(result)
      toast.success('上传成功，正在解析文档…')
      void pollFileUntilParsed(result.id)
    } catch {
      toast.error('文件上传失败')
    } finally {
      setUploading(false)
    }
  }

  if (uploadedFile) {
    const parsing = uploadedFile.status === 'PENDING' || uploadedFile.status === 'PARSING'
    return (
      <div className="flex items-center gap-3 p-4 border rounded-lg bg-green-50 dark:bg-green-950/20">
        <FileText className="w-8 h-8 text-green-600 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate">{uploadedFile.originalName}</p>
          <p className="text-xs text-muted-foreground">
            {formatFileSize(uploadedFile.size)} · {uploadedFile.fileType}
            {' · '}
            <span className={uploadedFile.status === 'FAILED' ? 'text-destructive' : ''}>
              {fileStatusLabels[uploadedFile.status]}
            </span>
          </p>
          {parsing && (
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-1 flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" />
              图片 OCR 或文档提取可能需要一段时间，请等待「解析完成」后再点生成
            </p>
          )}
        </div>
        <Button variant="ghost" size="icon" className="flex-shrink-0" onClick={() => setUploadedFile(null)}>
          <X className="w-4 h-4" />
        </Button>
      </div>
    )
  }

  return (
    <div
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
      className="border-2 border-dashed border-border rounded-lg p-8 text-center hover:border-primary/50 hover:bg-accent/30 transition-colors cursor-pointer"
      onClick={() => document.getElementById('file-input')?.click()}
    >
      <input
        id="file-input"
        type="file"
        className="hidden"
        accept=".pdf,.docx,.xlsx,.txt,.yaml,.yml,.png,.jpg,.jpeg"
        onChange={(e) => e.target.files?.[0] && uploadFile(e.target.files[0])}
      />
      {uploading ? (
        <div className="space-y-3">
          <Loader2 className="w-10 h-10 text-primary animate-spin mx-auto" />
          <p className="text-sm text-muted-foreground">上传中... {progress}%</p>
          <div className="w-full bg-secondary rounded-full h-1.5">
            <div className="bg-primary h-1.5 rounded-full transition-all" style={{ width: `${progress}%` }} />
          </div>
        </div>
      ) : (
        <>
          <Upload className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="font-medium text-sm">拖拽文件到此处，或点击选择</p>
          <p className="text-xs text-muted-foreground mt-1">
            支持 PDF、Word、Excel、YAML、图片；图片与「文本过少的 PDF」可在系统设置中配置多模态模型做视觉理解后再生成用例
          </p>
        </>
      )}
    </div>
  )
}

/** 生成结果展示 */
function GenerateResult({ cases }: { cases: TestCase[] }) {
  const navigate = useNavigate()
  const {
    reset,
    lastRecordId,
    lastSuiteId,
  } = useGenerateStore()

  const canExport = Boolean(lastSuiteId) || cases.length > 0

  const downloadTextFile = (filename: string, content: string, mime = 'text/plain;charset=utf-8') => {
    const blob = new Blob([content], { type: mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  const toMarkdown = (arr: TestCase[]) => {
    const lines: string[] = []
    lines.push(`# 测试用例（${arr.length} 条）`)
    lines.push('')
    for (const [idx, c] of arr.entries()) {
      lines.push(`## ${idx + 1}. ${c.title}`)
      lines.push('')
      lines.push(`- 优先级：${c.priority}`)
      lines.push(`- 类型：${c.type}`)
      if (c.precondition) lines.push(`- 前置条件：${c.precondition}`)
      lines.push('')
      lines.push('### 步骤')
      for (const s of c.steps ?? []) {
        lines.push(`${s.order}. ${s.action}${s.expected ? `（期望：${s.expected}）` : ''}`)
      }
      lines.push('')
      lines.push('### 预期结果')
      lines.push(c.expectedResult || '')
      lines.push('')
    }
    return lines.join('\n')
  }

  const handleExport = async (format: 'EXCEL' | 'CSV' | 'JSON' | 'MARKDOWN') => {
    if (!canExport) {
      toast.error('暂无可导出的用例')
      return
    }
    if (lastSuiteId) {
      try {
        await downloadSuiteExport(lastSuiteId, format)
        toast.success('已开始下载')
        return
      } catch {
        // fallback below
      }
    }

    const tsName = `${exportFilenameTimestamp()}`

    // fallback: client-side export (no suiteId / backend export failure)
    if (format === 'JSON') {
      downloadTextFile(`${tsName}.json`, JSON.stringify(cases, null, 2), 'application/json;charset=utf-8')
      toast.success('已导出 JSON')
      return
    }
    if (format === 'MARKDOWN') {
      downloadTextFile(`${tsName}.md`, toMarkdown(cases), 'text/markdown;charset=utf-8')
      toast.success('已导出 Markdown')
      return
    }
    if (format === 'CSV') {
      let moduleLabel = ''
      if (cases[0]?.suiteId) {
        try {
          const suite = await testcasesApi.getSuiteById(cases[0].suiteId)
          moduleLabel = (suite.projectName && suite.projectName.trim()) || suite.name || ''
        } catch {
          /* ignore */
        }
      }
      const esc = (v: string) => `"${v.replace(/"/g, '""')}"`
      const header = TESTCASE_EXPORT_COLUMNS_CN.map((h) => esc(h)).join(',')
      const rows = cases.map((c) => testcaseDelimitedValues(c, moduleLabel).map(esc).join(','))
      downloadTextFile(`${tsName}.csv`, [header, ...rows].join('\n'), 'text/csv;charset=utf-8')
      toast.success('已导出 CSV')
      return
    }
    toast.error(
      'Excel 需服务端用例集。请确认生成已写入用例集，或到「生成记录」打开该条记录后导出。',
    )
  }

  const handleCopyJson = async () => {
    const text = JSON.stringify(cases, null, 2)
    const ok = await copyTextToClipboard(text)
    if (ok) toast.success('已复制 JSON 到剪贴板')
    else toast.error('复制失败，请手动全选下方内容或使用「导出 JSON」')
  }

  const handleCreateShare = async () => {
    if (!lastRecordId) {
      toast.error('未找到生成记录，无法创建分享链接')
      return
    }
    try {
      const res = await recordsApi.createShare(lastRecordId, { expiresDays: 7 })
      const url = `${window.location.origin}${res.path || `/records/public/shares/${res.token}`}`
      const copied = await copyTextToClipboard(url)
      if (copied) toast.success('分享链接已复制（有效期 7 天）')
      else toast.success(`分享已创建：${url}`)
    } catch {
      toast.error('创建分享链接失败')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">生成完成</h3>
          <p className="text-sm text-muted-foreground">共生成 {cases.length} 条测试用例</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {lastRecordId && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(`/records/${lastRecordId}`)}
            >
              查看记录
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={handleCreateShare} disabled={!lastRecordId}>
            生成分享链接
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleExport('EXCEL')} disabled={!canExport}>
            导出 Excel
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleExport('MARKDOWN')} disabled={!canExport}>
            导出 Markdown
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleExport('JSON')} disabled={!canExport}>
            导出 JSON
          </Button>
          <Button variant="outline" size="sm" onClick={handleCopyJson} disabled={cases.length === 0}>
            复制 JSON
          </Button>
          <Button variant="outline" size="sm" onClick={reset} className="gap-1">
            <RefreshCw className="w-4 h-4" /> 重新生成
          </Button>
        </div>
      </div>

      <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
        {cases.map((c, i) => {
          const caseModule = extractModuleFromTags(c.tags)
          const caseTags = (c.tags ?? []).filter((t) => t && !t.startsWith('模块:'))
          return (
            <Card key={c.id || i} className="border">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <h4 className="font-medium text-sm">{c.title}</h4>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <Badge className={`text-xs ${priorityColorMap[c.priority] || ''}`} variant="outline">
                      {c.priority}
                    </Badge>
                    <Badge variant="secondary" className="text-xs">{c.type}</Badge>
                  </div>
                </div>
                {caseModule && (
                  <p className="text-xs text-muted-foreground mb-2">
                    <span className="font-medium">所属模块：</span>
                    {caseModule}
                  </p>
                )}
                {caseTags.length > 0 && (
                  <p className="text-xs text-muted-foreground mb-2">
                    <span className="font-medium">标签：</span>
                    {caseTags.join(', ')}
                  </p>
                )}
                {c.precondition && (
                  <p className="text-xs text-muted-foreground mb-2">
                    <span className="font-medium">前置条件：</span>{c.precondition}
                  </p>
                )}
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">步骤描述</p>
                  {c.steps.map((step) => (
                    <div key={step.order} className="text-xs flex gap-2">
                      <span className="text-muted-foreground w-5 flex-shrink-0">{step.order}.</span>
                      <span>{step.action}</span>
                    </div>
                  ))}
                </div>
                <p className="text-xs mt-2">
                  <span className="font-medium text-green-600">预期结果：</span>{c.expectedResult}
                </p>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}

export default function GeneratePage() {
  const {
    currentStep, setStep,
    sourceType, setSourceType,
    uploadedFile, setUploadedFile,
    inputText, setInputText,
    customPrompt, setCustomPrompt,
    selectedTemplateId, setSelectedTemplateId,
    aiParams, setAiParams,
    generatedCases, setGeneratedCases,
    setLastRecordId,
    setLastSuiteId,
    isGenerating, setIsGenerating,
    streamContent, appendStreamContent, clearStreamContent,
  } = useGenerateStore()

  const [templateOptions, setTemplateOptions] = useState<PromptTemplate[]>([])
  const [recentTplIds, setRecentTplIds] = useState<string[]>(() => loadRecentTemplateIds())

  /** 进入生成页时消费文档解析投递（仅处理一次，避免依赖链重复触发） */
  useEffect(() => {
    const h = useGenerateStore.getState().pendingGenerateHandoff
    if (!h) return
    setCustomPrompt(h.filledPrompt)
    setSelectedTemplateId(h.templateId)
    setSourceType('text')
    setInputText('')
    setUploadedFile(null)
    setStep('prompt')
    useGenerateStore.getState().setPendingGenerateHandoff(null)
    toast.success('已从文档解析载入需求与提示词，可直接生成')
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅挂载时消费 handoff
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await templatesApi.getTemplates({ page: 1, pageSize: 100 })
        if (!cancelled) setTemplateOptions(res.list)
      } catch {
        /* ignore */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  /** 拉取默认模型配置 id，与系统设置中的「默认模型」一致 */
  useEffect(() => {
    if (useGenerateStore.getState().aiParams.modelConfigId) return
    let cancelled = false
    aiApi
      .getModels()
      .then((list) => {
        if (cancelled) return
        const def = list.find((m) => m.isDefault) ?? list[0]
        if (def?.id) setAiParams({ modelConfigId: def.id })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [setAiParams])

  const handleGenerate = async () => {
    if (sourceType === 'file' && !uploadedFile) {
      toast.error('请先上传文件')
      return
    }
    if (sourceType === 'text' && !inputText.trim() && !customPrompt.trim()) {
      toast.error('请输入需求文本，或确保提示词中已包含完整需求描述')
      return
    }
    if (!customPrompt.trim()) {
      toast.error('请输入或选择提示词模板')
      return
    }

    if (sourceType === 'file' && uploadedFile) {
      let file = uploadedFile
      try {
        file = await filesApi.getFileById(uploadedFile.id)
        useGenerateStore.getState().setUploadedFile(file)
      } catch {
        toast.error('无法获取文件状态，请重试')
        return
      }
      if (file.status !== 'PARSED') {
        toast.error('请等待文件解析完成（须显示「解析完成」）后再生成')
        return
      }
      if (!file.parsedContent?.trim()) {
        toast.error('文件没有可用文本（如无字截图）。请改用「文本输入」补充需求，或换一份文档。')
        return
      }
    }

    setIsGenerating(true)
    clearStreamContent()
    setStep('generating')

    try {
      if (aiParams.stream) {
        // 流式生成
        await aiApi.generateStream(
          {
            sourceType,
            fileId: uploadedFile?.id,
            text: inputText,
            customPrompt,
            templateId: selectedTemplateId ?? undefined,
            ...aiParams,
          },
          (chunk) => appendStreamContent(chunk),
          async (meta) => {
            const { streamContent: fullText } = useGenerateStore.getState()
            setIsGenerating(false)
            setLastRecordId(meta?.recordId ?? null)
            setLastSuiteId(meta?.suiteId ?? null)
            let cases: TestCase[] = []
            if (meta?.suiteId) {
              try {
                cases = await testcasesApi.getCasesBySuiteId(meta.suiteId)
              } catch {
                cases = []
              }
            }
            if (cases.length === 0) {
              cases = parseAiCasesFromText(fullText)
            }
            setGeneratedCases(cases)
            setStep('result')
            if (cases.length === 0) {
              toast.error(
                '未生成任何用例：模型输出为空或无法解析为 JSON。请检查模型与需求描述，或到生成记录查看失败原因。',
              )
            } else {
              toast.success(`用例生成完成，共 ${cases.length} 条`)
            }
          },
          (err) => {
            setIsGenerating(false)
            toast.error(`生成失败: ${err.message}`)
            setStep('prompt')
          },
        )
      } else {
        // 非流式
        const result = await aiApi.generateTestCases({
          sourceType,
          fileId: uploadedFile?.id,
          text: inputText,
          customPrompt,
          templateId: selectedTemplateId ?? undefined,
          ...aiParams,
        })
        setGeneratedCases(result.cases)
        setLastRecordId(result.recordId ?? null)
        // 通过 recordId 回查 suiteId，保证导出/分享体验一致
        try {
          const rec = await recordsApi.getRecordById(result.recordId)
          setLastSuiteId(rec.suiteId ?? null)
        } catch {
          setLastSuiteId(null)
        }
        setIsGenerating(false)
        setStep('result')
        toast.success(`成功生成 ${result.cases.length} 条用例！`)
      }
    } catch {
      setIsGenerating(false)
      setStep('prompt')
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">生成测试用例</h1>
        <p className="text-muted-foreground mt-1">上传需求文档或输入需求描述，AI 自动生成标准化测试用例</p>
      </div>

      {/* 步骤指示器 */}
      <div className="flex items-center gap-2 text-sm">
        {(['upload', 'prompt', 'generating', 'result'] as const).map((step, i) => {
          const labels = ['上传文档', '配置提示词', '生成中', '查看结果']
          const isActive = currentStep === step
          const isDone = ['upload', 'prompt', 'generating', 'result'].indexOf(currentStep) > i
          return (
            <div key={step} className="flex items-center gap-2">
              <div className={`flex items-center gap-1.5 ${isActive ? 'text-primary font-medium' : isDone ? 'text-green-600' : 'text-muted-foreground'}`}>
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${isActive ? 'bg-primary text-white' : isDone ? 'bg-green-600 text-white' : 'bg-muted text-muted-foreground'}`}>
                  {i + 1}
                </div>
                {labels[i]}
              </div>
              {i < 3 && <ChevronRight className="w-4 h-4 text-muted-foreground" />}
            </div>
          )
        })}
      </div>

      {/* 步骤内容 */}
      {(currentStep === 'upload' || currentStep === 'prompt') && (
        <div className="grid grid-cols-1 gap-6">
          {/* 输入来源 */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">选择输入来源</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-3">
                {(['file', 'text'] as const).map((type) => (
                  <button
                    key={type}
                    onClick={() => setSourceType(type)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${sourceType === type ? 'border-primary bg-primary/5 text-primary' : 'border-border hover:bg-accent'}`}
                  >
                    {type === 'file' ? <Upload className="w-4 h-4" /> : <Type className="w-4 h-4" />}
                    {type === 'file' ? '上传文档' : '文本输入'}
                  </button>
                ))}
              </div>

              {sourceType === 'file' ? (
                <FileUploadZone />
              ) : (
                <textarea
                  className="w-full h-32 p-3 text-sm border rounded-lg bg-background resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="请输入需求描述、功能说明、API 文档等内容..."
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                />
              )}
            </CardContent>
          </Card>

          {/* 提示词配置 */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">配置提示词</CardTitle>
              <CardDescription>自定义 AI 生成用例的方向和格式要求</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                <label className="text-sm text-muted-foreground whitespace-nowrap">插入平台模板</label>
                <select
                  className="flex-1 h-10 px-3 rounded-md border border-input bg-background text-sm min-w-0"
                  value={selectedTemplateId ?? ''}
                  onChange={(e) => {
                    const id = e.target.value
                    if (!id) {
                      setSelectedTemplateId(null)
                      return
                    }
                    const t = templateOptions.find((x) => x.id === id)
                    if (t) {
                      setSelectedTemplateId(id)
                      setCustomPrompt(t.content)
                      pushRecentTemplateId(id)
                      setRecentTplIds(loadRecentTemplateIds())
                      toast.success(`已载入模板：${t.name}`)
                    }
                  }}
                >
                  <option value="">— 不关联模板（不累计使用次数）—</option>
                  {templateOptions.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                {selectedTemplateId && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-xs shrink-0"
                    onClick={() => setSelectedTemplateId(null)}
                  >
                    清除模板关联
                  </Button>
                )}
              </div>
              {recentTplIds.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  <span className="text-xs text-muted-foreground">最近：</span>
                  {recentTplIds
                    .map((id) => templateOptions.find((t) => t.id === id))
                    .filter(Boolean)
                    .slice(0, 6)
                    .map((t) => (
                      <Button
                        key={(t as PromptTemplate).id}
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => {
                          const tpl = t as PromptTemplate
                          setSelectedTemplateId(tpl.id)
                          setCustomPrompt(tpl.content)
                          pushRecentTemplateId(tpl.id)
                          setRecentTplIds(loadRecentTemplateIds())
                          toast.success(`已载入模板：${tpl.name}`)
                        }}
                      >
                        {(t as PromptTemplate).name}
                      </Button>
                    ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                从下拉选择或从「模板管理」点击「去生成」会带上模板 ID，生成成功后「使用次数」+1。
              </p>
              <textarea
                className="w-full h-28 p-3 text-sm border rounded-lg bg-background resize-none focus:outline-none focus:ring-2 focus:ring-ring select-text"
                placeholder="例如：请根据以上需求生成完整的功能测试用例，包含正向、逆向和边界测试，优先级分 P0-P3 四级..."
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
              />

              {/* AI 参数 */}
              <div className="flex items-center gap-6 text-sm">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={aiParams.stream}
                    onChange={(e) => setAiParams({ stream: e.target.checked })}
                    className="rounded"
                  />
                  流式输出
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">最大 Token：</span>
                  <select
                    value={aiParams.maxTokens}
                    onChange={(e) => setAiParams({ maxTokens: Number(e.target.value) })}
                    className="border rounded px-2 py-1 bg-background text-xs"
                  >
                    {[2048, 4096, 8192, 16384].map((v) => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                  </select>
                </div>
              </div>

              <Button className="w-full gap-2" onClick={handleGenerate} disabled={isGenerating}>
                <Wand2 className="w-4 h-4" />
                开始生成
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 生成中（流式输出） */}
      {currentStep === 'generating' && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
              <CardTitle className="text-base">AI 正在生成中...</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <pre className="text-xs bg-muted p-4 rounded-lg max-h-96 overflow-y-auto whitespace-pre-wrap font-mono">
              {streamContent || '等待 AI 响应...'}
            </pre>
          </CardContent>
        </Card>
      )}

      {/* 生成结果 */}
      {currentStep === 'result' && (
        <Card>
          <CardContent className="p-6">
            <GenerateResult cases={generatedCases} />
          </CardContent>
        </Card>
      )}
    </div>
  )
}
