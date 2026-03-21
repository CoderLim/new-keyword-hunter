# Google Trends 频率限制优化实施总结

## 实施日期
2026-03-21

## 实施内容

本次优化实现了 Google Trends API 频率限制优化方案，包含**批量对比**和**智能限频控制**两大核心功能。

### 优化效果预期

- ✅ **请求量减少 75%**：从 N 次请求降低到 N/4 次
- ✅ **处理速度提升 4 倍**：相同时间内可分析 4 倍的关键词
- ✅ **降低 429 触发概率**：通过批量对比和智能限流双重保障
- ✅ **自适应速率调整**：根据实际情况自动优化请求速率

---

## 核心改动

### 1. 新增配置文件 (`src/config.ts`)

定义了完整的限频配置：

```typescript
export const RATE_LIMIT_CONFIG = {
  batchSize: 4,              // 每次批量对比 4 个候选词
  tokenBucket: {
    capacity: 5,             // 令牌桶容量
    refillRate: 1.5,         // 每秒生成 1.5 个令牌
  },
  retry: {
    maxRetries: 3,           // 最多重试 3 次
    initialDelay: 1000,      // 初始延迟 1 秒
    jitterPercent: 0.25,     // ±25% 随机抖动
  },
  circuitBreaker: {
    failureThreshold: 5,     // 5 次失败触发熔断
    resetTimeout: 60000,     // 60 秒后尝试恢复
  },
  adaptive: {
    minInterval: 500,        // 最小间隔 0.5 秒
    maxInterval: 10000,      // 最大间隔 10 秒
    initialInterval: 2000,   // 初始间隔 2 秒
    increaseStep: 100,       // 加速步长 100ms
    decreaseFactor: 2,       // 减速因子 2 倍
  },
}
```

### 2. 新增限流模块 (`src/lib/rate-limiter.ts`)

实现了四种限流策略：

#### (1) TokenBucket - 令牌桶算法
- 允许短时突发流量
- 长期平均速率可控
- 每次请求前调用 `await tokenBucket.acquire()`

#### (2) fetchWithRetry - 指数退避重试
- 检测到 429 后自动重试
- 支持 `Retry-After` 响应头
- 指数退避 + 随机抖动避免惊群效应

#### (3) CircuitBreaker - 熔断器
- 连续失败后暂停请求
- 状态机：CLOSED → OPEN → HALF_OPEN
- 防止雪崩效应

#### (4) AdaptiveRateLimiter - 自适应速率调整
- 基于 AIMD 算法（TCP 拥塞控制）
- 成功时：每 10 次成功减少 100ms 间隔
- 失败时：立即将间隔翻倍
- 自动探测 Google Trends 真实限额

### 3. 存储层批量方法 (`src/lib/storage.ts`)

新增三个批量操作方法：

```typescript
// 批量出队
static async getNextBatch(batchSize: number): Promise<string[]>

// 批量添加有效词
static async addEffectiveNewWords(keywords: string[]): Promise<void>

// 批量添加已处理关键词
static async addProcessedKeywords(keywords: string[]): Promise<void>
```

### 4. 关键词分析器批量分析 (`src/lib/keyword-analyzer.ts`)

新增批量分析函数：

```typescript
export interface BatchAnalysisResult {
  keyword: string
  isEffective: boolean
  score: number
  baseAvg: number
  candidateAvg: number
}

export function batchAnalyzeNewWords(
  seriesValues: number[][],      // [基准词, 候选词1, 候选词2, ...]
  candidateKeywords: string[],
  threshold: number
): BatchAnalysisResult[]
```

**工作原理**：
- 输入：多系列时间线数据（第 0 个系列是基准词，1-4 是候选词）
- 输出：每个候选词的有效性判断 + 评分
- 一次性分析最多 4 个候选词

### 5. 后台脚本批量处理 (`src/background.ts`)

#### 核心改动：

**(1) 初始化限流器**
```typescript
const tokenBucket = new TokenBucket()
const adaptiveRateLimiter = new AdaptiveRateLimiter()
const circuitBreaker = new CircuitBreaker()
let processingBatch: string[] = []
```

**(2) processNextKeyword 改为批量处理**

**原逻辑**：
```typescript
const nextKeyword = await KeywordStorage.getNextKeyword()  // 取 1 个
const queryKeywords = [baseKeyword, nextKeyword]           // 最多 2 个
```

**新逻辑**：
```typescript
const candidateBatch = await KeywordStorage.getNextBatch(4)  // 取 4 个
const queryKeywords = [baseKeyword, ...candidateBatch]       // 最多 5 个
await tokenBucket.acquire()                                   // 应用令牌桶限流
```

**(3) 时间线数据批量分析**

**原逻辑**：
```typescript
if (timelineSeries.length >= 2) {
  const baseTimeline = timelineSeries[0]
  const candidateTimeline = timelineSeries[1]  // 只分析 1 个
  const isEffective = isNewWordEffectiveByBase(...)
}
```

**新逻辑**：
```typescript
if (timelineSeries.length >= 2) {
  const results = batchAnalyzeNewWords(
    timelineSeries,      // 包含 1 个基准 + 4 个候选
    currentBatch,        // 4 个候选词名称
    options.threshold
  )

  const effectiveKeywords = results
    .filter(r => r.isEffective)
    .map(r => r.keyword)

  await KeywordStorage.addEffectiveNewWords(effectiveKeywords)  // 批量添加
}
```

**(4) 429 错误处理**
```typescript
// 检测到 429 后通知自适应限流器
adaptiveRateLimiter.on429()  // 自动将间隔翻倍
```

**(5) 成功请求反馈**
```typescript
// 时间线分析成功后
adaptiveRateLimiter.onSuccess()  // 每 10 次成功减少 100ms 间隔
```

---

## 数据流对比

### 优化前

```
用户启动 → 处理关键词 A
  ↓
构建 URL: q=基准词,A
  ↓
等待 2 秒 (固定延迟)
  ↓
打开 Trends 页面
  ↓
拦截 API 响应
  ↓
分析 1 个候选词
  ↓
处理关键词 B → 等待 2 秒 → ...
```

**问题**：
- 每次只能分析 1 个候选词
- 固定延迟无法自适应
- 触发 429 后直接终止

### 优化后

```
用户启动 → 批量出队 [A, B, C, D]
  ↓
令牌桶限流 (动态速率)
  ↓
构建 URL: q=基准词,A,B,C,D
  ↓
打开 Trends 页面
  ↓
拦截 API 响应
  ↓
批量分析 4 个候选词
  ↓
  ├─ A: 有效 → 添加到结果
  ├─ B: 无效 → 跳过
  ├─ C: 有效 → 添加到结果
  └─ D: 无效 → 跳过
  ↓
自适应调整：成功 → 加速 / 429 → 减速
  ↓
批量出队 [E, F, G, H] → ...
```

**优势**：
- ✅ 请求量减少 75%
- ✅ 动态速率调整
- ✅ 智能重试和恢复

---

## 关键技术细节

### 1. Google Trends API 支持

Google Trends 的 `/trends/explore` 页面支持最多 5 个关键词对比：

```
https://trends.google.com/trends/explore?q=词1,词2,词3,词4,词5
```

返回的 `timelineData` 包含多个系列：
```json
{
  "default": {
    "timelineData": [
      {
        "time": "...",
        "value": [100, 50, 30, 20, 10],  // 5 个关键词的搜索量
        "formattedValue": ["100", "50", "30", "20", "10"]
      },
      ...
    ]
  }
}
```

`parseTimelineSeriesValues` 函数会将其解析为：
```typescript
[
  [100, 95, 90, ...],  // 词1 的时间序列
  [50, 48, 52, ...],   // 词2 的时间序列
  [30, 28, 32, ...],   // 词3 的时间序列
  [20, 22, 18, ...],   // 词4 的时间序列
  [10, 12, 8, ...],    // 词5 的时间序列
]
```

### 2. 去重机制保持不变

`isDuplicateIntercept` 函数基于响应体签名去重，自动适配批量请求：

```typescript
const signature = `${url}|${responseBody.length}|${responseBody.slice(0, 120)}`
```

不同的批次会产生不同的响应体，因此不会误判为重复。

### 3. UI 显示优化

状态栏显示批次信息：

**原显示**：
```
正在处理: 关键词A
```

**新显示**：
```
正在处理批次 (4 个关键词)
当前关键词: 关键词A, 关键词B, 关键词C, 关键词D
```

### 4. 向后兼容

- 如果队列中只剩 1-3 个关键词，会取出实际数量（不会等待凑够 4 个）
- 无基准词的情况，仍然支持单个关键词分析
- 配置项 `batchSize` 可调整，设为 1 即回退到原有行为

---

## 测试建议

### 单元测试

1. **令牌桶测试**
   ```typescript
   // 测试令牌生成和消耗
   const bucket = new TokenBucket(5, 2)
   await bucket.acquire()  // 消耗 1 个
   expect(bucket.getTokens()).toBeLessThan(5)
   ```

2. **批量分析测试**
   ```typescript
   const seriesValues = [
     [100, 100, 100, ...],  // 基准词
     [0, 0, 0, 50, 50, ...],  // 候选词1（有效）
     [10, 10, 10, ...],       // 候选词2（无效）
   ]
   const results = batchAnalyzeNewWords(seriesValues, ['词1', '词2'], 20)
   expect(results[0].isEffective).toBe(true)
   expect(results[1].isEffective).toBe(false)
   ```

### 集成测试

1. **小批量测试**
   - 准备 10 个候选词
   - 观察是否正确分 3 批处理（4+4+2）
   - 验证有效词识别正确

2. **对比测试**
   - 同一批关键词，分别用优化前/后版本
   - 对比结果一致性
   - 测量请求数量（应减少 75%）

3. **429 恢复测试**
   - 人为触发 429（快速添加大量关键词）
   - 验证自适应限流器是否降速
   - 观察是否能从 429 恢复

### 监控指标

建议在生产环境监控：

- 429 触发次数/小时
- 平均请求间隔（观察自适应调整）
- 批量处理成功率
- 队列处理速度（关键词/分钟）
- 有效词识别准确率

---

## 配置调优建议

### 初始配置（保守）

```typescript
{
  batchSize: 4,
  tokenBucket: { capacity: 5, refillRate: 1.0 },
  adaptive: { initialInterval: 3000 }
}
```

### 激进配置（快速挖掘）

```typescript
{
  batchSize: 4,
  tokenBucket: { capacity: 10, refillRate: 2.0 },
  adaptive: { initialInterval: 1000 }
}
```

### 调优策略

1. **观察 429 触发频率**
   - 频繁触发 → 降低 `refillRate` 或提高 `initialInterval`
   - 从不触发 → 提高 `refillRate` 或降低 `initialInterval`

2. **观察自适应调整日志**
   ```
   [NKH] Speed up: interval 2000ms → 1900ms
   [NKH] Rate limited! Slow down: interval 1900ms → 3800ms
   ```
   - 如果频繁减速 → 初始间隔设置过小
   - 如果从不加速 → 初始间隔设置过大

3. **批量大小调整**
   - `batchSize: 4` 是最优值（Google Trends 限制 5 个关键词）
   - 如果队列经常不够 4 个，可以考虑降低到 2-3

---

## 潜在风险与缓解

### 风险 1：批量分析失败影响更多关键词

**缓解**：
- 如果批量请求失败，可以考虑降级为单个重试
- 当前实现：失败后跳过整批，继续处理下一批

### 风险 2：自适应调整过于激进

**缓解**：
- 设置 `minInterval` 和 `maxInterval` 边界
- 每 10 次成功才加速一次（避免过快）
- 触发 429 立即翻倍减速（快速响应）

### 风险 3：Google Trends API 变化

**缓解**：
- 批量对比功能是 Google Trends 官方支持的
- 如果 API 变化，可以通过 `batchSize: 1` 快速回退
- 限流逻辑独立，不依赖批量功能

---

## 后续优化方向

### 短期（1-2 周）

1. **添加配置 UI**
   - 在侧边栏添加"限频设置"选项
   - 允许用户调整 `batchSize`、`refillRate` 等参数

2. **统计面板**
   - 显示当前请求速率
   - 显示 429 触发历史
   - 显示批量处理效率

### 中期（1 个月）

3. **智能降级**
   - 批量请求失败后自动拆分为单个重试
   - 连续失败后自动降低 `batchSize`

4. **缓存策略**
   - 对相同关键词+时间范围的查询缓存 1-24 小时
   - 减少重复请求

### 长期（可选）

5. **多账号轮换**
   - 支持配置多个 Google 账号
   - 轮换使用避免单账号限频

6. **代理池支持**
   - 集成住宅代理池
   - 提升限额（需要额外成本）

---

## 参考资料

- [Google Trends 多关键词对比](https://trends.google.com/trends/explore?q=keyword1,keyword2)
- [令牌桶算法](https://en.wikipedia.org/wiki/Token_bucket)
- [AIMD 拥塞控制](https://en.wikipedia.org/wiki/Additive_increase/multiplicative_decrease)
- [熔断器模式](https://martinfowler.com/bliki/CircuitBreaker.html)

---

## 总结

本次优化通过**批量对比**和**智能限频**两大核心功能，实现了：

- ✅ **效率提升 4 倍**：请求量减少 75%
- ✅ **智能速率控制**：自动适应 Google Trends 限额
- ✅ **降低 429 风险**：多层防护策略
- ✅ **向后兼容**：可通过配置回退到原有行为

代码改动清晰，风险可控，预期能显著改善用户体验。
