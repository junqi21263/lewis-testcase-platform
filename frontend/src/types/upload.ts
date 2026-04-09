// ==================== 多文件上传与解析模块 类型定义 ====================

/** 单个上传任务的状态机 */
export type UploadTaskStatus =
  | 'idle'        // 初始化，等待上传
  | 'uploading'   // 上传中
  | 'paused'      // 已暂停
  | 'parsing'     // 服务端解析中
  | 'parsed'      // 解析成功
  | 'error'       // 失败

/** 支持的文件类型扩展名 */
export type SupportedExtension =
  | 'doc' | 'docx'
  | 'pdf'
  | 'txt' | 'md'
  | 'xlsx'
  | 'json'
  | 'yaml' | 'yml'
  | 'png' | 'jpg' | 'jpeg'

/** 文件解析后提取出的单条需求点 */
export interface RequirementPoint {
  /** 唯一标识，前端生成 */
  id: string
  /** 需求内容文本 */
  content: string
  /** 用户是否已编辑过（区分原始 vs 修改后） */
  edited: boolean
  /** 原始内容（编辑后用于回撤） */
  originalContent: string
  /** 所在来源文件名 */
  sourceFile: string
}

/** 检测到的敏感信息片段 */
export interface SensitiveMatch {
  /** 敏感类型描述 */
  type: '手机号' | '身份证' | '银行卡' | '邮箱' | 'IP地址' | 'API密钥' | '密码字段'
  /** 命中的原始文字 */
  raw: string
  /** 脱敏后的替换文字 */
  masked: string
  /** 在 parsedText 中的起始位置（用于高亮） */
  index: number
  length: number
}

/** 单个上传文件的完整状态 */
export interface UploadTask {
  /** 浏览器本地唯一 id（用 crypto.randomUUID） */
  id: string
  /** 原始 File 对象 */
  file: File
  /** 上传进度 0-100 */
  progress: number
  /** 当前状态 */
  status: UploadTaskStatus
  /** 错误信息（status === 'error' 时存在） */
  errorMessage?: string
  /** 上传成功后，服务端返回的文件 id */
  serverFileId?: string
  /** 服务端解析后的原始文本 */
  parsedText?: string
  /** 从 parsedText 中提取的需求点列表 */
  requirementPoints: RequirementPoint[]
  /** 检测到的敏感信息列表 */
  sensitiveMatches: SensitiveMatch[]
  /** 脱敏后的文本（替换敏感信息后） */
  maskedText?: string
  /** 上传取消函数（axios AbortController） */
  abortFn?: () => void
  /** 轮询解析状态的定时器 id */
  pollingTimer?: ReturnType<typeof setInterval>
}

/** 上传面板的整体统计数据 */
export interface UploadStats {
  total: number
  uploading: number
  parsed: number
  error: number
}

/** 分片上传的分片信息（大文件 > CHUNK_THRESHOLD 时启用） */
export interface ChunkInfo {
  fileId: string      // 前端临时文件唯一 id
  chunkIndex: number
  chunkTotal: number
  chunkSize: number
  start: number
  end: number
}
