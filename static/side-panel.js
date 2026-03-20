// State
let state = {
  isActive: false,
  isPaused: false,
  currentKeyword: "",
  processedCount: 0,
  queueSize: 0,
  effectiveNewWordsCount: 0,
  currentDepth: 0,
  endReason: "",
  statusMessage: "未开始"
}
let showResultNotice = false

let effectiveWords = []

// DOM Elements
const inputSection = document.getElementById("inputSection")
const statusSection = document.getElementById("statusSection")
const startBtn = document.getElementById("startBtn")
const pauseBtn = document.getElementById("pauseBtn")
const resumeBtn = document.getElementById("resumeBtn")
const stopBtn = document.getElementById("stopBtn")
const exportBtn = document.getElementById("exportBtn")
const resultNoticeEl = document.getElementById("resultNotice")
const resultNoticeTextEl = document.getElementById("resultNoticeText")
const currentKeywordEl = document.getElementById("currentKeyword")
const processedCountEl = document.getElementById("processedCount")
const queueSizeEl = document.getElementById("queueSize")
const effectiveNewWordsCountEl = document.getElementById("effectiveNewWordsCount")
const currentDepthEl = document.getElementById("currentDepth")
const statusMessageEl = document.getElementById("statusMessage")
const endReasonEl = document.getElementById("endReason")
const statusBadgeEl = document.getElementById("statusBadge")
const wordsCountEl = document.getElementById("wordsCount")
const wordsListEl = document.getElementById("wordsList")
const searchInputEl = document.getElementById("searchInput")

// Initialize
function init() {
  loadState()
  setupEventListeners()
  setupMessageListener()
}

function setupEventListeners() {
  startBtn?.addEventListener("click", handleStart)
  pauseBtn?.addEventListener("click", handlePause)
  resumeBtn?.addEventListener("click", handleResume)
  stopBtn?.addEventListener("click", handleStop)
  exportBtn?.addEventListener("click", handleExport)
  searchInputEl?.addEventListener("input", renderWordsList)
}

function setupMessageListener() {
  chrome.runtime.onMessage.addListener((message) => {
    switch (message.type) {
      case "CAPTURE_STATUS":
        if (message.payload) {
          updateState(message.payload)
        }
        break
      case "EFFECTIVE_WORD_FOUND":
        loadEffectiveWords()
        break
    }
  })
}

async function loadState() {
  try {
    const response = await chrome.runtime.sendMessage({ type: "GET_STATUS" })
    if (response) {
      state = response
      showResultNotice = false
      updateUI()
    }
  } catch (error) {
    console.error("Failed to load state:", error)
  }
}

async function loadEffectiveWords() {
  try {
    const response = await chrome.runtime.sendMessage({
      type: "GET_EFFECTIVE_WORDS"
    })
    if (response && response.words) {
      effectiveWords = response.words
      renderWordsList()
    }
  } catch (error) {
    console.error("Failed to load effective words:", error)
  }
}

function handleStart() {
  const baseKeyword = document.getElementById("baseKeyword")?.value || ""
  const seedKeywordsText = document.getElementById("seedKeywords")?.value || ""
  const timeRange = document.getElementById("timeRange")?.value || "today 12-m"
  const geo = document.getElementById("geo")?.value || ""
  const threshold = parseInt(document.getElementById("threshold")?.value || "20", 10)
  const maxKeywords = parseInt(document.getElementById("maxKeywords")?.value || "100", 10)
  const relatedQueryLimit = parseInt(document.getElementById("relatedQueryLimit")?.value || "20", 10)

  const seeds = seedKeywordsText
    .split(/[,，\n]/)
    .map((s) => s.trim())
    .filter(Boolean)

  const options = {
    baseKeyword: baseKeyword.trim() || seeds[0] || "未命名",
    seedKeywords: seeds.length > 0 ? seeds : [baseKeyword.trim()],
    timeRange,
    threshold,
    maxKeywords,
    relatedQueryLimit,
    geo
  }

  chrome.runtime.sendMessage({
    type: "START_CAPTURE",
    payload: options
  })

  state.isActive = true
  state.queueSize = options.seedKeywords.length
  state.endReason = ""
  showResultNotice = false
  updateUI()
}

function handlePause() {
  chrome.runtime.sendMessage({ type: "PAUSE_CAPTURE" })
  state.isPaused = true
  state.statusMessage = "已暂停"
  updateUI()
}

function handleResume() {
  chrome.runtime.sendMessage({ type: "RESUME_CAPTURE" })
  state.isPaused = false
  state.statusMessage = "恢复处理中..."
  updateUI()
}

function handleStop() {
  const wasActive = state.isActive
  chrome.runtime.sendMessage({ type: "STOP_CAPTURE" })
  state.isActive = false
  state.isPaused = false
  state.statusMessage = "已停止"
  state.endReason = "手动停止"
  showResultNotice = wasActive
  updateUI()
}

async function handleExport() {
  try {
    const response = await chrome.runtime.sendMessage({
      type: "EXPORT_DATA"
    })

    if (response && response.data) {
      const data = response.data
      const timestamp = new Date().toISOString().slice(0, 10)

      // Download JSON
      const jsonBlob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json"
      })
      const jsonUrl = URL.createObjectURL(jsonBlob)
      chrome.downloads.download({
        url: jsonUrl,
        filename: `keywords-${timestamp}.json`,
        saveAs: true
      })
      URL.revokeObjectURL(jsonUrl)

      // Download text report
      const report = generateReport(data)
      const reportBlob = new Blob([report], { type: "text/plain;charset=utf-8" })
      const reportUrl = URL.createObjectURL(reportBlob)
      chrome.downloads.download({
        url: reportUrl,
        filename: `keywords-report-${timestamp}.txt`,
        saveAs: true
      })
      URL.revokeObjectURL(reportUrl)
    }
  } catch (error) {
    console.error("Export failed:", error)
    alert("导出失败: " + error.message)
  }
}

function generateReport(data) {
  const date = new Date(data.timestamp).toLocaleString("zh-CN")
  const report = data.report || null
  const effectiveNewWords = report?.effectiveNewWords || data.effectiveNewWords || []
  const processedCount = report?.totalProcessed ?? data.processedKeywords.length
  const endType = report?.endType === "abnormal" ? "异常终止" : "正常完成"
  const endReason = report?.endReason || "未记录"

  return `
========================================
          新词挖掘报告
========================================

生成时间: ${date}
----------------------------------------

【统计信息】
- 已处理关键词: ${processedCount}
- 有效新词数量: ${effectiveNewWords.length}
- 任务结束类型: ${endType}
- 任务结束原因: ${endReason}

----------------------------------------

【有效新词列表】
${effectiveNewWords.length > 0 ? effectiveNewWords.map((word, i) => `${i + 1}. ${word}`).join("\n") : "无"}

========================================
`
}

function updateState(newState) {
  const wasActive = state.isActive
  state = { ...state, ...newState }

  const reason = state.endReason || state.lastError || ""
  if (wasActive && !state.isActive && reason) {
    showResultNotice = true
  }

  updateUI()
}

function updateUI() {
  const isRunning = state.isActive && !state.isPaused
  const isPaused = state.isActive && state.isPaused
  const isIdle = !state.isActive

  // Section visibility
  if (isRunning || isPaused) {
    inputSection?.classList.add("hidden")
    statusSection?.classList.remove("hidden")
    resultNoticeEl?.classList.add("hidden")
    stopBtn?.classList.remove("hidden")
    exportBtn?.classList.remove("hidden")

    // Only difference between ACTIVE and PAUSED states
    pauseBtn?.classList.toggle("hidden", isPaused)
    resumeBtn?.classList.toggle("hidden", isRunning)
  } else {
    // IDLE state
    inputSection?.classList.remove("hidden")
    statusSection?.classList.add("hidden")
    pauseBtn?.classList.add("hidden")
    resumeBtn?.classList.add("hidden")

    const reason = state.endReason || state.lastError || ""
    if (showResultNotice && reason) {
      resultNoticeTextEl.textContent = reason
      resultNoticeEl?.classList.remove("hidden")
    } else {
      resultNoticeEl?.classList.add("hidden")
    }
  }

  // Update status badge
  statusBadgeEl.classList.remove("active", "inactive", "paused")
  if (isRunning) {
    statusBadgeEl.textContent = "运行中"
    statusBadgeEl.classList.add("active")
  } else if (isPaused) {
    statusBadgeEl.textContent = "已暂停"
    statusBadgeEl.classList.add("paused")
  } else {
    statusBadgeEl.textContent = "已停止"
    statusBadgeEl.classList.add("inactive")
  }

  // Update status values
  currentKeywordEl.textContent = state.currentKeyword || "-"
  processedCountEl.textContent = state.processedCount
  queueSizeEl.textContent = state.queueSize
  effectiveNewWordsCountEl.textContent = state.effectiveNewWordsCount
  currentDepthEl.textContent = state.currentDepth
  statusMessageEl.textContent = state.statusMessage

  if (state.isActive) {
    endReasonEl.textContent = "运行中"
  } else if (state.endReason) {
    endReasonEl.textContent = state.endReason
  } else if (state.statusMessage === "未开始") {
    endReasonEl.textContent = "未开始"
  } else {
    endReasonEl.textContent = "未记录"
  }

  wordsCountEl.textContent = state.effectiveNewWordsCount
}

function renderWordsList() {
  const filter = searchInputEl?.value?.toLowerCase() || ""
  const filteredWords = effectiveWords.filter((w) =>
    w.toLowerCase().includes(filter)
  )

  wordsListEl.innerHTML = ""
  if (filteredWords.length === 0) {
    const li = document.createElement("li")
    li.className = "empty-state"
    li.textContent = filter ? "无匹配结果" : "暂无有效新词"
    wordsListEl.appendChild(li)
    return
  }

  filteredWords.forEach((word, index) => {
    const li = document.createElement("li")
    li.textContent = `${index + 1}. ${word}`
    wordsListEl.appendChild(li)
  })
}

// Initialize on load
init()
