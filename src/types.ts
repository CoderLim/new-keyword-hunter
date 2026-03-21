/**
 * 时间点数据
 */
export interface TimelinePoint {
  time: string
  value: number
  formattedValue: string
  hasData: boolean
  isZero: boolean
}

/**
 * 关键词数据
 */
export interface KeywordData {
  keyword: string
  timeline: TimelinePoint[]
  avgValue: number
  maxRisingValue: number
  lastValue: number
}

/**
 * Google Trends Widget 数据结构
 */
export interface TrendsWidgetData {
  id: string
  title: string
  type: string
  data: Record<string, unknown>
}

/**
 * 相关查询项
 */
export interface RelatedQuery {
  query: string
  risingValue: number
  formattedValue: string
}

/**
 * 分析结果
 */
export interface AnalysisResult {
  keyword: string
  isEffective: boolean
  reason: string
  timeline?: TimelinePoint[]
  avgValue?: number
}

/**
 * 批量分析结果
 */
export interface BatchAnalysisResult {
  keyword: string
  isEffective: boolean
  score: number
  baseAvg: number
  candidateAvg: number
}

/**
 * 队列项（带深度跟踪）
 */
export interface QueueItem {
  keyword: string
  depth: number  // 0 = 种子词, 1 = 第一层, 2 = 第二层, 以此类推
}

export type CaptureEndType = "normal" | "abnormal"

/**
 * 暂停原因类型
 */
export type PauseReason = "manual" | "group_complete" | "max_depth" | "rate_limit"

/**
 * 捕获状态
 */
export interface CaptureState {
  isActive: boolean
  isPaused: boolean
  currentKeyword: string
  processedCount: number
  queueSize: number
  effectiveNewWordsCount: number
  currentGroupProgress: number      // 当前组已发起的请求数（不是关键词数）
  pauseReason?: PauseReason        // 暂停原因
  scheduledResumeTime?: number     // 定时恢复的时间戳
  statusMessage: string
  lastError?: string
  endType?: CaptureEndType
  endReason?: string
}

/**
 * 配置选项
 */
export interface CaptureOptions {
  baseKeyword: string
  seedKeywords: string[]
  timeRange: string
  threshold: number
  maxDepth: number              // 最大递归深度
  requestsPerGroup: number      // 每组请求次数（每次调用 processNextKeyword 算1次请求）
  groupRestMinutes: number      // 组间休息时间（分钟）
  relatedQueryLimit?: number
  geo?: string
}

export interface CaptureReport {
  timestamp: number
  baseKeyword: string
  seedKeywords: string[]
  totalProcessed: number
  effectiveNewWords: string[]
  endType: CaptureEndType
  endReason: string
  durationMs: number
}

/**
 * 历史记录
 */
export interface HistoryRecord {
  id: string
  timestamp: number
  baseKeyword: string
  seedKeywords: string[]
  totalProcessed: number
  effectiveNewWords: number
  duration: number
  endType?: CaptureEndType
  endReason?: string
  data?: {
    effectiveNewWords: string[]
    processedKeywords: string[]
  }
}

/**
 * 消息类型
 */
export type MessageType =
  | "START_CAPTURE"
  | "STOP_CAPTURE"
  | "PAUSE_CAPTURE"
  | "RESUME_CAPTURE"
  | "CAPTURE_STATUS"
  | "NEW_KEYWORDS"
  | "EFFECTIVE_WORD_FOUND"
  | "GET_STATUS"
  | "ADD_TO_QUEUE"
  | "PROCESS_KEYWORD"
  | "INTERCEPTED_RESPONSE"

/**
 * 消息结构
 */
export interface Message<T = unknown> {
  type: MessageType
  payload?: T
}

/**
 * 存储键
 */
export const StorageKeys = {
  EFFECTIVE_NEW_WORDS: "effectiveNewWords",
  PROCESSED_KEYWORDS: "processedKeywords",
  KEYWORDS_QUEUE: "keywordsQueue",
  HISTORY_RECORDS: "historyRecords",
  CAPTURE_STATE: "captureState",
  CAPTURE_OPTIONS: "captureOptions"
} as const
