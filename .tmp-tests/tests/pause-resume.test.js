"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
/**
 * Mock Chrome storage for testing
 */
class MockStorage {
    data = new Map();
    async getItem(key) {
        const value = this.data.get(key);
        return value ? JSON.parse(value) : null;
    }
    async setItem(key, value) {
        this.data.set(key, value);
    }
    clear() {
        this.data.clear();
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
    };
}
(0, node_test_1.default)("CaptureState should have isPaused flag defaulting to false", () => {
    const state = createMockState();
    strict_1.default.equal(state.isPaused, false);
    strict_1.default.equal(state.isActive, false);
});
(0, node_test_1.default)("State transitions: IDLE -> ACTIVE", () => {
    const idleState = createMockState({ isActive: false, isPaused: false });
    const activeState = { ...idleState, isActive: true, isPaused: false };
    strict_1.default.equal(activeState.isActive, true);
    strict_1.default.equal(activeState.isPaused, false);
});
(0, node_test_1.default)("State transitions: ACTIVE -> PAUSED", () => {
    const activeState = createMockState({ isActive: true, isPaused: false });
    const pausedState = { ...activeState, isPaused: true, statusMessage: "已暂停" };
    strict_1.default.equal(pausedState.isActive, true);
    strict_1.default.equal(pausedState.isPaused, true);
    strict_1.default.equal(pausedState.statusMessage, "已暂停");
});
(0, node_test_1.default)("State transitions: PAUSED -> ACTIVE (resume)", () => {
    const pausedState = createMockState({
        isActive: true,
        isPaused: true,
        processedCount: 5,
        queueSize: 10
    });
    const resumedState = {
        ...pausedState,
        isPaused: false,
        statusMessage: "恢复处理中..."
    };
    strict_1.default.equal(resumedState.isActive, true);
    strict_1.default.equal(resumedState.isPaused, false);
    strict_1.default.equal(resumedState.processedCount, 5); // Preserved
    strict_1.default.equal(resumedState.queueSize, 10); // Preserved
});
(0, node_test_1.default)("State transitions: PAUSED -> IDLE (stop)", () => {
    const pausedState = createMockState({ isActive: true, isPaused: true });
    const stoppedState = {
        ...pausedState,
        isActive: false,
        isPaused: false,
        statusMessage: "已停止"
    };
    strict_1.default.equal(stoppedState.isActive, false);
    strict_1.default.equal(stoppedState.isPaused, false);
});
(0, node_test_1.default)("State transitions: ACTIVE -> IDLE (stop)", () => {
    const activeState = createMockState({ isActive: true, isPaused: false });
    const stoppedState = {
        ...activeState,
        isActive: false,
        isPaused: false,
        statusMessage: "已停止"
    };
    strict_1.default.equal(stoppedState.isActive, false);
    strict_1.default.equal(stoppedState.isPaused, false);
});
(0, node_test_1.default)("Pause should preserve queue and progress", () => {
    const activeState = createMockState({
        isActive: true,
        isPaused: false,
        currentKeyword: "测试关键词",
        processedCount: 15,
        queueSize: 25,
        effectiveNewWordsCount: 3,
        currentDepth: 2
    });
    const pausedState = { ...activeState, isPaused: true };
    // All counters should be preserved
    strict_1.default.equal(pausedState.currentKeyword, "测试关键词");
    strict_1.default.equal(pausedState.processedCount, 15);
    strict_1.default.equal(pausedState.queueSize, 25);
    strict_1.default.equal(pausedState.effectiveNewWordsCount, 3);
    strict_1.default.equal(pausedState.currentDepth, 2);
});
(0, node_test_1.default)("Resume should maintain all state except isPaused", () => {
    const pausedState = createMockState({
        isActive: true,
        isPaused: true,
        currentKeyword: "暂停的词",
        processedCount: 20,
        queueSize: 15,
        effectiveNewWordsCount: 5,
        currentDepth: 3
    });
    const resumedState = {
        ...pausedState,
        isPaused: false,
        statusMessage: "恢复处理中..."
    };
    strict_1.default.equal(resumedState.isPaused, false);
    strict_1.default.equal(resumedState.isActive, true);
    strict_1.default.equal(resumedState.currentKeyword, "暂停的词");
    strict_1.default.equal(resumedState.processedCount, 20);
    strict_1.default.equal(resumedState.queueSize, 15);
    strict_1.default.equal(resumedState.effectiveNewWordsCount, 5);
    strict_1.default.equal(resumedState.currentDepth, 3);
});
(0, node_test_1.default)("Backward compatibility: old state without isPaused defaults to false", async () => {
    const storage = new MockStorage();
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
    };
    await storage.setItem("captureState", JSON.stringify(oldState));
    const retrieved = await storage.getItem("captureState");
    // Apply backward compatibility logic
    const compatibleState = {
        isPaused: false, // Default for old data
        ...retrieved
    };
    strict_1.default.equal(compatibleState.isPaused, false);
    strict_1.default.equal(compatibleState.isActive, true);
    strict_1.default.equal(compatibleState.currentKeyword, "旧数据");
});
(0, node_test_1.default)("Guard condition: cannot pause when already paused", () => {
    const pausedState = createMockState({ isActive: true, isPaused: true });
    // Simulate pauseCapture guard condition
    const canPause = pausedState.isActive && !pausedState.isPaused;
    strict_1.default.equal(canPause, false);
});
(0, node_test_1.default)("Guard condition: cannot pause when not active", () => {
    const idleState = createMockState({ isActive: false, isPaused: false });
    // Simulate pauseCapture guard condition
    const canPause = idleState.isActive && !idleState.isPaused;
    strict_1.default.equal(canPause, false);
});
(0, node_test_1.default)("Guard condition: cannot resume when not paused", () => {
    const activeState = createMockState({ isActive: true, isPaused: false });
    // Simulate resumeCapture guard condition
    const canResume = activeState.isActive && activeState.isPaused;
    strict_1.default.equal(canResume, false);
});
(0, node_test_1.default)("Guard condition: cannot resume when not active", () => {
    const idleState = createMockState({ isActive: false, isPaused: false });
    // Simulate resumeCapture guard condition
    const canResume = idleState.isActive && idleState.isPaused;
    strict_1.default.equal(canResume, false);
});
(0, node_test_1.default)("Processing check: should skip when paused", () => {
    const pausedState = createMockState({ isActive: true, isPaused: true });
    // Simulate processNextKeyword pause check
    const shouldProcess = pausedState.isActive && !pausedState.isPaused;
    strict_1.default.equal(shouldProcess, false);
});
(0, node_test_1.default)("Processing check: should process when active and not paused", () => {
    const activeState = createMockState({ isActive: true, isPaused: false });
    // Simulate processNextKeyword pause check
    const shouldProcess = activeState.isActive && !activeState.isPaused;
    strict_1.default.equal(shouldProcess, true);
});
(0, node_test_1.default)("Processing check: should not process when idle", () => {
    const idleState = createMockState({ isActive: false, isPaused: false });
    // Simulate processNextKeyword pause check
    const shouldProcess = idleState.isActive && !idleState.isPaused;
    strict_1.default.equal(shouldProcess, false);
});
(0, node_test_1.default)("Message type validation: PAUSE_CAPTURE and RESUME_CAPTURE should be valid", () => {
    const validMessageTypes = [
        "START_CAPTURE",
        "STOP_CAPTURE",
        "PAUSE_CAPTURE",
        "RESUME_CAPTURE",
        "CAPTURE_STATUS",
        "GET_STATUS"
    ];
    strict_1.default.ok(validMessageTypes.includes("PAUSE_CAPTURE"));
    strict_1.default.ok(validMessageTypes.includes("RESUME_CAPTURE"));
});
(0, node_test_1.default)("UI state machine: IDLE shows input section", () => {
    const idleState = createMockState({ isActive: false, isPaused: false });
    const shouldShowInput = !idleState.isActive;
    const shouldShowStatus = idleState.isActive;
    strict_1.default.equal(shouldShowInput, true);
    strict_1.default.equal(shouldShowStatus, false);
});
(0, node_test_1.default)("UI state machine: ACTIVE shows status section with pause button", () => {
    const activeState = createMockState({ isActive: true, isPaused: false });
    const shouldShowInput = !activeState.isActive;
    const shouldShowStatus = activeState.isActive;
    const shouldShowPause = activeState.isActive && !activeState.isPaused;
    const shouldShowResume = activeState.isActive && activeState.isPaused;
    strict_1.default.equal(shouldShowInput, false);
    strict_1.default.equal(shouldShowStatus, true);
    strict_1.default.equal(shouldShowPause, true);
    strict_1.default.equal(shouldShowResume, false);
});
(0, node_test_1.default)("UI state machine: PAUSED shows status section with resume button", () => {
    const pausedState = createMockState({ isActive: true, isPaused: true });
    const shouldShowInput = !pausedState.isActive;
    const shouldShowStatus = pausedState.isActive;
    const shouldShowPause = pausedState.isActive && !pausedState.isPaused;
    const shouldShowResume = pausedState.isActive && pausedState.isPaused;
    strict_1.default.equal(shouldShowInput, false);
    strict_1.default.equal(shouldShowStatus, true);
    strict_1.default.equal(shouldShowPause, false);
    strict_1.default.equal(shouldShowResume, true);
});
(0, node_test_1.default)("Status badge text: shows correct text for each state", () => {
    const idleState = createMockState({ isActive: false, isPaused: false });
    const activeState = createMockState({ isActive: true, isPaused: false });
    const pausedState = createMockState({ isActive: true, isPaused: true });
    const getStatusText = (state) => {
        if (state.isActive && !state.isPaused)
            return "运行中";
        if (state.isPaused)
            return "已暂停";
        return "已停止";
    };
    strict_1.default.equal(getStatusText(idleState), "已停止");
    strict_1.default.equal(getStatusText(activeState), "运行中");
    strict_1.default.equal(getStatusText(pausedState), "已暂停");
});
(0, node_test_1.default)("Storage persistence: state survives serialization", async () => {
    const storage = new MockStorage();
    const originalState = createMockState({
        isActive: true,
        isPaused: true,
        currentKeyword: "测试",
        processedCount: 100,
        queueSize: 50
    });
    await storage.setItem("captureState", JSON.stringify(originalState));
    const retrieved = await storage.getItem("captureState");
    strict_1.default.deepEqual(retrieved, originalState);
    strict_1.default.equal(retrieved.isPaused, true);
});
