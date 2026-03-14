import { Storage } from "@plasmohq/storage"
import { KeywordStorage } from "~lib/storage"
import {
  isRelatedSearchesRequest,
  isTimelineRequest,
  parseRelatedQueries,
  extractKeywordFromUrl,
  extractTimeRangeFromUrl,
  extractGeoFromUrl
} from "~lib/trends"
import { filterLowValueKeywords, parseTimelineResponse, isNewWordEffective } from "~lib/keyword-analyzer"
import type { CaptureState, CaptureOptions, Message } from "~types"

const storage = new Storage()

// 存储拦截的响应数据
const interceptedResponses = new Map<string, string>()

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

/**
 * 处理下一个关键词
 */
async function processNextKeyword(): Promise<boolean> {
  const state = await KeywordStorage.getCaptureState()
  const options = await KeywordStorage.getCaptureOptions()

  if (!state.isActive || !options) {
    return false
  }

  // 检查是否达到最大关键词数
  if (options.maxKeywords > 0 && state.processedCount >= options.maxKeywords) {
    await stopCapture()
    return false
  }

  const nextKeyword = await KeywordStorage.getNextKeyword()

  if (!nextKeyword) {
    // 队列为空，等待其他请求填充
    const queueSize = await syncQueueSize()
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
    return false
  }

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
  const url = `https://trends.google.com/trends/explore?q=${encodeURIComponent(nextKeyword)}&date=${encodeURIComponent(options.timeRange)}&geo=${options.geo || "CN"}`

  // 查找或创建 Trends 标签页
  const tabs = await chrome.tabs.query({ url: "*://trends.google.com/*" })
  let trendsTab = tabs.find((t) => t.url?.includes("trends.google.com"))

  if (trendsTab && trendsTab.id) {
    await chrome.tabs.update(trendsTab.id, { url })
  } else {
    await chrome.tabs.create({ url })
  }

  return true
}

/**
 * 开始捕获
 */
async function startCapture(options: CaptureOptions) {
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
    currentKeyword: "",
    processedCount: 0,
    queueSize: actualQueueSize,
    effectiveNewWordsCount: 0,
    currentDepth: 0,
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
  const state = await KeywordStorage.getCaptureState()
  state.isActive = false
  state.statusMessage = "已停止"
  await KeywordStorage.setCaptureState(state)

  await sendStatusUpdate({
    isActive: false,
    statusMessage: "已停止"
  })

  // 保存历史记录
  const options = await KeywordStorage.getCaptureOptions()
  if (options) {
    const effective = await KeywordStorage.getEffectiveNewWords()
    const processed = await KeywordStorage.getProcessedKeywords()

    await KeywordStorage.addHistoryRecord({
      id: Date.now().toString(),
      timestamp: Date.now(),
      baseKeyword: options.baseKeyword,
      seedKeywords: options.seedKeywords,
      totalProcessed: state.processedCount,
      effectiveNewWords: effective.size,
      duration: 0,
      data: {
        effectiveNewWords: [...effective],
        processedKeywords: [...processed]
      }
    })
  }
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

  const keyword = extractKeywordFromUrl(url)

  if (!keyword) {
    return
  }

  // 处理相关搜索
  if (isRelatedSearchesRequest(url)) {
    const { rising, top } = parseRelatedQueries(responseBody)

    // 合并 rising 和 top，去重
    const allQueries = [...new Set([...rising, ...top])]

    // 过滤低价值关键词
    const filtered = filterLowValueKeywords(allQueries)

    // 过滤掉当前关键词本身
    const others = filtered.filter((q) => q !== keyword)

    if (others.length > 0) {
      await KeywordStorage.addToQueue(others)

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
    // responseBody is the raw JSON string from Trends API
    const timeline = parseTimelineResponse(responseBody, options.timeRange)

    if (!timeline || timeline.length === 0) {
      // 处理下一个关键词
      setTimeout(() => processNextKeyword(), 2000)
      return
    }

    const isEffective = isNewWordEffective(timeline, options.threshold, options.timeRange)

    if (isEffective) {
      await KeywordStorage.addEffectiveNewWord(keyword)

      // 发送消息到 side-panel
      chrome.runtime.sendMessage({
        type: "EFFECTIVE_WORD_FOUND",
        payload: { keyword, timeline }
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
