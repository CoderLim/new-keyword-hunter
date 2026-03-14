import React from "react"
import type { CaptureState } from "~types"

interface StatusDisplayProps {
  state: CaptureState
}

export const StatusDisplay: React.FC<StatusDisplayProps> = ({ state }) => {
  const progress =
    state.maxKeywords > 0
      ? Math.min(100, (state.processedCount / state.maxKeywords) * 100)
      : 0

  return (
    <div className="status-section">
      <div className="status-header">
        <h3>挖掘状态</h3>
        <span className={`status-badge ${state.isActive ? "active" : "inactive"}`}>
          {state.isActive ? "运行中" : "已停止"}
        </span>
      </div>

      <div className="status-grid">
        <div className="status-item">
          <span className="status-label">当前关键词</span>
          <span className="status-value">{state.currentKeyword || "-"}</span>
        </div>

        <div className="status-item">
          <span className="status-label">已处理</span>
          <span className="status-value">{state.processedCount}</span>
        </div>

        <div className="status-item">
          <span className="status-label">队列大小</span>
          <span className="status-value">{state.queueSize}</span>
        </div>

        <div className="status-item">
          <span className="status-label">有效新词</span>
          <span className="status-value highlight">
            {state.effectiveNewWordsCount}
          </span>
        </div>

        <div className="status-item">
          <span className="status-label">当前深度</span>
          <span className="status-value">{state.currentDepth}</span>
        </div>

        <div className="status-item full-width">
          <span className="status-label">状态消息</span>
          <span className="status-value small">{state.statusMessage}</span>
        </div>
      </div>

      {state.isActive && state.maxKeywords > 0 && (
        <div className="progress-bar">
          <div
            className="progress-fill"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {state.lastError && (
        <div className="error-message">
          <strong>错误:</strong> {state.lastError}
        </div>
      )}
    </div>
  )
}
