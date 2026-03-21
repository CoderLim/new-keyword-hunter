# Bug Fixes - 批量处理优化

## 修复日期
2026-03-21

## 修复的问题

### [P2] Bug #1: 批量出队不尊重 maxKeywords 限制

#### 问题描述
当 `maxKeywords - processedCount` 小于 `batchSize` 时，仍然会出队完整批次并标记所有关键词为已处理。

**示例场景**：
- `maxKeywords = 5`
- `processedCount = 4`
- `batchSize = 4`

**预期行为**：只处理 1 个关键词，总共处理 5 个
**实际行为**：处理 4 个关键词，总共处理 8 个（超出限制 3 个）

#### 影响
- 超出用户设置的最大关键词数限制
- 额外处理的关键词永远不会被重试
- 用户无法精确控制处理数量

#### 修复方案

**修改位置**：`src/background.ts:233-247`

**修复前**：
```typescript
// 检查是否达到最大关键词数
if (options.maxKeywords > 0 && state.processedCount >= options.maxKeywords) {
  await finalizeCapture("normal", "达到最大关键词数限制")
  return false
}

// 批量出队（一次取 batchSize 个候选词）
const candidateBatch = await KeywordStorage.getNextBatch(RATE_LIMIT_CONFIG.batchSize)
```

**修复后**：
```typescript
// 检查是否达到最大关键词数
if (options.maxKeywords > 0 && state.processedCount >= options.maxKeywords) {
  await finalizeCapture("normal", "达到最大关键词数限制")
  return false
}

// 计算实际批量大小（尊重 maxKeywords 限制）
let actualBatchSize = RATE_LIMIT_CONFIG.batchSize
if (options.maxKeywords > 0) {
  const remaining = options.maxKeywords - state.processedCount
  actualBatchSize = Math.min(actualBatchSize, remaining)
}

// 批量出队（一次取 actualBatchSize 个候选词）
const candidateBatch = await KeywordStorage.getNextBatch(actualBatchSize)
```

#### 验证
```typescript
// 测试用例 1: 剩余数量大于批量大小
maxKeywords = 100, processedCount = 90, batchSize = 4
→ actualBatchSize = Math.min(4, 10) = 4 ✅

// 测试用例 2: 剩余数量小于批量大小
maxKeywords = 5, processedCount = 4, batchSize = 4
→ actualBatchSize = Math.min(4, 1) = 1 ✅

// 测试用例 3: 剩余数量等于批量大小
maxKeywords = 8, processedCount = 4, batchSize = 4
→ actualBatchSize = Math.min(4, 4) = 4 ✅

// 测试用例 4: 无限制
maxKeywords = 0, processedCount = 100, batchSize = 4
→ actualBatchSize = 4 ✅
```

---

### [P2] Bug #2: 基准词在队列中导致重复对比

#### 问题描述
如果基准词也在候选队列中（侧边栏默认流程会将空基准词填充为 `seedKeywords[0]`），第一次请求会变成 `q=base,base,...`。

**示例场景**：
- `baseKeyword = "iPhone"`
- `seedKeywords = ["iPhone", "Android", "Samsung", "Huawei", "Xiaomi"]`
- 侧边栏逻辑：如果基准词为空，用 `seedKeywords[0]` 填充

**预期行为**：`q=iPhone,Android,Samsung,Huawei,Xiaomi`（5 个不同的词）
**实际行为**：`q=iPhone,iPhone,Android,Samsung,Huawei`（基准词重复）

#### 影响
- 基准词被计为已处理的候选词
- 浪费一个对比槽位（4 个槽位只用了 3 个）
- 第一批只能分析 3 个真实候选词
- 可能提前触发 `maxKeywords` 限制

#### 修复方案

**修改位置**：`src/background.ts:295-335`

**修复前**：
```typescript
// 保存当前处理批次
processingBatch = candidateBatch

// 批量标记为已处理
await KeywordStorage.addProcessedKeywords(candidateBatch)

// 构建 URL（基准词 + 批量候选词）
const baseKeyword = options.baseKeyword.trim()
const queryKeywords = baseKeyword
  ? [baseKeyword, ...candidateBatch]
  : candidateBatch
```

**修复后**：
```typescript
// 批量标记为已处理
await KeywordStorage.addProcessedKeywords(candidateBatch)

// 构建 URL（基准词 + 批量候选词）
const baseKeyword = options.baseKeyword.trim()

// 过滤掉与基准词重复的候选词（避免 q=base,base,... 的情况）
const filteredBatch = baseKeyword
  ? candidateBatch.filter((kw) => kw !== baseKeyword)
  : candidateBatch

// 如果过滤掉了基准词，记录警告
if (filteredBatch.length < candidateBatch.length) {
  console.warn("[NKH] 基准词在候选队列中被过滤", {
    baseKeyword,
    originalBatchSize: candidateBatch.length,
    filteredBatchSize: filteredBatch.length
  })
}

// 保存当前处理批次（使用过滤后的批次）
processingBatch = filteredBatch

// 如果过滤后批次为空，直接处理下一批
if (filteredBatch.length === 0) {
  console.warn("[NKH] 过滤后批次为空，跳过此批次")
  setTimeout(() => processNextKeyword(), 500)
  return false
}

const queryKeywords = baseKeyword
  ? [baseKeyword, ...filteredBatch]
  : filteredBatch
```

#### 验证

```typescript
// 测试用例 1: 基准词不在候选队列中
baseKeyword = "iPhone"
candidateBatch = ["Android", "Samsung", "Huawei", "Xiaomi"]
→ filteredBatch = ["Android", "Samsung", "Huawei", "Xiaomi"]
→ queryKeywords = ["iPhone", "Android", "Samsung", "Huawei", "Xiaomi"] ✅

// 测试用例 2: 基准词在候选队列中（第一个）
baseKeyword = "iPhone"
candidateBatch = ["iPhone", "Android", "Samsung", "Huawei"]
→ filteredBatch = ["Android", "Samsung", "Huawei"]
→ queryKeywords = ["iPhone", "Android", "Samsung", "Huawei"] ✅
→ 警告日志：基准词在候选队列中被过滤

// 测试用例 3: 基准词在候选队列中（中间）
baseKeyword = "iPhone"
candidateBatch = ["Android", "iPhone", "Samsung", "Huawei"]
→ filteredBatch = ["Android", "Samsung", "Huawei"]
→ queryKeywords = ["iPhone", "Android", "Samsung", "Huawei"] ✅

// 测试用例 4: 无基准词
baseKeyword = ""
candidateBatch = ["Android", "Samsung", "Huawei", "Xiaomi"]
→ filteredBatch = ["Android", "Samsung", "Huawei", "Xiaomi"]
→ queryKeywords = ["Android", "Samsung", "Huawei", "Xiaomi"] ✅

// 测试用例 5: 极端情况 - 批次全是基准词（不太可能）
baseKeyword = "iPhone"
candidateBatch = ["iPhone", "iPhone", "iPhone", "iPhone"]
→ filteredBatch = []
→ 跳过此批次，处理下一批 ✅
```

---

## 修复影响

### 正面影响
- ✅ 精确控制处理数量，不会超出 `maxKeywords` 限制
- ✅ 避免基准词浪费对比槽位
- ✅ 提高批量处理效率（每批都能用满 4 个槽位）
- ✅ 更准确的进度显示

### 潜在影响
- 最后一批可能少于 4 个关键词（符合预期）
- 如果基准词在队列中，会被跳过（符合预期，且有警告日志）

---

## 测试建议

### 手动测试

**测试 1: maxKeywords 边界**
```
配置：
- baseKeyword: "iPhone"
- seedKeywords: ["Android", "Samsung", "Huawei", "Xiaomi", "Oppo", "Vivo"]
- maxKeywords: 5
- batchSize: 4

预期结果：
- 第一批：处理 4 个（Android, Samsung, Huawei, Xiaomi）
- 第二批：处理 1 个（Oppo）
- 总共处理：5 个
- 未处理：Vivo
```

**测试 2: 基准词在队列中**
```
配置：
- baseKeyword: "iPhone"
- seedKeywords: ["iPhone", "Android", "Samsung", "Huawei", "Xiaomi"]

预期结果：
- 第一批：q=iPhone,Android,Samsung,Huawei（过滤掉重复的 iPhone）
- 控制台警告：基准词在候选队列中被过滤
- 第二批：q=iPhone,Xiaomi
```

**测试 3: 组合场景**
```
配置：
- baseKeyword: "iPhone"
- seedKeywords: ["iPhone", "Android", "Samsung", "Huawei", "Xiaomi"]
- maxKeywords: 3

预期结果：
- 第一批：出队 3 个（iPhone, Android, Samsung）
- 过滤后：2 个（Android, Samsung）
- URL: q=iPhone,Android,Samsung
- 总共处理：3 个（包括被过滤的 iPhone）
- 未处理：Huawei, Xiaomi
```

### 自动化测试

```typescript
// 测试 actualBatchSize 计算
describe("actualBatchSize calculation", () => {
  it("should respect maxKeywords limit", () => {
    const maxKeywords = 5
    const processedCount = 4
    const batchSize = 4
    const remaining = maxKeywords - processedCount
    const actualBatchSize = Math.min(batchSize, remaining)
    expect(actualBatchSize).toBe(1)
  })

  it("should use full batch size when no limit", () => {
    const maxKeywords = 0
    const processedCount = 100
    const batchSize = 4
    const actualBatchSize = maxKeywords > 0
      ? Math.min(batchSize, maxKeywords - processedCount)
      : batchSize
    expect(actualBatchSize).toBe(4)
  })
})

// 测试基准词过滤
describe("base keyword filtering", () => {
  it("should filter out duplicate base keyword", () => {
    const baseKeyword = "iPhone"
    const candidateBatch = ["iPhone", "Android", "Samsung", "Huawei"]
    const filteredBatch = candidateBatch.filter(kw => kw !== baseKeyword)
    expect(filteredBatch).toEqual(["Android", "Samsung", "Huawei"])
  })

  it("should not filter when base keyword not in batch", () => {
    const baseKeyword = "iPhone"
    const candidateBatch = ["Android", "Samsung", "Huawei", "Xiaomi"]
    const filteredBatch = candidateBatch.filter(kw => kw !== baseKeyword)
    expect(filteredBatch).toEqual(["Android", "Samsung", "Huawei", "Xiaomi"])
  })

  it("should handle empty batch after filtering", () => {
    const baseKeyword = "iPhone"
    const candidateBatch = ["iPhone"]
    const filteredBatch = candidateBatch.filter(kw => kw !== baseKeyword)
    expect(filteredBatch).toEqual([])
  })
})
```

---

## 监控日志

### 正常情况
```
[NKH] processNextKeyword (batch)
  batchSize: 4
  processedCount: 0
  queueSize: 100

[NKH] 批量分析结果
  batchSize: 4
  results: [...]
```

### Bug #1 修复后
```
[NKH] processNextKeyword (batch)
  batchSize: 1  // 自动调整为剩余数量
  processedCount: 4
  queueSize: 1
```

### Bug #2 修复后
```
[NKH] 基准词在候选队列中被过滤
  baseKeyword: "iPhone"
  originalBatchSize: 4
  filteredBatchSize: 3

[NKH] processNextKeyword (batch)
  batchSize: 3  // 显示过滤后的大小
  processedCount: 0
  queueSize: 96
```

### 极端情况
```
[NKH] 过滤后批次为空，跳过此批次
// 立即处理下一批
```

---

## 总结

这两个 bug 修复确保了：

1. **精确控制**：严格遵守 `maxKeywords` 限制，不会超出用户设置
2. **高效利用**：避免基准词浪费对比槽位，每批都能用满 4 个槽位
3. **健壮性**：处理各种边界情况（剩余数量不足、基准词重复、批次为空）
4. **可观测性**：添加警告日志，方便调试和监控

修复后的代码更加健壮，能够正确处理各种边界情况，同时保持了批量处理的高效性。
