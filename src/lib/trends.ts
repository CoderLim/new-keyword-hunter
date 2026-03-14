/**
 * Google Trends 数据处理工具
 */

/**
 * 清理 Google Trends API 响应数据
 * Google Trends 返回的数据通常以特殊字符开头，需要移除
 */
export function cleanTrendsData(data: string): string {
  if (!data) {
    return ""
  }

  // 移除常见的特殊前缀
  const prefixes = [
    ")]}'",
    ")]}'\n",
    ")]}'\\n",
    "//",
    "/*",
    "/* "
  ]

  let cleaned = data
  for (const prefix of prefixes) {
    if (cleaned.startsWith(prefix)) {
      cleaned = cleaned.slice(prefix.length)
      break
    }
  }

  return cleaned.trim()
}

/**
 * 解析相关搜索 JSON 响应
 */
export function parseRelatedQueries(responseBody: string): {
  rising: string[]
  top: string[]
} {
  const cleaned = cleanTrendsData(responseBody)

  try {
    const data = JSON.parse(cleaned)
    const result = {
      rising: [] as string[],
      top: [] as string[]
    }

    // 解析 rising queries
    const risingWidget = data.default?.rankedList?.[0]
    if (risingWidget?.rankedKeyword) {
      result.rising = risingWidget.rankedKeyword
        .map((item: { query: string }) => item?.query)
        .filter(Boolean)
    }

    // 解析 top queries
    const topWidget = data.default?.rankedList?.[1]
    if (topWidget?.rankedKeyword) {
      result.top = topWidget.rankedKeyword
        .map((item: { query: string }) => item?.query)
        .filter(Boolean)
    }

    return result
  } catch (error) {
    console.error("解析相关搜索失败:", error)
    return { rising: [], top: [] }
  }
}

/**
 * 解析时间线数据响应
 */
export function parseTimelineData(responseBody: string): string | null {
  const cleaned = cleanTrendsData(responseBody)

  try {
    const data = JSON.parse(cleaned)
    const timelineData = data.default?.timelineData

    if (Array.isArray(timelineData) && timelineData.length > 0) {
      // 格式: "time,value\ntime2,value2..."
      return timelineData
        .map((item: { time: string; formattedValue: string }) => {
          const value = item.formattedValue || "0"
          // 处理 "<1" 的情况
          const numValue = value.includes("<1") ? "0" : value
          return `${item.time},${numValue}`
        })
        .join("\n")
    }

    return null
  } catch (error) {
    console.error("解析时间线数据失败:", error)
    return null
  }
}

/**
 * 构建 Google Trends URL
 */
export function buildTrendsUrl(
  keyword: string,
  options: {
    timeRange?: string
    geo?: string
    category?: number
  } = {}
): string {
  const params = new URLSearchParams({
    q: keyword,
    ...(options.timeRange && { date: options.timeRange }),
    ...(options.geo && { geo: options.geo }),
    ...(options.category && { cat: options.category.toString() })
  })

  return `https://trends.google.com/trends/explore?${params.toString()}`
}

/**
 * 构建相关搜索 API URL
 */
export function buildRelatedSearchesUrl(keyword: string, timeRange: string = "today 12-m", geo: string = ""): string {
  const hl = "zh-CN"
  const tz = 480
  const params = new URLSearchParams({
    hl,
    tz: tz.toString(),
    date: timeRange,
    geo: geo || "CN",
    gprop: "",
    q: keyword
  })

  return `https://trends.google.com/trends/api/widgetdata/relatedsearches?${params.toString()}`
}

/**
 * 构建时间线 API URL
 */
export function buildTimelineUrl(keyword: string, timeRange: string = "today 12-m", geo: string = ""): string {
  const hl = "zh-CN"
  const tz = 480
  const params = new URLSearchParams({
    hl,
    tz: tz.toString(),
    date: timeRange,
    geo: geo || "CN",
    q: keyword,
    // 设备类型: all (全部), web (桌面), searches (搜索)
    gprop: ""
  })

  return `https://trends.google.com/trends/api/widgetdata/multiline?${params.toString()}`
}

/**
 * 判断响应是否为相关搜索
 */
export function isRelatedSearchesRequest(url: string): boolean {
  return url.includes("/trends/api/widgetdata/relatedsearches")
}

/**
 * 判断响应是否为时间线数据
 */
export function isTimelineRequest(url: string): boolean {
  return url.includes("/trends/api/widgetdata/multiline")
}

/**
 * 从 URL 中提取关键词
 */
export function extractKeywordFromUrl(url: string): string | null {
  try {
    const urlObj = new URL(url)
    const q = urlObj.searchParams.get("q")
    return q ? decodeURIComponent(q) : null
  } catch {
    return null
  }
}

/**
 * 从 URL 中提取时间范围
 */
export function extractTimeRangeFromUrl(url: string): string {
  try {
    const urlObj = new URL(url)
    return urlObj.searchParams.get("date") || "today 12-m"
  } catch {
    return "today 12-m"
  }
}

/**
 * 从 URL 中提取地理位置
 */
export function extractGeoFromUrl(url: string): string {
  try {
    const urlObj = new URL(url)
    return urlObj.searchParams.get("geo") || "CN"
  } catch {
    return "CN"
  }
}
