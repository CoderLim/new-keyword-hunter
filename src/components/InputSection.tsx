import React, { useState } from "react"
import type { CaptureOptions } from "~types"

interface InputSectionProps {
  onStart: (options: CaptureOptions) => void
  disabled: boolean
}

export const InputSection: React.FC<InputSectionProps> = ({ onStart, disabled }) => {
  const [baseKeyword, setBaseKeyword] = useState("")
  const [seedKeywords, setSeedKeywords] = useState("")
  const [timeRange, setTimeRange] = useState("today 12-m")
  const [threshold, setThreshold] = useState("10")
  const [maxKeywords, setMaxKeywords] = useState("100")
  const [geo, setGeo] = useState("CN")

  const handleStart = () => {
    const seeds = seedKeywords
      .split(/[,，\n]/)
      .map((s) => s.trim())
      .filter(Boolean)

    const options: CaptureOptions = {
      baseKeyword: baseKeyword.trim() || seeds[0] || "未命名",
      seedKeywords: seeds.length > 0 ? seeds : [baseKeyword.trim()],
      timeRange,
      threshold: parseInt(threshold, 10) || 10,
      maxKeywords: parseInt(maxKeywords, 10) || 100,
      geo
    }

    onStart(options)
  }

  const isFormValid = baseKeyword.trim() || seedKeywords.trim()

  return (
    <div className="input-section">
      <div className="form-group">
        <label htmlFor="baseKeyword">基准词 (用于标识)</label>
        <input
          id="baseKeyword"
          type="text"
          value={baseKeyword}
          onChange={(e) => setBaseKeyword(e.target.value)}
          placeholder="例如: AI"
          disabled={disabled}
        />
      </div>

      <div className="form-group">
        <label htmlFor="seedKeywords">种子关键词 (每行一个或逗号分隔)</label>
        <textarea
          id="seedKeywords"
          value={seedKeywords}
          onChange={(e) => setSeedKeywords(e.target.value)}
          placeholder="例如: ChatGPT&#10;OpenAI&#10;人工智能"
          rows={4}
          disabled={disabled}
        />
      </div>

      <div className="form-row">
        <div className="form-group">
          <label htmlFor="timeRange">时间范围</label>
          <select
            id="timeRange"
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value)}
            disabled={disabled}
          >
            <option value="today 12-m">过去 12 个月</option>
            <option value="today 3-m">过去 3 个月</option>
            <option value="today 1-m">过去 1 个月</option>
            <option value="today 5-y">过去 5 年</option>
            <option value="all">全部时间</option>
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="geo">地区</label>
          <select
            id="geo"
            value={geo}
            onChange={(e) => setGeo(e.target.value)}
            disabled={disabled}
          >
            <option value="CN">中国</option>
            <option value="US">美国</option>
            <option value="">全球</option>
            <option value="JP">日本</option>
            <option value="KR">韩国</option>
            <option value="GB">英国</option>
          </select>
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label htmlFor="threshold">阈值 (后期平均值)</label>
          <input
            id="threshold"
            type="number"
            min="1"
            max="100"
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
            disabled={disabled}
          />
        </div>

        <div className="form-group">
          <label htmlFor="maxKeywords">最大关键词数 (0为无限制)</label>
          <input
            id="maxKeywords"
            type="number"
            min="0"
            value={maxKeywords}
            onChange={(e) => setMaxKeywords(e.target.value)}
            disabled={disabled}
          />
        </div>
      </div>

      <button
        className="btn-primary"
        onClick={handleStart}
        disabled={disabled || !isFormValid}
      >
        {disabled ? "运行中..." : "开始挖掘"}
      </button>
    </div>
  )
}
