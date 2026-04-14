import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { Upload, FileText, Type, Wand2, Loader2, ChevronRight, X, RefreshCw, PauseCircle, XCircle, Copy, Download } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useGenerateStore } from '@/store/generateStore'
import { filesApi } from '@/api/files'
import { aiApi } from '@/api/ai'
import { formatFileSize } from '@/utils/format'
import toast from 'react-hot-toast'
import type { TestCase, PromptTemplate, AIModel, TestCaseType } from '@/types'
import { recordsApi } from '@/api/records'
import { testcasesApi } from '@/api/testcases'
import { templatesApi } from '@/api/templates'

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
      toast.success('文件上传成功')
    } catch {
      toast.error('文件上传失败')
    } finally {
      setUploading(false)
    }
  }

  if (uploadedFile) {
    return (
      <div className="flex items-center gap-3 p-4 border rounded-lg bg-green-50 dark:bg-green-950/20">
        <FileText className="w-8 h-8 text-green-600 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate">{uploadedFile.originalName}</p>
          <p className="text-xs text-muted-foreground">{formatFileSize(uploadedFile.size)} · {uploadedFile.fileType}</p>
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
          <p className="text-xs text-muted-foreground mt-1">支持 PDF、Word、Excel、YAML、图片（OCR）</p>
        </>
      )}
    </div>
  )
}

/** 生成结果展示 */
function GenerateResult({ cases }: { cases: TestCase[] }) {
  const { reset, updateCaseLocal, qualityScore, qualitySuggestions } = useGenerateStore()
  const suiteId = cases[0]?.suiteId
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">生成完成</h3>
          <p className="text-sm text-muted-foreground">共生成 {cases.length} 条测试用例</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(JSON.stringify(cases, null, 2))
                toast.success('已复制用例 JSON')
              } catch {
                toast.error('复制失败，请检查浏览器权限')
              }
            }}
          >
            <Copy className="w-4 h-4" />
            复制
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1"
            disabled={!suiteId}
            onClick={async () => {
              if (!suiteId) return
              try {
                const url = testcasesApi.exportSuiteUrl(suiteId, 'EXCEL')
                window.open(url, '_blank', 'noopener,noreferrer')
              } catch {
                toast.error('导出失败')
              }
            }}
          >
            <Download className="w-4 h-4" />
            导出 Excel
          </Button>
          <Button variant="outline" size="sm" onClick={reset} className="gap-1">
            <RefreshCw className="w-4 h-4" /> 重新生成
          </Button>
        </div>
      </div>

      {(qualityScore != null || (qualitySuggestions && qualitySuggestions.trim())) && (
        <Card className="border">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">用例质量评分</span>
              {qualityScore != null && (
                <Badge variant="secondary" className="text-xs">
                  {qualityScore}/100
                </Badge>
              )}
            </div>
            {qualitySuggestions && (
              <pre className="text-xs bg-muted p-3 rounded whitespace-pre-wrap">{qualitySuggestions}</pre>
            )}
          </CardContent>
        </Card>
      )}

      <div className="max-h-[60vh] overflow-auto border rounded-lg">
        <table className="min-w-full text-xs">
          <thead className="sticky top-0 bg-background border-b">
            <tr className="text-left">
              <th className="p-2 w-16">优先级</th>
              <th className="p-2 w-24">类型</th>
              <th className="p-2 min-w-[240px]">标题</th>
              <th className="p-2 min-w-[220px]">前置条件</th>
              <th className="p-2 min-w-[320px]">步骤</th>
              <th className="p-2 min-w-[260px]">预期结果</th>
            </tr>
          </thead>
          <tbody>
            {cases.map((c) => (
              <tr key={c.id} className="border-b align-top">
                <td className="p-2">
                  <select
                    value={c.priority}
                    onChange={(e) => updateCaseLocal(c.id, { priority: e.target.value as any })}
                    className="border rounded px-2 py-1 bg-background"
                  >
                    {['P0', 'P1', 'P2', 'P3', 'P4'].map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="p-2">
                  <Badge variant="secondary" className="text-xs">
                    {c.type}
                  </Badge>
                </td>
                <td className="p-2">
                  <input
                    value={c.title}
                    onChange={(e) => updateCaseLocal(c.id, { title: e.target.value })}
                    className="w-full border rounded px-2 py-1 bg-background"
                  />
                </td>
                <td className="p-2">
                  <textarea
                    value={c.precondition || ''}
                    onChange={(e) => updateCaseLocal(c.id, { precondition: e.target.value })}
                    className="w-full border rounded px-2 py-1 bg-background min-h-12"
                  />
                </td>
                <td className="p-2">
                  <textarea
                    value={c.steps.map((s) => `${s.order}. ${s.action}`).join('\n')}
                    onChange={(e) => {
                      const lines = e.target.value.split('\n').map((t) => t.trim()).filter(Boolean)
                      updateCaseLocal(c.id, {
                        steps: lines.map((line, idx) => ({ order: idx + 1, action: line.replace(/^\d+\.\s*/, '') })),
                      } as any)
                    }}
                    className="w-full border rounded px-2 py-1 bg-background min-h-20"
                  />
                </td>
                <td className="p-2">
                  <textarea
                    value={c.expectedResult || ''}
                    onChange={(e) => updateCaseLocal(c.id, { expectedResult: e.target.value })}
                    className="w-full border rounded px-2 py-1 bg-background min-h-16"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function GeneratePage() {
  const {
    currentStep, setStep,
    sourceType, setSourceType,
    uploadedFile,
    inputText, setInputText,
    selectedTemplateId, setSelectedTemplateId,
    customPrompt, setCustomPrompt,
    userNotes, setUserNotes,
    generationOptions, setGenerationOptions,
    aiParams, setAiParams,
    generatedCases, setGeneratedCases,
    isGenerating, setIsGenerating,
    streamContent, appendStreamContent, clearStreamContent,
    setQualityMeta,
    setLastRecordId,
  } = useGenerateStore()

  const streamAbortRef = useRef<AbortController | null>(null)
  const [templates, setTemplates] = useState<PromptTemplate[]>([])
  const [models, setModels] = useState<AIModel[]>([])
  const [loadingTemplates, setLoadingTemplates] = useState(false)
  const [loadingModels, setLoadingModels] = useState(false)

  const templateCategory = useMemo(() => {
    if (generationOptions.testType === 'API') return 'API'
    if (generationOptions.testType === 'UI') return 'UI'
    if (generationOptions.testType === 'SECURITY') return 'SECURITY'
    if (generationOptions.testType === 'PERFORMANCE') return 'PERFORMANCE'
    return 'FUNCTIONAL'
  }, [generationOptions.testType])

  const filteredTemplates = useMemo(() => {
    const list = templates.filter((t) => t.isPublic || t.creatorId)
    return list.filter((t) => t.category === templateCategory || t.category === 'CUSTOM')
  }, [templates, templateCategory])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoadingTemplates(true)
      try {
        const res = await templatesApi.getTemplates({ page: 1, pageSize: 200 })
        if (!cancelled) setTemplates(res.list)
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLoadingTemplates(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoadingModels(true)
      try {
        const res = await aiApi.getModels()
        if (!cancelled) setModels(res)
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLoadingModels(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const sceneSum = generationOptions.sceneNormal + generationOptions.sceneAbnormal + generationOptions.sceneBoundary
  const adjustScenes = (key: 'sceneNormal' | 'sceneAbnormal' | 'sceneBoundary', value: number) => {
    const v = Math.max(0, Math.min(100, Math.round(value)))
    const next = { ...generationOptions, [key]: v } as any
    const keys = ['sceneNormal', 'sceneAbnormal', 'sceneBoundary'] as const
    const other = keys.filter((k) => k !== key)
    const sum = (next.sceneNormal as number) + (next.sceneAbnormal as number) + (next.sceneBoundary as number)
    if (sum === 100) {
      setGenerationOptions(next)
      return
    }
    // 将差值补到 boundary 优先，其次 abnormal
    let diff = 100 - sum
    for (const k of other) {
      if (diff === 0) break
      const cur = next[k] as number
      const newVal = Math.max(0, Math.min(100, cur + diff))
      diff -= newVal - cur
      next[k] = newVal
    }
    setGenerationOptions(next)
  }

  const handleGenerate = async () => {
    if (sourceType === 'file' && !uploadedFile) {
      toast.error('请先上传文件')
      return
    }
    if (sourceType === 'text' && !inputText.trim()) {
      toast.error('请输入需求文本')
      return
    }
    if (sceneSum !== 100) {
      toast.error('场景占比需合计 100%（正常/异常/边界）')
      return
    }
    if (!customPrompt.trim() && !selectedTemplateId) {
      toast.error('请选择提示词模板或输入自定义 Prompt')
      return
    }

    setIsGenerating(true)
    clearStreamContent()
    setStep('generating')

    try {
      if (aiParams.stream) {
        streamAbortRef.current?.abort()
        const controller = new AbortController()
        streamAbortRef.current = controller
        // 流式生成
        await aiApi.generateStream(
          {
            sourceType,
            fileId: uploadedFile?.id,
            text: inputText,
            templateId: selectedTemplateId || undefined,
            customPrompt: customPrompt || undefined,
            userNotes: userNotes || undefined,
            outputLanguage: '中文',
            generationOptions,
            modelConfigId: aiParams.modelId,
            ...aiParams,
          },
          (chunk) => appendStreamContent(chunk),
          (meta) => {
            setIsGenerating(false)
            if (meta?.recordId) setLastRecordId(meta.recordId)
            // 优先从后端记录拿 suiteId 并拉取结构化用例（避免流式 JSON 半截解析失败）
            ;(async () => {
              try {
                if (meta?.recordId) {
                  const record = await recordsApi.getRecordById(meta.recordId)
                  if (record.suiteId) {
                    const list = await testcasesApi.getCasesBySuiteId(record.suiteId)
                    setGeneratedCases(list)
                  }
                }
              } catch {
                // ignore
              }
            })()
            const q = meta?.quality as any
            const score = typeof q?.score === 'number' ? q.score : null
            const sugg = Array.isArray(q?.suggestions) ? q.suggestions.join('\n') : null
            if (score != null || sugg) setQualityMeta(score, sugg)
            setStep('result')
            toast.success('用例生成完成！')
          },
          (err) => {
            setIsGenerating(false)
            if ((err as { name?: string }).name === 'AbortError') {
              toast('已暂停生成，可继续调整参数后重新生成')
              setStep('prompt')
              return
            }
            toast.error(`生成失败: ${err.message}`)
            setStep('prompt')
          },
          controller.signal,
        )
      } else {
        // 非流式
        const result = await aiApi.generateTestCases({
          sourceType,
          fileId: uploadedFile?.id,
          text: inputText,
          templateId: selectedTemplateId || undefined,
          customPrompt: customPrompt || undefined,
          userNotes: userNotes || undefined,
          outputLanguage: '中文',
          generationOptions,
          modelConfigId: aiParams.modelId,
          ...aiParams,
        })
        setGeneratedCases(result.cases)
        setLastRecordId(result.recordId)
        if ('qualityScore' in result || 'qualitySuggestions' in result) {
          setQualityMeta((result as any).qualityScore ?? null, (result as any).qualitySuggestions ?? null)
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
              <CardTitle className="text-base">生成参数配置</CardTitle>
              <CardDescription>选择测试类型、用例粒度、覆盖比例、模型与提示词模板</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* 测试类型 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">测试类型</label>
                  <select
                    value={generationOptions.testType}
                    onChange={(e) => setGenerationOptions({ testType: e.target.value as TestCaseType })}
                    className="w-full border rounded px-3 py-2 bg-background text-sm"
                  >
                    <option value="FUNCTIONAL">功能测试</option>
                    <option value="API">接口测试</option>
                    <option value="AUTOMATION">自动化脚本</option>
                    <option value="PERFORMANCE">性能测试</option>
                    <option value="SECURITY">安全测试</option>
                    <option value="UI">UI 测试</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">用例粒度</label>
                  <div className="flex items-center gap-4 text-sm">
                    {[
                      { v: 'OUTLINE', t: '大纲级' },
                      { v: 'CONCISE', t: '精简级' },
                      { v: 'DETAILED', t: '详细级' },
                    ].map((it) => (
                      <label key={it.v} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="granularity"
                          checked={generationOptions.granularity === it.v}
                          onChange={() => setGenerationOptions({ granularity: it.v })}
                        />
                        {it.t}
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              {/* 场景覆盖 */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">场景覆盖比例（合计需 100%）</label>
                  <span className={`text-xs ${sceneSum === 100 ? 'text-muted-foreground' : 'text-destructive'}`}>
                    当前合计：{sceneSum}%
                  </span>
                </div>
                {([
                  { k: 'sceneNormal', label: '正常', v: generationOptions.sceneNormal },
                  { k: 'sceneAbnormal', label: '异常', v: generationOptions.sceneAbnormal },
                  { k: 'sceneBoundary', label: '边界', v: generationOptions.sceneBoundary },
                ] as const).map((it) => (
                  <div key={it.k} className="flex items-center gap-3">
                    <span className="w-10 text-xs text-muted-foreground">{it.label}</span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={it.v}
                      onChange={(e) => adjustScenes(it.k, Number(e.target.value))}
                      className="flex-1"
                    />
                    <span className="w-12 text-right text-xs">{it.v}%</span>
                  </div>
                ))}
              </div>

              {/* 优先级规则 */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">优先级规则（P0-P4）</label>
                <textarea
                  className="w-full h-20 p-3 text-sm border rounded-lg bg-background resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                  value={generationOptions.priorityRule}
                  onChange={(e) => setGenerationOptions({ priorityRule: e.target.value })}
                  placeholder="例如：关键链路 P0；核心功能 P1；常用功能 P2；低频功能 P3；边缘体验/文案 P4"
                />
              </div>

              {/* 模型参数 */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">模型</label>
                  <select
                    value={aiParams.modelId || ''}
                    onChange={(e) => setAiParams({ modelId: e.target.value || undefined })}
                    className="w-full border rounded px-3 py-2 bg-background text-sm"
                    disabled={loadingModels}
                  >
                    <option value="">{loadingModels ? '加载中...' : '默认模型'}</option>
                    {models.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                        {m.isDefault ? '（默认）' : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">温度</label>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={aiParams.temperature ?? 0.7}
                    onChange={(e) => setAiParams({ temperature: Number(e.target.value) })}
                    className="w-full"
                  />
                  <div className="text-xs text-muted-foreground">当前：{(aiParams.temperature ?? 0.7).toFixed(2)}</div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">最大 Token</label>
                  <select
                    value={aiParams.maxTokens}
                    onChange={(e) => setAiParams({ maxTokens: Number(e.target.value) })}
                    className="w-full border rounded px-3 py-2 bg-background text-sm"
                  >
                    {[2048, 4096, 8192, 16384].map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* 模板选择 */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">提示词模板</label>
                  <span className="text-xs text-muted-foreground">
                    分类：{templateCategory}
                  </span>
                </div>
                <select
                  value={selectedTemplateId || ''}
                  onChange={(e) => {
                    const id = e.target.value || null
                    setSelectedTemplateId(id)
                    if (!id) return
                    const tpl = templates.find((t) => t.id === id)
                    if (tpl) setCustomPrompt(tpl.content)
                  }}
                  className="w-full border rounded px-3 py-2 bg-background text-sm"
                  disabled={loadingTemplates}
                >
                  <option value="">{loadingTemplates ? '加载中...' : '（不选模板，使用自定义 Prompt）'}</option>
                  {filteredTemplates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Prompt 编辑 */}
              <textarea
                className="w-full h-28 p-3 text-sm border rounded-lg bg-background resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="例如：请根据以上需求生成完整的功能测试用例，包含正向、逆向和边界测试，优先级分 P0-P3 四级..."
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
              />

              <textarea
                className="w-full h-20 p-3 text-sm border rounded-lg bg-background resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="补充说明：业务背景、系统约束、特别关注点（可选）"
                value={userNotes}
                onChange={(e) => setUserNotes(e.target.value)}
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
                <span className="text-xs text-muted-foreground">提示：模板会在后端做变量替换与落库</span>
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
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
                <CardTitle className="text-base">AI 正在生成中...</CardTitle>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => streamAbortRef.current?.abort()}
                  disabled={!isGenerating}
                  className="gap-1"
                >
                  <PauseCircle className="w-4 h-4" />
                  暂停
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    streamAbortRef.current?.abort()
                    clearStreamContent()
                    setIsGenerating(false)
                    setStep('prompt')
                  }}
                  className="gap-1"
                >
                  <XCircle className="w-4 h-4" />
                  取消
                </Button>
              </div>
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
      {currentStep === 'result' && generatedCases.length > 0 && (
        <Card>
          <CardContent className="p-6">
            <GenerateResult cases={generatedCases} />
          </CardContent>
        </Card>
      )}
    </div>
  )
}
