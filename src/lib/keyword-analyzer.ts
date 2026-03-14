import type {
  TimelinePoint,
  KeywordData,
  AnalysisResult
} from "../types"

/**
 * 解析时间线数据 (从 JSON 响应)
 * Google Trends API 返回的是 JSON，需要先提取 timelineData
 */
export function parseTimelineResponse(
  jsonResponse: string,
  timeRange: string = "today 12-m"
): TimelinePoint[] {
  if (!jsonResponse) {
    return []
  }

  try {
    // 移除可能的特殊前缀
    let cleaned = jsonResponse
    const prefixes = [")]}'", ")]}'\n", ")]}'\\n", "//", "/*"]
    for (const prefix of prefixes) {
      if (cleaned.startsWith(prefix)) {
        cleaned = cleaned.slice(prefix.length)
        break
      }
    }

    const data = JSON.parse(cleaned)
    const timelineData = data.default?.timelineData

    if (!Array.isArray(timelineData) || timelineData.length === 0) {
      return []
    }

    // 转换为 "时间,值" 格式
    const formattedData = timelineData
      .map((item: { time: string; formattedValue: string }) => {
        const value = item.formattedValue || "0"
        const numValue = value.includes("<1") ? "0" : value
        return `${item.time},${numValue}`
      })
      .join("\n")

    return parseTimelineData(formattedData, timeRange)
  } catch (error) {
    console.error("解析时间线 JSON 失败:", error)
    return []
  }
}

/**
 * 解析时间线数据
 * Google Trends 返回的数据格式: "时间1,值1\n时间2,值2..."
 */
export function parseTimelineData(
  timelineData: string,
  timeRange: string = "today 12-m"
): TimelinePoint[] {
  if (!timelineData) {
    return []
  }

  const lines = timelineData.trim().split("\n")
  const points: TimelinePoint[] = []

  for (const line of lines) {
    const parts = line.split(",")
    if (parts.length >= 2) {
      const time = parts[0]
      const rawValue = parts[1]

      // 处理各种可能的值格式
      let value = 0
      if (rawValue === "0" || rawValue === "") {
        value = 0
      } else if (rawValue.includes("<1")) {
        value = 0
      } else {
        value = parseInt(rawValue, 10) || 0
      }

      points.push({
        time,
        value,
        formattedValue: value === 0 ? "0" : value.toString(),
        hasData: rawValue !== "" && rawValue !== "0",
        isZero: value === 0
      })
    }
  }

  return points
}

/**
 * 判断是否为有效新词
 * 规则:
 * 1. 前 N 个时间点的搜索量都为 0 (根据时间范围确定)
 * 2. 后期有增长趋势 (最后几个点的平均值 >= 阈值)
 */
export function isNewWordEffective(
  timeline: TimelinePoint[],
  threshold: number = 10,
  timeRange: string = "today 12-m"
): boolean {
  if (timeline.length < 6) {
    return false
  }

  // 根据时间范围确定检查前几个点
  const checkFirstPoints = Math.min(5, Math.floor(timeline.length / 3))

  // 检查前 N 个点是否都为 0
  const firstPoints = timeline.slice(0, checkFirstPoints)
  const allFirstZero = firstPoints.every((p) => p.isZero)

  if (!allFirstZero) {
    return false
  }

  // 检查最后几个点的平均值
  const lastPoints = timeline.slice(-5)
  const avgLastValue =
    lastPoints.reduce((sum, p) => sum + p.value, 0) / lastPoints.length

  return avgLastValue >= threshold
}

/**
 * 分析关键词是否为新词
 */
export function analyzeKeyword(
  keyword: string,
  timelineData: string,
  threshold: number = 10,
  timeRange: string = "today 12-m"
): AnalysisResult {
  const timeline = parseTimelineData(timelineData, timeRange)

  if (timeline.length === 0) {
    return {
      keyword,
      isEffective: false,
      reason: "无时间线数据"
    }
  }

  const isEffective = isNewWordEffective(timeline, threshold, timeRange)

  const avgValue =
    timeline.reduce((sum, p) => sum + p.value, 0) / timeline.length

  return {
    keyword,
    isEffective,
    reason: isEffective
      ? `前5个点为0, 后期平均值为${avgValue.toFixed(1)}`
      : `前期有搜索量或后期增长不足 (平均值: ${avgValue.toFixed(1)})`,
    timeline,
    avgValue
  }
}

/**
 * 从多线数据中提取关键词数据
 */
export function extractKeywordDataFromMultiLine(
  widgetData: Record<string, unknown>,
  keyword: string
): KeywordData | null {
  try {
    const timelineData = widgetData["timelineData"] as string
    if (!timelineData) {
      return null
    }

    const timeline = parseTimelineData(timelineData)

    const avgValue =
      timeline.reduce((sum, p) => sum + p.value, 0) / timeline.length
    const maxRisingValue = Math.max(...timeline.map((p) => p.value))
    const lastValue = timeline[timeline.length - 1]?.value || 0

    return {
      keyword,
      timeline,
      avgValue,
      maxRisingValue,
      lastValue
    }
  } catch (error) {
    console.error("提取关键词数据失败:", error)
    return null
  }
}

/**
 * 计算关键词优先级 (用于队列排序)
 * 返回值越大，优先级越高
 */
export function calculateKeywordPriority(
  keywordData: KeywordData
): number {
  const { avgValue, maxRisingValue, lastValue } = keywordData

  // 综合考虑平均值的增长趋势和最新值
  const growthScore = maxRisingValue - avgValue
  const recencyScore = lastValue * 1.5

  return growthScore + recencyScore
}

/**
 * 过滤低价值关键词
 */
export function filterLowValueKeywords(
  keywords: string[],
  minLength: number = 2
): string[] {
  return keywords.filter((kw) => {
    // 过滤太短的词
    if (kw.length < minLength) {
      return false
    }
    // 过滤纯数字
    if (/^\d+$/.test(kw)) {
      return false
    }
    // 过滤特殊字符过多的词
    if (/[^\w\s\u4e00-\u9fa5]/.test(kw)) {
      return false
    }
    return true
  })
}

/**
 * 对关键词进行排序
 * 按照优先级从高到低排序
 */
export function sortKeywordsByPriority(
  keywordsData: KeywordData[]
): KeywordData[] {
  return [...keywordsData].sort((a, b) => {
    const priorityA = calculateKeywordPriority(a)
    const priorityB = calculateKeywordPriority(b)
    return priorityB - priorityA
  })
}
