# 快速开始 - 限频优化版本

## 新功能概览

### 🚀 批量对比（核心优化）
- **效果**：一次请求分析 4 个候选词（原来是 1 个）
- **提升**：请求量减少 75%，速度提升 4 倍
- **原理**：利用 Google Trends 支持最多 5 个关键词对比的特性

### 🎯 智能限频
- **令牌桶**：平滑控制请求速率，允许短时突发
- **自适应调整**：根据成功/失败自动调整速度
- **指数退避**：遇到 429 自动重试，支持 `Retry-After`
- **熔断保护**：连续失败后暂停请求，避免雪崩

---

## 使用方法

### 开发模式
```bash
npm run dev
```

### 生产构建
```bash
npm run build
```

### 加载扩展
1. 打开 Chrome 扩展管理页面：`chrome://extensions/`
2. 开启"开发者模式"
3. 点击"加载已解压的扩展程序"
4. 选择 `build/chrome-mv3-dev` 或 `build/chrome-mv3-prod`

---

## 配置调整

### 修改批量大小

编辑 `src/config.ts`：

```typescript
export const RATE_LIMIT_CONFIG = {
  batchSize: 4,  // 改为 2 或 3 可以更保守
  // ...
}
```

### 调整请求速率

```typescript
tokenBucket: {
  capacity: 5,      // 令牌桶容量（越大允许越多突发）
  refillRate: 1.5,  // 每秒生成令牌数（越大速度越快）
},
```

### 调整自适应参数

```typescript
adaptive: {
  minInterval: 500,        // 最小间隔（ms）
  maxInterval: 10000,      // 最大间隔（ms）
  initialInterval: 2000,   // 初始间隔（ms）
  increaseStep: 100,       // 加速步长（ms）
  decreaseFactor: 2,       // 减速因子（倍数）
},
```

---

## 监控日志

### 批量处理日志
```
[NKH] processNextKeyword (batch)
  batchSize: 4
  processedCount: 10
  queueSize: 50
```

### 批量分析结果
```
[NKH] 批量分析结果
  batchSize: 4
  results: [
    { keyword: "词1", isEffective: true, score: 85.3 },
    { keyword: "词2", isEffective: false, score: 12.1 },
    { keyword: "词3", isEffective: true, score: 67.8 },
    { keyword: "词4", isEffective: false, score: 5.2 }
  ]
```

### 自适应调整日志
```
[NKH] Speed up: interval 2000ms → 1900ms        // 加速
[NKH] Rate limited! Slow down: interval 1900ms → 3800ms  // 减速
```

### 429 检测日志
```
[NKH] 429 detected, retry 1/3 after 1234ms
[NKH] 命中 Google Trends 限频
```

---

## 常见问题

### Q1: 为什么还是触发 429？
**A**: 可能需要降低速率：
1. 减小 `refillRate`（如 1.5 → 1.0）
2. 增加 `initialInterval`（如 2000 → 3000）
3. 观察自适应调整日志，等待系统自动降速

### Q2: 处理速度太慢？
**A**: 可以适当提高速率（风险自负）：
1. 增加 `refillRate`（如 1.5 → 2.0）
2. 减小 `initialInterval`（如 2000 → 1500）
3. 增加 `capacity`（如 5 → 10）

### Q3: 批量分析结果不准确？
**A**: 批量分析使用相同的算法，结果应该一致。如果发现问题：
1. 检查 `threshold` 设置是否合理
2. 查看批量分析日志中的 `score` 值
3. 对比单个分析和批量分析的结果

### Q4: 如何回退到原有行为？
**A**: 修改 `src/config.ts`：
```typescript
batchSize: 1,  // 改为 1 即可单个处理
```

### Q5: 熔断器触发了怎么办？
**A**: 熔断器会在 60 秒后自动尝试恢复。如果频繁触发：
1. 检查网络连接
2. 降低请求速率
3. 查看是否有其他程序在访问 Google Trends

---

## 性能对比

### 优化前
- 处理 100 个关键词：100 次请求
- 每次间隔 2 秒：总耗时 200 秒
- 固定速率，无法自适应

### 优化后
- 处理 100 个关键词：25 次请求（减少 75%）
- 每次间隔 2 秒：总耗时 50 秒（节省 75%）
- 动态速率，自动优化

---

## 技术支持

如有问题，请查看：
1. `RATE_LIMIT_OPTIMIZATION.md` - 详细技术文档
2. `CLAUDE.md` - 项目架构说明
3. Chrome 控制台日志（按 F12）

---

## 更新日志

### v2.0.1 (2026-03-21)
- 🐛 修复批量出队不尊重 maxKeywords 限制的问题
- 🐛 修复基准词在队列中导致重复对比的问题
- ✅ 添加基准词过滤警告日志
- ✅ 处理批次为空的边界情况

### v2.0.0 (2026-03-21)
- ✅ 新增批量对比功能（1 次请求分析 4 个候选词）
- ✅ 新增令牌桶限流
- ✅ 新增自适应速率调整
- ✅ 新增指数退避重试
- ✅ 新增熔断器保护
- ✅ 优化存储层批量操作
- ✅ 优化关键词分析器批量分析

### v1.0.0
- 基础关键词挖掘功能
- 固定延迟控制
- 基础去重机制
