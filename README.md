# 新词挖掘助手 (New Keyword Hunter)

一个基于 Plasmo 框架开发的 Chrome 扩展程序，用于从 Google Trends 中挖掘新兴关键词。

## 功能特点

- **递归挖掘**: 通过 Google Trends 相关搜索递归发现新关键词
- **新词识别**: 自动识别"新兴词"（前5个时间点搜索量为0，后期有增长趋势的词）
- **无限制**: 关键词数量无限制，完全由用户控制
- **数据导出**: 支持 JSON 和可读文本报告两种格式导出
- **侧边栏界面**: 使用 Chrome Side Panel API 提供便捷的操作界面

## 安装开发

```bash
# 克隆项目
cd new-keyword-hunter

# 安装依赖
npm install

# 开发模式
npm run dev
```

然后在 Chrome 中加载 `build/chrome-mv3-dev` 目录作为未打包的扩展程序。

## 构建生产版本

```bash
npm run build
```

构建产物在 `build/chrome-mv3-prod` 目录。

## 使用方法

1. 点击 Chrome 工具栏中的扩展图标，打开侧边栏
2. 输入基准词（用于标识）和种子关键词（起始关键词）
3. 选择时间范围、地区、阈值等参数
4. 点击"开始挖掘"
5. 扩展会自动打开 Google Trends 并开始递归挖掘
6. 实时查看挖掘状态和有效新词列表
7. 完成后可导出数据

## 技术栈

- **框架**: Plasmo 0.90.5
- **UI**: React 18 + TypeScript
- **样式**: CSS Modules
- **存储**: @plasmohq/storage

## 项目结构

```
src/
├── background.ts          # 后台服务，监听网络请求
├── side-panel.tsx         # 侧边栏 UI
├── side-panel.module.css  # 侧边栏样式
├── side-panel.html        # 侧边栏 HTML 模板
├── components/
│   ├── InputSection.tsx   # 输入表单组件
│   ├── StatusDisplay.tsx  # 状态显示组件
│   ├── HistoryList.tsx    # 历史记录组件
│   └── EffectiveWords.tsx # 有效新词列表组件
├── lib/
│   ├── trends.ts          # Google Trends API 处理
│   ├── keyword-analyzer.ts# 新词分析算法
│   └── storage.ts         # 存储封装
└── types.ts               # TypeScript 类型定义
```

## 新词识别规则

一个关键词被认为是"有效新词"需要满足：

1. 前5个时间点的搜索量都为0（表示是新兴词）
2. 最后5个时间点的平均值 >= 用户设定的阈值（表示有增长趋势）

## 权限说明

- `webRequest`: 监听 Google Trends API 请求
- `storage`: 存储挖掘结果和配置
- `tabs`: 打开和管理 Google Trends 标签页
- `downloads`: 导出数据文件
- `sidePanel`: 使用侧边栏功能

## License

MIT
