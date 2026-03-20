import { KeywordStorage } from "~lib/storage"
import {
  isRelatedSearchesRequest,
  isTimelineRequest,
  parseRelatedQueries,
  extractKeywordFromUrl
} from "~lib/trends"
import {
  filterLowValueKeywords,
  parseTimelineResponse,
  parseTimelineSeriesValues,
  isNewWordEffective,
  isNewWordEffectiveByBase
} from "~lib/keyword-analyzer"
import type { CaptureState, CaptureOptions, Message, CaptureEndType } from "~types"

const recentInterceptSignatures = new Map<string, number>()
const timelineKeywordProcessedAt = new Map<string, number>()
let isProcessingNextKeyword = false
let emptyQueueRetryCount = 0
const MAX_EMPTY_QUEUE_RETRY = 4
let captureStartedAt = 0
let hasFinalizedCurrentRun = false
let isFinalizingCapture = false
let cachedIsPaused = false

function isDuplicateIntercept(url: string, responseBody: string): boolean {
  const now = Date.now()

  for (const [key, timestamp] of recentInterceptSignatures.entries()) {
    if (now - timestamp > 60000) {
      recentInterceptSignatures.delete(key)
    }
  }

  const signature = `${url}|${responseBody.length}|${responseBody.slice(0, 120)}`

  if (recentInterceptSignatures.has(signature)) {
    return true
  }

  recentInterceptSignatures.set(signature, now)
  return false
}

async function setupSidePanelBehavior() {
  if (!chrome.sidePanel?.setPanelBehavior) {
    return
  }

  try {
    await chrome.sidePanel.setPanelBehavior({
      openPanelOnActionClick: true
    })
  } catch (error) {
    console.error("设置侧边栏点击行为失败:", error)
  }
}

async function openSidePanelForTab(tab?: chrome.tabs.Tab) {
  if (!chrome.sidePanel?.open) {
    return
  }

  try {
    if (tab?.id && chrome.sidePanel.setOptions) {
      await chrome.sidePanel.setOptions({
        tabId: tab.id,
        path: "side-panel.html",
        enabled: true
      })
    }

    if (typeof tab?.windowId === "number") {
      await chrome.sidePanel.open({ windowId: tab.windowId })
    }
  } catch (error) {
    console.error("通过图标点击打开侧边栏失败:", error)
  }
}

chrome.runtime.onInstalled.addListener(() => {
  void setupSidePanelBehavior()
})

chrome.runtime.onStartup.addListener(() => {
  void setupSidePanelBehavior()
})

chrome.action.onClicked.addListener((tab) => {
  void openSidePanelForTab(tab)
})

void setupSidePanelBehavior()

/**
 * 发送状态更新
 */
async function sendStatusUpdate(state: Partial<CaptureState>) {
  chrome.runtime.sendMessage({
    type: "CAPTURE_STATUS",
    payload: state
  })
}

/**
 * 同步队列大小到状态
 */
async function syncQueueSize(): Promise<number> {
  const queue = await KeywordStorage.getKeywordsQueue()
  const queueSize = queue.length
  const state = await KeywordStorage.getCaptureState()
  const updatedState = { ...state, queueSize }
  await KeywordStorage.setCaptureState(updatedState)
  await sendStatusUpdate({ queueSize })
  return queueSize
}

async function finalizeCapture(endType: CaptureEndType, endReason: string) {
  if (hasFinalizedCurrentRun || isFinalizingCapture) {
    return
  }

  isFinalizingCapture = true

  try {
    const state = await KeywordStorage.getCaptureState()
    const options = await KeywordStorage.getCaptureOptions()

    if (!state.isActive || !options) {
      return
    }

    hasFinalizedCurrentRun = true

    const effectiveSet = await KeywordStorage.getEffectiveNewWords()
    const processedSet = await KeywordStorage.getProcessedKeywords()
    const queue = await KeywordStorage.getKeywordsQueue()

    const effectiveNewWords = [...effectiveSet]
    const processedKeywords = [...processedSet]

    const endedAt = Date.now()
    const durationMs = captureStartedAt > 0 ? Math.max(0, endedAt - captureStartedAt) : 0

    const statusMessage =
      endType === "normal"
        ? `挖掘完成：已处理 ${processedKeywords.length}，有效新词 ${effectiveNewWords.length}`
        : `异常终止：${endReason}`

    const finalState: CaptureState = {
      ...state,
      isActive: false,
      currentKeyword: "",
      queueSize: queue.length,
      effectiveNewWordsCount: effectiveNewWords.length,
      statusMessage,
      endType,
      endReason,
      ...(endType === "abnormal" ? { lastError: endReason } : { lastError: "" })
    }

    await KeywordStorage.setCaptureState(finalState)
    await sendStatusUpdate(finalState)

    await KeywordStorage.setLastCaptureReport({
      timestamp: endedAt,
      baseKeyword: options.baseKeyword,
      seedKeywords: options.seedKeywords,
      totalProcessed: processedKeywords.length,
      effectiveNewWords,
      endType,
      endReason,
      durationMs
    })

    await KeywordStorage.addHistoryRecord({
      id: endedAt.toString(),
      timestamp: endedAt,
      baseKeyword: options.baseKeyword,
      seedKeywords: options.seedKeywords,
      totalProcessed: processedKeywords.length,
      effectiveNewWords: effectiveNewWords.length,
      duration: Math.floor(durationMs / 1000),
      endType,
      endReason,
      data: {
        effectiveNewWords,
        processedKeywords
      }
    })
  } finally {
    isFinalizingCapture = false
  }
}

/**
 * 处理下一个关键词
 */
async function processNextKeyword(): Promise<boolean> {
  if (isProcessingNextKeyword) {
    return false
  }

  isProcessingNextKeyword = true

  try {
    const state = await KeywordStorage.getCaptureState()
    const options = await KeywordStorage.getCaptureOptions()

    if (!state.isActive || !options) {
      return false
    }

    // Check if paused (sync cache with persisted state)
    if (state.isPaused) {
      cachedIsPaused = true
      console.log("[NKH] 处理已暂停，跳过")
      return false
    }

    // 检查是否达到最大关键词数
    if (options.maxKeywords > 0 && state.processedCount >= options.maxKeywords) {
      await finalizeCapture("normal", "达到最大关键词数限制")
      return false
    }

    const nextKeyword = await KeywordStorage.getNextKeyword()
    console.log("[NKH] processNextKeyword", {
      nextKeyword,
      processedCount: state.processedCount,
      queueSize: state.queueSize
    })

    if (!nextKeyword) {
      // 队列为空，等待其他请求填充
      const queueSize = await syncQueueSize()

      if (queueSize > 0) {
        setTimeout(() => processNextKeyword(), 1500)
        return false
      }

      emptyQueueRetryCount += 1

      if (emptyQueueRetryCount >= MAX_EMPTY_QUEUE_RETRY) {
        await finalizeCapture("normal", "关键词队列处理完成")
        return false
      }

      await KeywordStorage.setCaptureState({
        ...state,
        queueSize,
        statusMessage: "等待新关键词...",
        currentKeyword: ""
      })
      await sendStatusUpdate({
        queueSize,
        statusMessage: "等待新关键词...",
        currentKeyword: ""
      })

      setTimeout(() => processNextKeyword(), 1500)
      return false
    }

    emptyQueueRetryCount = 0

    // 标记为已处理
    await KeywordStorage.addProcessedKeyword(nextKeyword)

    // 同步队列大小
    const queueSize = await syncQueueSize()

    // 更新状态
    const newState: CaptureState = {
      ...state,
      currentKeyword: nextKeyword,
      processedCount: state.processedCount + 1,
      queueSize,
      statusMessage: `正在处理: ${nextKeyword}`
    }
    await KeywordStorage.setCaptureState(newState)
    await sendStatusUpdate(newState)

    // 打开 Trends 页面
    const resolvedGeo = options.geo === undefined ? "CN" : options.geo
    const baseKeyword = options.baseKeyword.trim()
    const queryKeywords =
      baseKeyword && baseKeyword !== nextKeyword
        ? [baseKeyword, nextKeyword]
        : [nextKeyword]
    const encodedQueryKeywords = queryKeywords
      .map((keyword) => encodeURIComponent(keyword))
      .join(",")

    const url = `https://trends.google.com/trends/explore?q=${encodedQueryKeywords}&date=${encodeURIComponent(options.timeRange)}&geo=${encodeURIComponent(resolvedGeo)}`

    // 查找或创建 Trends 标签页
    const tabs = await chrome.tabs.query({ url: "*://trends.google.com/*" })
    let trendsTab = tabs.find((t) => t.url?.includes("trends.google.com"))

    if (trendsTab && trendsTab.id) {
      await chrome.tabs.update(trendsTab.id, {
        url,
        active: true
      })
      if (chrome.sidePanel?.setOptions) {
        await chrome.sidePanel.setOptions({
          tabId: trendsTab.id,
          path: "side-panel.html",
          enabled: true
        })
      }
      await openSidePanelForTab(trendsTab)
    } else {
      const created = await chrome.tabs.create({
        url,
        active: true
      })
      if (created.id && chrome.sidePanel?.setOptions) {
        await chrome.sidePanel.setOptions({
          tabId: created.id,
          path: "side-panel.html",
          enabled: true
        })
      }
      await openSidePanelForTab(created)
    }

    return true
  } finally {
    isProcessingNextKeyword = false
  }
}

/**
 * 开始捕获
 */
async function startCapture(options: CaptureOptions) {
  emptyQueueRetryCount = 0
  recentInterceptSignatures.clear()
  timelineKeywordProcessedAt.clear()
  hasFinalizedCurrentRun = false
  captureStartedAt = Date.now()
  cachedIsPaused = false

  // 初始化
  await KeywordStorage.clearAll()
  await KeywordStorage.setCaptureOptions(options)

  // 添加种子关键词到队列
  const filtered = filterLowValueKeywords(options.seedKeywords)
  await KeywordStorage.addToQueue(filtered)

  // 获取实际队列大小（因为 addToQueue 会去重和过滤）
  const actualQueueSize = (await KeywordStorage.getKeywordsQueue()).length

  const state: CaptureState = {
    isActive: true,
    isPaused: false,
    currentKeyword: "",
    processedCount: 0,
    queueSize: actualQueueSize,
    effectiveNewWordsCount: 0,
    currentDepth: 0,
    endReason: "",
    statusMessage: "准备开始...",
    maxKeywords: options.maxKeywords
  }

  await KeywordStorage.setCaptureState(state)

  // 开始处理
  setTimeout(() => processNextKeyword(), 500)
}

/**
 * 停止捕获
 */
async function stopCapture() {
  await finalizeCapture("abnormal", "手动停止")
}

/**
 * 暂停捕获 - 暂停处理但保留队列和状态
 */
async function pauseCapture() {
  const state = await KeywordStorage.getCaptureState()

  if (!state.isActive || state.isPaused) {
    return
  }

  const pausedState: CaptureState = {
    ...state,
    isPaused: true,
    statusMessage: "已暂停"
  }

  cachedIsPaused = true
  await KeywordStorage.setCaptureState(pausedState)
  await sendStatusUpdate(pausedState)

  console.log("[NKH] 捕获已暂停", {
    processedCount: state.processedCount,
    queueSize: state.queueSize
  })
}

/**
 * 恢复捕获 - 从暂停状态继续
 */
async function resumeCapture() {
  const state = await KeywordStorage.getCaptureState()

  if (!state.isActive || !state.isPaused) {
    return
  }

  const resumedState: CaptureState = {
    ...state,
    isPaused: false,
    statusMessage: "恢复处理中..."
  }

  cachedIsPaused = false
  await KeywordStorage.setCaptureState(resumedState)
  await sendStatusUpdate(resumedState)

  console.log("[NKH] 捕获已恢复", {
    processedCount: state.processedCount,
    queueSize: state.queueSize
  })

  setTimeout(() => processNextKeyword(), 500)
}

/**
 * 处理从 content script 接收的数据
 */
async function handleInterceptedData(url: string, responseBody: string) {
  const state = await KeywordStorage.getCaptureState()
  const options = await KeywordStorage.getCaptureOptions()

  if (!state.isActive || !options) {
    return
  }

  // Process intercepts for current keyword even when paused to avoid dropping in-flight responses
  // Only block new keyword processing in processNextKeyword()
  if (state.isPaused) {
    // Sync cache with persisted state (handles service worker restart)
    cachedIsPaused = state.isPaused

    const keyword = extractKeywordFromUrl(url) || state.currentKeyword?.trim()

    // Only process if this is for the current in-flight keyword
    if (keyword !== state.currentKeyword) {
      console.log("[NKH] 暂停中，忽略非当前关键词的拦截数据", { keyword, currentKeyword: state.currentKeyword })
      return
    }

    console.log("[NKH] 暂停中，但处理当前关键词的响应", { keyword })
  }

  if (isDuplicateIntercept(url, responseBody)) {
    return
  }

  const keyword = extractKeywordFromUrl(url) || state.currentKeyword?.trim()

  if (!keyword) {
    console.warn("[NKH] 无法从请求提取关键词", { url })
    return
  }

  console.log("[NKH] 收到拦截数据", {
    type: isRelatedSearchesRequest(url) ? "related" : isTimelineRequest(url) ? "timeline" : "other",
    keyword,
    url
  })

  // 处理相关搜索
  if (isRelatedSearchesRequest(url)) {
    const baseKeyword = options.baseKeyword.trim()

    if (baseKeyword && keyword === baseKeyword) {
      return
    }

    const { rising, top } = parseRelatedQueries(responseBody)

    // 合并 rising 和 top，去重
    const allQueries = [...new Set([...rising, ...top])]

    // 过滤低价值关键词
    const filtered = filterLowValueKeywords(allQueries)

    // 过滤掉当前关键词本身
    const others = filtered.filter((q) => q !== keyword && q !== baseKeyword)
    const relatedQueryLimit = options.relatedQueryLimit ?? 0
    const selectedCandidates =
      relatedQueryLimit > 0 ? others.slice(0, relatedQueryLimit) : others

    if (selectedCandidates.length > 0) {
      await KeywordStorage.addToQueue(selectedCandidates)
      console.log("[NKH] 追加关键词到队列", {
        currentKeyword: keyword,
        added: selectedCandidates.length,
        relatedQueryLimit
      })

      // 同步队列大小并更新状态
      const queueSize = await syncQueueSize()
      const updatedState = {
        ...state,
        queueSize,
        currentDepth: state.currentDepth + 1
      }
      await KeywordStorage.setCaptureState(updatedState)
      await sendStatusUpdate({
        queueSize,
        currentDepth: state.currentDepth + 1
      })
    }
  }

  // 处理时间线数据
  if (isTimelineRequest(url)) {
    const processingKeyword = state.currentKeyword?.trim() || keyword

    if (!processingKeyword) {
      return
    }

    const now = Date.now()
    const lastProcessedAt = timelineKeywordProcessedAt.get(processingKeyword) || 0

    if (now - lastProcessedAt < 3000) {
      return
    }

    timelineKeywordProcessedAt.set(processingKeyword, now)

    const baseKeyword = options.baseKeyword.trim()
    const timelineSeries = parseTimelineSeriesValues(responseBody)

    let timelinePoints = 0
    let isEffective = false

    if (baseKeyword && processingKeyword !== baseKeyword && timelineSeries.length >= 2) {
      const baseTimeline = timelineSeries[0]
      const candidateTimeline = timelineSeries[1]
      timelinePoints = candidateTimeline.length
      isEffective = isNewWordEffectiveByBase(
        candidateTimeline,
        baseTimeline,
        options.threshold
      )
    } else {
      const timeline = parseTimelineResponse(responseBody, options.timeRange)
      timelinePoints = timeline.length
      isEffective = isNewWordEffective(timeline, options.threshold, options.timeRange)
    }

    if (timelinePoints === 0) {
      // 处理下一个关键词
      setTimeout(() => processNextKeyword(), 2000)
      return
    }

    console.log("[NKH] 时间线分析完成", {
      keyword: processingKeyword,
      timelinePoints,
      isEffective
    })

    if (isEffective) {
      await KeywordStorage.addEffectiveNewWord(processingKeyword)

      // 发送消息到 side-panel
      chrome.runtime.sendMessage({
        type: "EFFECTIVE_WORD_FOUND",
        payload: { keyword: processingKeyword }
      })

      const effective = await KeywordStorage.getEffectiveNewWords()
      await sendStatusUpdate({
        effectiveNewWordsCount: effective.size
      })
    }

    // 处理下一个关键词
    setTimeout(() => processNextKeyword(), 2000)
  }
}

chrome.webRequest.onCompleted.addListener(
  (details) => {
    void (async () => {
      if (details.tabId < 0) {
        return
      }

      if (
        details.initiator &&
        details.initiator.startsWith(`chrome-extension://${chrome.runtime.id}`)
      ) {
        return
      }

      // Fast path: check cached pause flag first
      if (cachedIsPaused) {
        return
      }

      const state = await KeywordStorage.getCaptureState()
      if (!state.isActive || state.isPaused) {
        // Sync cache with persisted state (handles service worker restart)
        cachedIsPaused = state.isPaused
        return
      }

      const url = details.url
      if (!(isRelatedSearchesRequest(url) || isTimelineRequest(url))) {
        return
      }

      console.log("[NKH] webRequest 捕获到 Trends API", { url })

      try {
        const response = await fetch(url, {
          credentials: "include"
        })

        if (!response.ok) {
          return
        }

        const body = await response.text()
        await handleInterceptedData(url, body)
      } catch (error) {
        console.warn("[NKH] webRequest 回补响应失败", { url, error })
      }
    })()
  },
  {
    urls: ["*://trends.google.com/trends/api/widgetdata/*"]
  }
)

chrome.webRequest.onCompleted.addListener(
  (details) => {
    void (async () => {
      if (details.statusCode !== 429) {
        return
      }

      if (
        details.initiator &&
        details.initiator.startsWith(`chrome-extension://${chrome.runtime.id}`)
      ) {
        return
      }

      // Fast path: check cached pause flag first
      if (cachedIsPaused) {
        return
      }

      const state = await KeywordStorage.getCaptureState()
      if (!state.isActive || state.isPaused) {
        // Sync cache with persisted state (handles service worker restart)
        cachedIsPaused = state.isPaused
        return
      }

      console.error("[NKH] 命中 Google Trends 限频", {
        url: details.url,
        statusCode: details.statusCode
      })

      let endReason = "触发 Google Trends 限频（/api/explore 返回 429）"
      try {
        const urlObj = new URL(details.url)
        if (urlObj.pathname === "/trends/explore") {
          endReason = "触发 Google Trends 限频（/trends/explore 页面返回 429）"
        }
      } catch {
      }

      await finalizeCapture(
        "abnormal",
        endReason
      )
    })()
  },
  {
    urls: [
      "*://trends.google.com/trends/api/explore*",
      "*://trends.google.com/trends/explore*"
    ]
  }
)

/**
 * 监听消息
 */
chrome.runtime.onMessage.addListener((message: Message, sender, sendResponse) => {
  switch (message.type) {
    case "START_CAPTURE":
      startCapture(message.payload as CaptureOptions)
      sendResponse({ success: true })
      break

    case "STOP_CAPTURE":
      stopCapture()
      sendResponse({ success: true })
      break

    case "PAUSE_CAPTURE":
      pauseCapture()
      sendResponse({ success: true })
      break

    case "RESUME_CAPTURE":
      resumeCapture()
      sendResponse({ success: true })
      break

    case "GET_STATUS":
      KeywordStorage.getCaptureState().then((state) => {
        sendResponse(state)
      })
      return true // 异步响应

    case "INTERCEPTED_RESPONSE":
      // 从 content script 接收拦截的响应
      if (message.payload && typeof message.payload === "object") {
        const { url, body } = message.payload as { url: string; body: string }
        handleInterceptedData(url, body)
      }
      sendResponse({ success: true })
      break

    case "ADD_TO_QUEUE":
      if (message.payload && Array.isArray(message.payload)) {
        KeywordStorage.addToQueue(message.payload as string[]).then(() => {
          syncQueueSize()
        })
      }
      sendResponse({ success: true })
      break

    case "GET_EFFECTIVE_WORDS":
      KeywordStorage.getEffectiveNewWords().then((words) => {
        sendResponse({ words: [...words] })
      })
      return true

    case "EXPORT_DATA":
      KeywordStorage.exportData().then((data) => {
        sendResponse({ data })
      })
      return true
  }

  return false
})

console.log("新词挖掘助手 Background Script 已加载")
