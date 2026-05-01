# 📂 项目结构说明

> `equation-21-simple/` 目录下每个文件做什么，改一个功能应该改哪个文件。

---

## 目录结构

```
equation-21-simple/
├── index.html              # 页面结构（HTML DOM）
├── style.css               # 所有样式（CSS）
├── manifest.json           # PWA 清单（桌面图标、离线支持）
├── sw.js                   # Service Worker（离线缓存）
├── app.js                  # 原始单文件备份（不参与运行，仅供参考）
├── tests/
│   ├── test-expression.js  # 183 条单元测试（表达式求值 + 手牌验证 + AI求解 + 妙解评分）
│   ├── test-fuzz.js        # 2766 条 Fuzz 测试（自动生成式全链路）
│   ├── test-static.js      # 48 条静态测试（资源引用、PWA、JS 语法）
│   ├── test-dom-flow.js    # 87 条 fake DOM 流程测试（围桌入口、历史、Worker stale）
│   ├── test-worker-flow.js # 28 条 Worker 契约测试（妙解返回、超时边界）
│   ├── test-online-room-core.js # 联网房间核心状态机测试
│   ├── test-online-protocol.js  # 联网协议/多客户端流程测试
│   ├── test-online-load.js      # 500 客户端 / 125 房间模拟压测
│   ├── test-solver-perf.js # 性能回归测试（默认 138 样本，支持 --stress）
│   ├── _bench_6332J.js     # 6332J 手牌微基准测试
│   └── BUG_REPORT.md       # Bug 修复记录
├── docs/
│   ├── assets/             # 截图等资源文件
│   ├── ARCHITECTURE.md     # 架构分析
│   ├── GAME_RULES.md       # 游戏规则
│   ├── ROADMAP.md          # 开发路线图
│   ├── STRUCTURE.md        # 项目结构说明
│   └── TEST_PLAN.md        # 手工测试清单
├── worker/
│   ├── index.js            # Cloudflare Worker + Durable Object 入口
│   └── room-core.cjs       # 联网房间规则核心（可直接 Node 测试）
└── js/
    ├── config.js           # 全局状态 & 运算符注册表 & 音效
    ├── icons.js            # SVG 图标注册 & 渲染（模式/花色/UI图标）
    ├── expression.js       # 表达式求值器 & AI求解器 & 妙解评分
    ├── solver-worker.js    # Web Worker 求解器（由 game.js 动态创建，非 <script> 加载）
    ├── history.js          # 历史记录 & 评分系统
    ├── ui.js               # UI渲染函数
    ├── online.js           # 联网客户端（房间、WebSocket、重连、快捷短语）
    ├── game.js             # 游戏逻辑引擎 & Worker 管理
    └── main.js             # 入口初始化 & 事件绑定
```

---

## 文件职责 & 修改指引

### `index.html` — 页面结构

定义所有 DOM 元素，包含：
- 菜单选择页 `#menu-overlay`
- 设置页（单人直接开始 / 围桌模式 `#table-setup-overlay` / AI对战 `#ai-setup-overlay`）
- 游戏主界面 `#players-area` `#tabletop-center` `#log-panel` `#footer-bar`
- 弹层（结果 `#result-overlay`、规则 `#rules-overlay`、胜利 `#victory-overlay`）
- 菜单底部 `#menu-footer`（对局历史 + 游戏规则链接）
- 音效按钮 `#btn-sound`、历史按钮 `#btn-history`

> **什么情况改这里**：新增一个按钮/弹层/输入框、调整页面某个 DOM 结构。

---

### `style.css` — 所有样式

| 区块 | 内容 |
|------|------|
| CSS 变量 | 颜色主题、间距、字号 |
| 布局 | CSS Grid / Flexbox 响应式布局 |
| 组件 | 按钮、卡片、输入框、弹层、日志 |
| 动画 | 撒花、脉冲、抖动 |
| 响应式 | `@media` 适配平板横屏/竖屏、手机竖屏 |

> **什么情况改这里**：调整颜色/字号/间距、修改某个组件的视觉效果、适配新屏幕尺寸。

---

### `js/config.js` — 全局状态 & 常量（加载第 1 个）

| 内容 | 说明 |
|------|------|
| `game` 对象 | 全局可变状态（模式、阶段、玩家、牌库、计时、统计） |
| `createDeck()` `shuffle()` `drawCard()` | 牌库操作 |
| 牌面映射 | `faceIcons`（数值↔扑克图标） |
| `getOps()` | 根据难度返回可用运算符列表 |
| `normalizeInput()` `formatNum()` `cardFace()` | 辅助函数 |

> **什么情况改这里**：新增运算符、改牌库规则、加新的全局状态字段、调整难度配置。

---

### `js/expression.js` — 表达式引擎 & AI求解器 & 妙解评分（加载第 3 个）

| 函数 | 职责 |
|------|------|
| `tokenize()` | 词法分析：字符串 → Token 流 |
| 求值管线 | 中缀→后缀（调度场算法）→ 后缀求值 |
| `extractNumbers()` | 从表达式中提取所有使用的数字 |
| `validateHand()` | 验证是否使用全部手牌、有无额外/复用数字 |
| `checkFormula()` | 完整校验（求值 + 手牌验证），返回结果/错误 |
| `aiSolve()` | AI 暴力搜索：全排列手牌 + 枚举运算符组合，支持简单/酷炫两种风格 |
| `findCoolExpressionsDP()` | DP 子集枚举搜索高质量妙解（Bitmask DP + trimMap 剪枝） |
| `rateSolution()` | 解法评分（算子 + 手牌数 + 难度 + 经典模式，6 种算子加权） |
| `solveHandDetailed()` | 双档输出统一入口：`simpleSolutions` + `coolSolutions` |
| `analyzeSolutionOps()` | 解析解法的运算符使用情况 |

> **什么情况改这里**：修改求值逻辑（如新增运算符）、改手牌验证规则、优化搜索策略、调整妙解评分公式。

---

### `js/ui.js` — UI渲染（加载第 5 个）

| 函数 | 职责 |
|------|------|
| `renderAll()` | 主渲染入口：solo/AI模式调用通用渲染，local模式调用围桌渲染 |
| `renderTabletop2P()` | 围桌模式专用渲染（双人对坐布局 + 旋转 + 中央信息栏） |
| `updateFooterBar()` | 更新底部状态栏文案 |
| `showToast()` | 弹出式消息提示 |
| `addLog()` | 底部日志记录 & 自动滚动 |
| `updateTabletopCenter()` | 更新围桌模式中央信息栏（用时/牌库/目标） |
| `tableAppendExpr()` | 围桌模式表达式构建（点击牌面+符号追加） |
| `triggerVictoryEffect()` | 胜利撒花动画 + 音效 |
| `updateTimerUI()` | 更新计时器显示 |
| `updateDeckCount()` | 更新剩余牌数 |

> **什么情况改这里**：调整 UI 布局/样式、改 Toast 外观、加新的视觉反馈、修改胜利特效。

---

### `js/history.js` — 历史记录 & 评分系统（加载第 4 个）

| 函数 | 职责 |
|------|------|
| `saveRecord()` | 将对局记录写入 localStorage |
| `loadHistory()` | 从 localStorage 读取历史数据 |
| `clearHistory()` | 清空所有历史记录 |
| `computeScore()` | 按评分公式计算总分（底分+运算符加分+成就加分） |
| `computeTags()` | 判定并返回成就标签列表 |
| `computeStreak()` | 计算指定玩家当前连胜次数 |
| `getStats()` | 统计竞技数据（总局数、胜率、最高分、最快用时） |
| `getBestRecord()` | 获取最高分记录（过滤单人练习） |
| `getRecentRecords()` | 获取最近 N 条记录 |
| `renderHistoryPanel()` | 渲染完整历史面板 UI（统计卡+最漂亮解法+最近记录） |

> **什么情况改这里**：调整评分公式、新增/修改成就标签、改历史存储结构、修改统计口径。

---

### `js/icons.js` — SVG 图标系统

| 内容 | 说明 |
|------|------|
| `EQ21_ICON_PATHS` | 图标 SVG path 注册表（~30 个图标，含模式/花色/UI图标） |
| `svgIcon()` | 生成完整 SVG 标签，自动检测 `<defs>` 完整渲染 |
| `setSvgIcon()` | 将 SVG 注入 DOM 元素 |
| `initSvgIcons()` | 扫描 `[data-icon]` 属性并批量渲染 |

> **注意**：4 个模式图标（single/table/ai/online）使用完整多层 SVG defs 渲染（渐变+高光+描边），与花色图标（suitSpade等）独立定义互不影响。**什么情况改这里**：新增/修改图标、调整模式图标3D效果。

### `js/game.js` — 游戏逻辑引擎（加载第 7 个）

| 函数 | 职责 |
|------|------|
| `startSoloGame()` | 启动单人模式 |
| `startLocalGame()` | 启动围桌模式（读双人名字，支持2/3/4人布局） |
| `startAIGame()` | 启动 AI 对战模式 |
| `submitFormula()` | 提交算式 → 求值 → 判定胜负 |
| `drawCard()` | 玩家追加一张牌 |
| `giveUp()` | 玩家认输处理 |
| `useHint()` | 渐进式提示（方向→步骤→答案），含 Worker 异步求解 |
| AI 行为 | AI 思考、答题、加牌决策 |
| `resetGame()` | 重置回菜单 |
| `ensureSolutionWorker()` | 惰性创建 Web Worker 求解器 |
| `requestSolutionAnalysis()` | 发送求解请求到 Worker，防 stale response |

> **什么情况改这里**：改游戏流程、改胜负判定、改 AI 行为策略、改提示系统逻辑。

---

### `js/online.js` — 联网客户端（加载第 6 个）

| 函数 | 职责 |
|------|------|
| `openOnlineSetup()` | 打开联网创建/加入房间弹层 |
| `createOnlineRoom()` / `joinOnlineRoom()` | 调用 Worker API 创建房间或连接房间 |
| `connectOnlineRoom()` | 建立 WebSocket，发送 join，处理短线重连 |
| `applyOnlineSnapshot()` | 将服务端房间快照映射到前端 `game` 状态 |
| `onlineSubmitFormula()` 等 | 将玩家操作发送为 WebSocket action |

> **什么情况改这里**：调整联网 UI 流程、WebSocket 协议字段、重连策略、快捷短语。

---

### `worker/` — Cloudflare 联网房间服务

| 文件 | 职责 |
|------|------|
| `worker/index.js` | Worker 路由：`POST /api/rooms`、`GET /ws/:roomCode`，Durable Object 广播 |
| `worker/room-core.cjs` | 纯规则核心：房间创建、加入、准备、开局、发牌、提交验算、认输、快捷短语 |
| `wrangler.toml` | Cloudflare Worker / Durable Object 部署配置 |

> **什么情况改这里**：修改服务端权威状态、房间协议、部署绑定或压测目标。

---

### `js/solver-worker.js` — Web Worker 求解器

| 内容 | 说明 |
|------|------|
| `importScripts()` | 加载 `config.js` + `expression.js` 依赖 |
| `onmessage` | 接收 `{hand, target, maxMs, difficulty}` → 调用 `solveHandDetailed()` → 返回双档结果 |

> **注意**：此文件由 `game.js` 通过 `new Worker('js/solver-worker.js')` 动态创建，不在 `<script>` 标签中加载。**什么情况改这里**：需要调整 Worker 求解行为（如修改超时逻辑、过滤条件）。

---

### `js/main.js` — 入口初始化 & 事件绑定（加载第 8 个）

| 内容 | 说明 |
|------|------|
| DOM 事件绑定 | 菜单按钮、设置按钮、操作按钮的 click 事件 |
| 键盘快捷键 | Enter 提交、Esc 关闭弹层 |
| 输入辅助 | 点击手牌插入符、符号按钮点击 |
| 入口 | `DOMContentLoaded` 时初始化 |

> **什么情况改这里**：绑新的按钮事件、加新的快捷键、修改页面初始化逻辑。

---

## script 加载顺序

```html
<script src="js/config.js"></script>      <!-- 1. 零依赖 -->
<script src="js/icons.js"></script>       <!-- 2. 零依赖 -->
<script src="js/expression.js"></script>   <!-- 3. → config.js -->
<script src="js/history.js"></script>      <!-- 4. → config.js -->
<script src="js/ui.js"></script>           <!-- 5. → config.js + icons.js + expression.js -->
<script src="js/online.js"></script>       <!-- 6. → config.js + ui.js + history.js -->
<script src="js/game.js"></script>         <!-- 7. → config.js + expression.js + ui.js + history.js -->
<script src="js/main.js"></script>         <!-- 8. → 所有以上文件 -->
```

每个文件只依赖排在前面的文件，无循环依赖。

> **注意**：`solver-worker.js` 不在 `<script>` 中加载。它由 `game.js` 通过 `new Worker('js/solver-worker.js')` 在运行时动态创建为 Web Worker，Worker 内部通过 `importScripts('config.js', 'expression.js')` 加载依赖。

---

## 常见修改速查

| 要改什么 | 去哪个文件 |
|----------|------------|
| 加一个"关于"弹层 | `index.html`（DOM）+ `style.css`（样式）+ `main.js`（事件绑定） |
| 新增运算符（如 %） | `config.js`（注册）+ `expression.js`（求值逻辑）+ `style.css`（符号按钮） |
| 调整手牌上限 | `config.js`（常量）+ `game.js`（drawCard 限制） |
| 修改 AI 难度 | `config.js`（getBinaryOps 配置）+ `game.js`（AI 行为参数） |
| 换颜色主题 | `style.css`（CSS 变量区） |
| 加音效 | `config.js`（soundPlay 定义）+ `game.js`（音效触发点） |
| 改表达式求值 bug | `expression.js`（tokenize/求值管线） |
| 加新的游戏模式 | `index.html`（设置弹层 DOM）+ `config.js`（状态字段）+ `game.js`（流程函数）+ `ui.js`（renderXxx 渲染函数）+ `main.js`（入口绑定） |
| 改联网房间逻辑 | `worker/room-core.cjs`（规则）+ `worker/index.js`（广播/存储）+ `js/online.js`（客户端协议） |
| 调整评分公式 | `history.js`（computeScore） |
| 新增成就标签 | `history.js`（computeTags）+ `style.css`（.tag-pill 样式） |
| 改历史存储结构 | `history.js`（saveRecord/loadHistory） |

---

## 设计约束

| 约束 | 说明 |
|------|------|
| 单机零外部依赖 | 单机/围桌/AI 为纯 HTML+CSS+JS；联网 Worker 开发需要 Node/npm + Wrangler |
| 全局作用域 | 通过 `<script>` 加载顺序共享变量，不使用 ES Module |
| 浏览器直接打开 | 不依赖本地服务器（file:// 下 SW 不可用，需 http://） |
| 自动化测试 | `npm.cmd test` 或逐个运行 `tests/` 下脚本 |
| 保留备份 | `app.js` 保留原始单文件代码 |
