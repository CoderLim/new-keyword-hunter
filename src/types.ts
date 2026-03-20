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

export type CaptureEndType = "normal" | "abnormal"

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
  currentDepth: number
  statusMessage: string
  maxKeywords?: number
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
  maxKeywords: number
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
