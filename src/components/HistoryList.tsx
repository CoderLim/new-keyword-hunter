import React, { useState, useEffect } from "react"
import type { HistoryRecord } from "~types"
import { KeywordStorage } from "~lib/storage"

interface HistoryListProps {
  currentCount: number
  onExport?: () => void
}

export const HistoryList: React.FC<HistoryListProps> = ({
  currentCount,
  onExport
}) => {
  const [records, setRecords] = useState<HistoryRecord[]>([])
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    loadRecords()
  }, [currentCount])

  const loadRecords = async () => {
    const data = await KeywordStorage.getHistoryRecords()
    setRecords(data)
  }

  const handleDelete = async (id: string) => {
    await KeywordStorage.deleteHistoryRecord(id)
    await loadRecords()
  }

  const handleClearAll = async () => {
    if (confirm("确定要清空所有历史记录吗？")) {
      await KeywordStorage.clearHistoryRecords()
      await loadRecords()
    }
  }

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp)
    return date.toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    })
  }

  const formatDuration = (seconds: number) => {
    if (seconds < 60) {
      return `${seconds}秒`
    }
    const minutes = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${minutes}分${secs}秒`
  }

  return (
    <div className="history-section">
      <div className="history-header">
        <h3>历史记录</h3>
        <button
          className="btn-small"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? "收起" : "展开"}
        </button>
      </div>

      {expanded && (
        <div className="history-content">
          <div className="history-actions">
            <button className="btn-small" onClick={onExport}>
              导出当前数据
            </button>
            {records.length > 0 && (
              <button
                className="btn-small btn-danger"
                onClick={handleClearAll}
              >
                清空历史
              </button>
            )}
          </div>

          {records.length === 0 ? (
            <p className="empty-state">暂无历史记录</p>
          ) : (
            <ul className="history-list">
              {records.map((record) => (
                <li key={record.id} className="history-item">
                  <div className="history-item-header">
                    <span className="history-keyword">
                      {record.baseKeyword}
                    </span>
                    <span className="history-date">
                      {formatDate(record.timestamp)}
                    </span>
                  </div>
                  <div className="history-stats">
                    <span>处理: {record.totalProcessed}</span>
                    <span>新词: {record.effectiveNewWords}</span>
                  </div>
                  <div className="history-actions">
                    <button
                      className="btn-small"
                      onClick={() => viewDetails(record)}
                    >
                      查看详情
                    </button>
                    <button
                      className="btn-small btn-danger"
                      onClick={() => handleDelete(record.id)}
                    >
                      删除
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )

  function viewDetails(record: HistoryRecord) {
    const details = `
基准词: ${record.baseKeyword}
种子关键词: ${record.seedKeywords.join(", ")}
总处理数: ${record.totalProcessed}
有效新词数: ${record.effectiveNewWords}
时间: ${formatDate(record.timestamp)}

${record.data?.effectiveNewWords ? `有效新词列表:\n${record.data.effectiveNewWords.join("\n")}` : ""}
    `

    alert(details)
  }
}
