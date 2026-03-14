import React, { useState, useEffect } from "react"
import { KeywordStorage } from "~lib/storage"

interface EffectiveWordsProps {
  refreshTrigger: number
}

export const EffectiveWords: React.FC<EffectiveWordsProps> = ({
  refreshTrigger
}) => {
  const [words, setWords] = useState<string[]>([])
  const [filter, setFilter] = useState("")

  useEffect(() => {
    loadWords()
  }, [refreshTrigger])

  const loadWords = async () => {
    const wordSet = await KeywordStorage.getEffectiveNewWords()
    setWords([...wordSet])
  }

  const filteredWords = words.filter((w) =>
    w.toLowerCase().includes(filter.toLowerCase())
  )

  const copyToClipboard = () => {
    navigator.clipboard.writeText(words.join("\n"))
    alert("已复制到剪贴板")
  }

  return (
    <div className="words-section">
      <div className="words-header">
        <h3>有效新词 ({words.length})</h3>
        <button className="btn-small" onClick={copyToClipboard}>
          复制列表
        </button>
      </div>

      <input
        type="text"
        className="search-input"
        placeholder="筛选关键词..."
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />

      <div className="words-list">
        {filteredWords.length === 0 ? (
          <p className="empty-state">
            {filter ? "无匹配结果" : "暂无有效新词"}
          </p>
        ) : (
          <ul>
            {filteredWords.map((word, index) => (
              <li key={`${word}-${index}`}>
                <span className="word-index">{index + 1}.</span>
                {word}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
