// State
let state = {
  isActive: false,
  currentKeyword: "",
  processedCount: 0,
  queueSize: 0,
  effectiveNewWordsCount: 0,
  currentDepth: 0,
  statusMessage: "未开始"
}

let effectiveWords = []

// DOM Elements
const inputSection = document.getElementById("inputSection")
const statusSection = document.getElementById("statusSection")
const startBtn = document.getElementById("startBtn")
const stopBtn = document.getElementById("stopBtn")
const exportBtn = document.getElementById("exportBtn")
const currentKeywordEl = document.getElementById("currentKeyword")
const processedCountEl = document.getElementById("processedCount")
const queueSizeEl = document.getElementById("queueSize")
const effectiveNewWordsCountEl = document.getElementById("effectiveNewWordsCount")
const currentDepthEl = document.getElementById("currentDepth")
const statusMessageEl = document.getElementById("statusMessage")
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
  updateUI()
}

function handleStop() {
  chrome.runtime.sendMessage({ type: "STOP_CAPTURE" })
  state.isActive = false
  state.statusMessage = "已停止"
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

  return `
========================================
          新词挖掘报告
========================================

生成时间: ${date}
----------------------------------------

【统计信息】
- 有效新词数量: ${data.effectiveNewWords.length}
- 已处理关键词: ${data.processedKeywords.length}

----------------------------------------

【有效新词列表】
${data.effectiveNewWords.map((word, i) => `${i + 1}. ${word}`).join("\n")}

========================================
`
}

function updateState(newState) {
  state = { ...state, ...newState }
  updateUI()
}

function updateUI() {
  if (state.isActive) {
    inputSection?.classList.add("hidden")
    statusSection?.classList.remove("hidden")
  } else {
    inputSection?.classList.remove("hidden")
    statusSection?.classList.add("hidden")
  }

  currentKeywordEl.textContent = state.currentKeyword || "-"
  processedCountEl.textContent = state.processedCount
  queueSizeEl.textContent = state.queueSize
  effectiveNewWordsCountEl.textContent = state.effectiveNewWordsCount
  currentDepthEl.textContent = state.currentDepth
  statusMessageEl.textContent = state.statusMessage

  if (state.isActive) {
    statusBadgeEl.textContent = "运行中"
    statusBadgeEl.classList.remove("inactive")
    statusBadgeEl.classList.add("active")
  } else {
    statusBadgeEl.textContent = "已停止"
    statusBadgeEl.classList.remove("active")
    statusBadgeEl.classList.add("inactive")
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
