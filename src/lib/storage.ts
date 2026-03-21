import { Storage } from "@plasmohq/storage"
import type {
  KeywordData,
  CaptureState,
  HistoryRecord,
  CaptureOptions,
  AnalysisResult,
  CaptureReport,
  QueueItem
} from "../types"

const storage = new Storage({
  area: "local"
})

/**
 * 存储操作类
 */
export class KeywordStorage {
  /**
   * 获取有效新词集合
   */
  static async getEffectiveNewWords(): Promise<Set<string>> {
    const data = await storage.getItem<string>("effectiveNewWords")
    if (!data) {
      return new Set()
    }
    try {
      return new Set(JSON.parse(data))
    } catch (error) {
      console.error("解析有效新词失败:", error)
      return new Set()
    }
  }

  /**
   * 设置有效新词集合
   */
  static async setEffectiveNewWords(words: Set<string>): Promise<void> {
    await storage.setItem("effectiveNewWords", JSON.stringify([...words]))
  }

  /**
   * 添加有效新词
   */
  static async addEffectiveNewWord(word: string): Promise<boolean> {
    const words = await this.getEffectiveNewWords()
    if (words.has(word)) {
      return false
    }
    words.add(word)
    await this.setEffectiveNewWords(words)
    return true
  }

  /**
   * 批量添加有效新词
   */
  static async addEffectiveNewWords(keywords: string[]): Promise<void> {
    const words = await this.getEffectiveNewWords()

    for (const keyword of keywords) {
      words.add(keyword)
    }

    await this.setEffectiveNewWords(words)
  }

  /**
   * 获取已处理关键词
   */
  static async getProcessedKeywords(): Promise<Set<string>> {
    const data = await storage.getItem<string>("processedKeywords")
    if (!data) {
      return new Set()
    }
    try {
      return new Set(JSON.parse(data))
    } catch (error) {
      console.error("解析已处理关键词失败:", error)
      return new Set()
    }
  }

  /**
   * 设置已处理关键词
   */
  static async setProcessedKeywords(words: Set<string>): Promise<void> {
    await storage.setItem("processedKeywords", JSON.stringify([...words]))
  }

  /**
   * 添加已处理关键词
   */
  static async addProcessedKeyword(word: string): Promise<boolean> {
    const words = await this.getProcessedKeywords()
    if (words.has(word)) {
      return false
    }
    words.add(word)
    await this.setProcessedKeywords(words)
    return true
  }

  /**
   * 批量添加已处理关键词
   */
  static async addProcessedKeywords(keywords: string[]): Promise<void> {
    const words = await this.getProcessedKeywords()

    for (const keyword of keywords) {
      words.add(keyword)
    }

    await this.setProcessedKeywords(words)
  }

  /**
   * 获取待处理队列
   */
  static async getKeywordsQueue(): Promise<QueueItem[]> {
    const data = await storage.getItem<string>("keywordsQueue")
    if (!data) {
      return []
    }
    try {
      const parsed = JSON.parse(data)
      // 处理旧格式数据迁移：string[] -> QueueItem[]
      if (Array.isArray(parsed) && parsed.length > 0) {
        if (typeof parsed[0] === "string") {
          console.log("[NKH] 检测到旧格式队列数据，自动迁移为新格式")
          return parsed.map(keyword => ({ keyword, depth: 0 }))
        }
      }
      return parsed as QueueItem[]
    } catch (error) {
      console.error("解析关键词队列失败:", error)
      return []
    }
  }

  /**
   * 设置待处理队列
   */
  static async setKeywordsQueue(queue: QueueItem[]): Promise<void> {
    await storage.setItem("keywordsQueue", JSON.stringify(queue))
  }

  /**
   * 添加关键词到队列（带深度信息）
   */
  static async addToQueue(items: Array<{keyword: string, depth: number}>): Promise<void> {
    const queue = await this.getKeywordsQueue()
    const processed = await this.getProcessedKeywords()
    const options = await this.getCaptureOptions()

    // 过滤：1) 已处理的关键词 2) 超过最大深度的关键词
    const newItems = items.filter(item => {
      if (processed.has(item.keyword)) return false
      if (options && item.depth >= options.maxDepth) {
        console.log("[NKH] 过滤超深度关键词", { keyword: item.keyword, depth: item.depth, maxDepth: options.maxDepth })
        return false
      }
      return true
    })

    // 按关键词去重（保留第一次出现的深度）
    const existingKeywords = new Set(queue.map(q => q.keyword))
    const uniqueNewItems = newItems.filter(item => !existingKeywords.has(item.keyword))

    await this.setKeywordsQueue([...queue, ...uniqueNewItems])
  }

  /**
   * 从队列取出下一个关键词
   */
  static async getNextKeyword(): Promise<QueueItem | null> {
    const queue = await this.getKeywordsQueue()
    if (queue.length === 0) {
      return null
    }
    const next = queue[0]
    const newQueue = queue.slice(1)
    await this.setKeywordsQueue(newQueue)
    return next
  }

  /**
   * 批量从队列取出关键词
   * @param batchSize 批量大小
   * @returns 出队的关键词数组（可能少于 batchSize）
   */
  static async getNextBatch(batchSize: number): Promise<QueueItem[]> {
    const queue = await this.getKeywordsQueue()
    if (queue.length === 0) {
      return []
    }

    const batch = queue.slice(0, batchSize)
    const newQueue = queue.slice(batchSize)
    await this.setKeywordsQueue(newQueue)

    return batch
  }

  /**
   * 获取历史记录
   */
  static async getHistoryRecords(): Promise<HistoryRecord[]> {
    const data = await storage.getItem<string>("historyRecords")
    if (!data) {
      return []
    }
    try {
      return JSON.parse(data)
    } catch (error) {
      console.error("解析历史记录失败:", error)
      return []
    }
  }

  /**
   * 添加历史记录
   */
  static async addHistoryRecord(record: HistoryRecord): Promise<void> {
    const records = await this.getHistoryRecords()
    records.unshift(record)
    // 只保留最近 100 条
    await storage.setItem(
      "historyRecords",
      JSON.stringify(records.slice(0, 100))
    )
  }

  /**
   * 删除历史记录
   */
  static async deleteHistoryRecord(id: string): Promise<void> {
    const records = await this.getHistoryRecords()
    const filtered = records.filter((r) => r.id !== id)
    await storage.setItem("historyRecords", JSON.stringify(filtered))
  }

  /**
   * 清空历史记录
   */
  static async clearHistoryRecords(): Promise<void> {
    await storage.setItem("historyRecords", JSON.stringify([]))
  }

  /**
   * 获取捕获状态
   */
  static async getCaptureState(): Promise<CaptureState> {
    const data = await storage.getItem<string>("captureState")
    if (!data) {
      return {
        isActive: false,
        isPaused: false,
        currentKeyword: "",
        processedCount: 0,
        queueSize: 0,
        effectiveNewWordsCount: 0,
        currentGroupProgress: 0,
        endReason: "",
        statusMessage: "未开始"
      }
    }
    try {
      const parsed = JSON.parse(data)
      return {
        isPaused: false,
        currentGroupProgress: 0,
        ...parsed
      }
    } catch (error) {
      console.error("解析捕获状态失败:", error)
      return {
        isActive: false,
        isPaused: false,
        currentKeyword: "",
        processedCount: 0,
        queueSize: 0,
        effectiveNewWordsCount: 0,
        currentGroupProgress: 0,
        endReason: "",
        statusMessage: "未开始"
      }
    }
  }

  /**
   * 设置捕获状态
   */
  static async setCaptureState(state: CaptureState): Promise<void> {
    await storage.setItem("captureState", JSON.stringify(state))
  }

  /**
   * 获取捕获配置
   */
  static async getCaptureOptions(): Promise<CaptureOptions | null> {
    const data = await storage.getItem<string>("captureOptions")
    if (!data) {
      return null
    }
    try {
      return JSON.parse(data)
    } catch (error) {
      console.error("解析捕获配置失败:", error)
      return null
    }
  }

  /**
   * 设置捕获配置
   */
  static async setCaptureOptions(options: CaptureOptions): Promise<void> {
    await storage.setItem("captureOptions", JSON.stringify(options))
  }

  static async getLastCaptureReport(): Promise<CaptureReport | null> {
    const data = await storage.getItem<string>("lastCaptureReport")
    if (!data) {
      return null
    }

    try {
      return JSON.parse(data)
    } catch (error) {
      console.error("解析任务报告失败:", error)
      return null
    }
  }

  static async setLastCaptureReport(report: CaptureReport | null): Promise<void> {
    await storage.setItem("lastCaptureReport", JSON.stringify(report))
  }

  /**
   * 清空所有数据
   */
  static async clearAll(): Promise<void> {
    await storage.setItem("effectiveNewWords", JSON.stringify([]))
    await storage.setItem("processedKeywords", JSON.stringify([]))
    await storage.setItem("keywordsQueue", JSON.stringify([]))
    await this.setLastCaptureReport(null)
  }

  /**
   * 导出数据
   */
  static async exportData(): Promise<{
    effectiveNewWords: string[]
    processedKeywords: string[]
    timestamp: number
    report: CaptureReport | null
  }> {
    const effective = await this.getEffectiveNewWords()
    const processed = await this.getProcessedKeywords()
    const report = await this.getLastCaptureReport()
    return {
      effectiveNewWords: [...effective],
      processedKeywords: [...processed],
      timestamp: Date.now(),
      report
    }
  }
}
