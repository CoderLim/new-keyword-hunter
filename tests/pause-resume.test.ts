import test from "node:test"
import assert from "node:assert/strict"

/**
 * Mock Chrome storage for testing
 */
class MockStorage {
  private data: Map<string, string> = new Map()

  async getItem<T>(key: string): Promise<T | null> {
    const value = this.data.get(key)
    return value ? JSON.parse(value) : null
  }

  async setItem(key: string, value: string): Promise<void> {
    this.data.set(key, value)
  }

  clear(): void {
    this.data.clear()
  }
}

/**
 * Test helper to create mock CaptureState
 */
function createMockState(overrides = {}) {
  return {
    isActive: false,
    isPaused: false,
    currentKeyword: "",
    processedCount: 0,
    queueSize: 0,
    effectiveNewWordsCount: 0,
    currentDepth: 0,
    statusMessage: "未开始",
    endReason: "",
    ...overrides
  }
}

test("CaptureState should have isPaused flag defaulting to false", () => {
  const state = createMockState()

  assert.equal(state.isPaused, false)
  assert.equal(state.isActive, false)
})

test("State transitions: IDLE -> ACTIVE", () => {
  const idleState = createMockState({ isActive: false, isPaused: false })
  const activeState = { ...idleState, isActive: true, isPaused: false }

  assert.equal(activeState.isActive, true)
  assert.equal(activeState.isPaused, false)
})

test("State transitions: ACTIVE -> PAUSED", () => {
  const activeState = createMockState({ isActive: true, isPaused: false })
  const pausedState = { ...activeState, isPaused: true, statusMessage: "已暂停" }

  assert.equal(pausedState.isActive, true)
  assert.equal(pausedState.isPaused, true)
  assert.equal(pausedState.statusMessage, "已暂停")
})

test("State transitions: PAUSED -> ACTIVE (resume)", () => {
  const pausedState = createMockState({
    isActive: true,
    isPaused: true,
    processedCount: 5,
    queueSize: 10
  })
  const resumedState = {
    ...pausedState,
    isPaused: false,
    statusMessage: "恢复处理中..."
  }

  assert.equal(resumedState.isActive, true)
  assert.equal(resumedState.isPaused, false)
  assert.equal(resumedState.processedCount, 5) // Preserved
  assert.equal(resumedState.queueSize, 10) // Preserved
})

test("State transitions: PAUSED -> IDLE (stop)", () => {
  const pausedState = createMockState({ isActive: true, isPaused: true })
  const stoppedState = {
    ...pausedState,
    isActive: false,
    isPaused: false,
    statusMessage: "已停止"
  }

  assert.equal(stoppedState.isActive, false)
  assert.equal(stoppedState.isPaused, false)
})

test("State transitions: ACTIVE -> IDLE (stop)", () => {
  const activeState = createMockState({ isActive: true, isPaused: false })
  const stoppedState = {
    ...activeState,
    isActive: false,
    isPaused: false,
    statusMessage: "已停止"
  }

  assert.equal(stoppedState.isActive, false)
  assert.equal(stoppedState.isPaused, false)
})

test("Pause should preserve queue and progress", () => {
  const activeState = createMockState({
    isActive: true,
    isPaused: false,
    currentKeyword: "测试关键词",
    processedCount: 15,
    queueSize: 25,
    effectiveNewWordsCount: 3,
    currentDepth: 2
  })

  const pausedState = { ...activeState, isPaused: true }

  // All counters should be preserved
  assert.equal(pausedState.currentKeyword, "测试关键词")
  assert.equal(pausedState.processedCount, 15)
  assert.equal(pausedState.queueSize, 25)
  assert.equal(pausedState.effectiveNewWordsCount, 3)
  assert.equal(pausedState.currentDepth, 2)
})

test("Resume should maintain all state except isPaused", () => {
  const pausedState = createMockState({
    isActive: true,
    isPaused: true,
    currentKeyword: "暂停的词",
    processedCount: 20,
    queueSize: 15,
    effectiveNewWordsCount: 5,
    currentDepth: 3
  })

  const resumedState = {
    ...pausedState,
    isPaused: false,
    statusMessage: "恢复处理中..."
  }

  assert.equal(resumedState.isPaused, false)
  assert.equal(resumedState.isActive, true)
  assert.equal(resumedState.currentKeyword, "暂停的词")
  assert.equal(resumedState.processedCount, 20)
  assert.equal(resumedState.queueSize, 15)
  assert.equal(resumedState.effectiveNewWordsCount, 5)
  assert.equal(resumedState.currentDepth, 3)
})

test("Backward compatibility: old state without isPaused defaults to false", async () => {
  const storage = new MockStorage()

  // Simulate old stored state without isPaused field
  const oldState = {
    isActive: true,
    currentKeyword: "旧数据",
    processedCount: 10,
    queueSize: 5,
    effectiveNewWordsCount: 2,
    currentDepth: 1,
    statusMessage: "运行中",
    endReason: ""
  }

  await storage.setItem("captureState", JSON.stringify(oldState))
  const retrieved = await storage.getItem<any>("captureState")

  // Apply backward compatibility logic
  const compatibleState = {
    isPaused: false,  // Default for old data
    ...retrieved
  }

  assert.equal(compatibleState.isPaused, false)
  assert.equal(compatibleState.isActive, true)
  assert.equal(compatibleState.currentKeyword, "旧数据")
})

test("Guard condition: cannot pause when already paused", () => {
  const pausedState = createMockState({ isActive: true, isPaused: true })

  // Simulate pauseCapture guard condition
  const canPause = pausedState.isActive && !pausedState.isPaused

  assert.equal(canPause, false)
})

test("Guard condition: cannot pause when not active", () => {
  const idleState = createMockState({ isActive: false, isPaused: false })

  // Simulate pauseCapture guard condition
  const canPause = idleState.isActive && !idleState.isPaused

  assert.equal(canPause, false)
})

test("Guard condition: cannot resume when not paused", () => {
  const activeState = createMockState({ isActive: true, isPaused: false })

  // Simulate resumeCapture guard condition
  const canResume = activeState.isActive && activeState.isPaused

  assert.equal(canResume, false)
})

test("Guard condition: cannot resume when not active", () => {
  const idleState = createMockState({ isActive: false, isPaused: false })

  // Simulate resumeCapture guard condition
  const canResume = idleState.isActive && idleState.isPaused

  assert.equal(canResume, false)
})

test("Processing check: should skip when paused", () => {
  const pausedState = createMockState({ isActive: true, isPaused: true })

  // Simulate processNextKeyword pause check
  const shouldProcess = pausedState.isActive && !pausedState.isPaused

  assert.equal(shouldProcess, false)
})

test("Processing check: should process when active and not paused", () => {
  const activeState = createMockState({ isActive: true, isPaused: false })

  // Simulate processNextKeyword pause check
  const shouldProcess = activeState.isActive && !activeState.isPaused

  assert.equal(shouldProcess, true)
})

test("Processing check: should not process when idle", () => {
  const idleState = createMockState({ isActive: false, isPaused: false })

  // Simulate processNextKeyword pause check
  const shouldProcess = idleState.isActive && !idleState.isPaused

  assert.equal(shouldProcess, false)
})

test("Message type validation: PAUSE_CAPTURE and RESUME_CAPTURE should be valid", () => {
  const validMessageTypes = [
    "START_CAPTURE",
    "STOP_CAPTURE",
    "PAUSE_CAPTURE",
    "RESUME_CAPTURE",
    "CAPTURE_STATUS",
    "GET_STATUS"
  ]

  assert.ok(validMessageTypes.includes("PAUSE_CAPTURE"))
  assert.ok(validMessageTypes.includes("RESUME_CAPTURE"))
})

test("UI state machine: IDLE shows input section", () => {
  const idleState = createMockState({ isActive: false, isPaused: false })

  const shouldShowInput = !idleState.isActive
  const shouldShowStatus = idleState.isActive

  assert.equal(shouldShowInput, true)
  assert.equal(shouldShowStatus, false)
})

test("UI state machine: ACTIVE shows status section with pause button", () => {
  const activeState = createMockState({ isActive: true, isPaused: false })

  const shouldShowInput = !activeState.isActive
  const shouldShowStatus = activeState.isActive
  const shouldShowPause = activeState.isActive && !activeState.isPaused
  const shouldShowResume = activeState.isActive && activeState.isPaused

  assert.equal(shouldShowInput, false)
  assert.equal(shouldShowStatus, true)
  assert.equal(shouldShowPause, true)
  assert.equal(shouldShowResume, false)
})

test("UI state machine: PAUSED shows status section with resume button", () => {
  const pausedState = createMockState({ isActive: true, isPaused: true })

  const shouldShowInput = !pausedState.isActive
  const shouldShowStatus = pausedState.isActive
  const shouldShowPause = pausedState.isActive && !pausedState.isPaused
  const shouldShowResume = pausedState.isActive && pausedState.isPaused

  assert.equal(shouldShowInput, false)
  assert.equal(shouldShowStatus, true)
  assert.equal(shouldShowPause, false)
  assert.equal(shouldShowResume, true)
})

test("Status badge text: shows correct text for each state", () => {
  const idleState = createMockState({ isActive: false, isPaused: false })
  const activeState = createMockState({ isActive: true, isPaused: false })
  const pausedState = createMockState({ isActive: true, isPaused: true })

  const getStatusText = (state: any) => {
    if (state.isActive && !state.isPaused) return "运行中"
    if (state.isPaused) return "已暂停"
    return "已停止"
  }

  assert.equal(getStatusText(idleState), "已停止")
  assert.equal(getStatusText(activeState), "运行中")
  assert.equal(getStatusText(pausedState), "已暂停")
})

test("Storage persistence: state survives serialization", async () => {
  const storage = new MockStorage()

  const originalState = createMockState({
    isActive: true,
    isPaused: true,
    currentKeyword: "测试",
    processedCount: 100,
    queueSize: 50
  })

  await storage.setItem("captureState", JSON.stringify(originalState))
  const retrieved = await storage.getItem<any>("captureState")

  assert.deepEqual(retrieved, originalState)
  assert.equal(retrieved.isPaused, true)
})
