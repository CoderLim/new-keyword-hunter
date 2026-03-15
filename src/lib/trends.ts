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

  let cleaned = data.trim()

  // Google Trends 常见 XSSI 前缀：)]}', 或 )]}',\n
  cleaned = cleaned.replace(/^\)\]\}',?\s*/, "")

  // 兜底：有时会出现注释前缀
  cleaned = cleaned.replace(/^\/\*+\s*/, "")
  cleaned = cleaned.replace(/^\/\/+\s*/, "")

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
  const resolvedGeo = geo === undefined ? "CN" : geo
  const params = new URLSearchParams({
    hl,
    tz: tz.toString(),
    date: timeRange,
    geo: resolvedGeo,
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
  const resolvedGeo = geo === undefined ? "CN" : geo
  const params = new URLSearchParams({
    hl,
    tz: tz.toString(),
    date: timeRange,
    geo: resolvedGeo,
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

function parseRequestParam(urlObj: URL): Record<string, unknown> | null {
  const req = urlObj.searchParams.get("req")

  if (!req) {
    return null
  }

  try {
    return JSON.parse(req)
  } catch {
    try {
      return JSON.parse(decodeURIComponent(req))
    } catch {
      return null
    }
  }
}

function extractKeywordFromReqData(reqData: Record<string, unknown>): string | null {
  const comparisonItem = (reqData.comparisonItem as Record<string, unknown>[] | undefined)?.[0]

  if (typeof comparisonItem?.keyword === "string") {
    return comparisonItem.keyword
  }

  const fromComparisonRestriction =
    (comparisonItem?.complexKeywordsRestriction as { keyword?: Array<{ value?: string }> } | undefined)
      ?.keyword?.[0]?.value

  if (typeof fromComparisonRestriction === "string") {
    return fromComparisonRestriction
  }

  const fromRestriction =
    (reqData.restriction as {
      complexKeywordsRestriction?: { keyword?: Array<{ value?: string }> }
    } | undefined)?.complexKeywordsRestriction?.keyword?.[0]?.value

  if (typeof fromRestriction === "string") {
    return fromRestriction
  }

  return null
}

/**
 * 从 URL 中提取关键词
 */
export function extractKeywordFromUrl(url: string): string | null {
  try {
    const urlObj = new URL(url)
    const q = urlObj.searchParams.get("q")

    if (q) {
      return decodeURIComponent(q)
    }

    const reqData = parseRequestParam(urlObj)
    if (reqData) {
      return extractKeywordFromReqData(reqData)
    }

    return null
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
    const date = urlObj.searchParams.get("date")

    if (date) {
      return date
    }

    const reqData = parseRequestParam(urlObj)
    if (!reqData) {
      return "today 12-m"
    }

    const comparisonItem = (reqData.comparisonItem as Record<string, unknown>[] | undefined)?.[0]

    if (typeof reqData.time === "string") {
      return reqData.time
    }

    if (typeof comparisonItem?.time === "string") {
      return comparisonItem.time
    }

    return "today 12-m"
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
    const geo = urlObj.searchParams.get("geo")

    if (geo) {
      return geo
    }

    const reqData = parseRequestParam(urlObj)
    if (!reqData) {
      return "CN"
    }

    const comparisonItem = (reqData.comparisonItem as Record<string, unknown>[] | undefined)?.[0]

    if (typeof comparisonItem?.geo === "string" && comparisonItem.geo) {
      return comparisonItem.geo
    }

    const country = (comparisonItem?.geo as { country?: string } | undefined)
      ?.country

    if (typeof country === "string" && country) {
      return country
    }

    const restrictionCountry = (reqData.restriction as {
      geo?: { country?: string }
    } | undefined)?.geo?.country

    if (typeof restrictionCountry === "string" && restrictionCountry) {
      return restrictionCountry
    }

    return "CN"
  } catch {
    return "CN"
  }
}
