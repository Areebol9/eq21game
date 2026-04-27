# 📂 项目结构说明

> `equation-21-simple/` 目录下每个文件做什么，改一个功能应该改哪个文件。

---

## 目录结构

```
equation-21-simple/
├── index.html              # 页面结构（HTML DOM）
├── style.css               # 所有样式（CSS）
├── app.js                  # 原始单文件备份（不参与运行，仅供参考）
└── js/
    ├── config.js           # 全局状态 & 常量配置
    ├── expression.js       # 表达式求值器 & AI求解器
    ├── ui.js               # UI渲染函数
    ├── game.js             # 游戏逻辑引擎
    ├── history.js          # 历史记录 & 评分系统
    └── main.js             # 入口初始化 & 事件绑定
```

---

## 文件职责 & 修改指引

### `index.html` — 页面结构

定义所有 DOM 元素，包含：
- 菜单选择页 `#menu-overlay`
- 设置页（单人/本地多人/AI）
- 游戏主界面 `#players-area` `#log-panel` `#footer-bar`
- 弹层（结果 `#result-overlay`、规则 `#rules-overlay`、胜利 `#victory-overlay`）

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

### `js/expression.js` — 表达式引擎 & AI求解器（加载第 2 个）

| 函数 | 职责 |
|------|------|
| `tokenize()` | 词法分析：字符串 → Token 流 |
| 求值管线 | 中缀→后缀（调度场算法）→ 后缀求值 |
| `extractNumbers()` | 从表达式中提取所有使用的数字 |
| `validateHand()` | 验证是否使用全部手牌、有无额外/复用数字 |
| `checkFormula()` | 完整校验（求值 + 手牌验证），返回结果/错误 |
| `aiSolve()` | AI 暴力搜索：全排列手牌 + 枚举运算符组合 |

> **什么情况改这里**：修改求值逻辑（如新增运算符）、改手牌验证规则、优化 AI 搜索策略。

---

### `js/ui.js` — UI渲染（加载第 3 个）

| 函数 | 职责 |
|------|------|
| `renderPlayers()` | 渲染所有玩家手牌卡片 |
| `renderFooterBar()` | 渲染底部操作栏（提交/加牌/认输/提示） |
| `showToast()` | 弹出式消息提示 |
| `addLog()` | 底部日志记录 & 自动滚动 |
| `showOverlay()` `hideOverlay()` | 弹层显隐控制 |
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

### `js/game.js` — 游戏逻辑引擎（加载第 5 个）

| 函数 | 职责 |
|------|------|
| `startSoloGame()` | 启动单人模式 |
| `startLocalGame()` | 启动本地多人模式 |
| `startAIGame()` | 启动 AI 对战模式 |
| `submitFormula()` | 提交算式 → 求值 → 判定胜负 |
| `drawCard()` | 玩家追加一张牌 |
| `giveUp()` | 玩家认输处理 |
| `useHint()` | 渐进式提示（方向→步骤→答案） |
| AI 行为 | AI 思考、答题、加牌决策 |
| `resetGame()` | 重置回菜单 |

> **什么情况改这里**：改游戏流程、改胜负判定、改 AI 行为策略、改提示系统逻辑。

---

### `js/main.js` — 入口初始化 & 事件绑定（加载第 6 个）

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
<script src="js/expression.js"></script>   <!-- 2. → config.js -->
<script src="js/ui.js"></script>           <!-- 3. → config.js + expression.js -->
<script src="js/game.js"></script>         <!-- 4. → config.js + expression.js + ui.js -->
<script src="js/history.js"></script>      <!-- 5. → config.js + ui.js -->
<script src="js/main.js"></script>         <!-- 6. → 所有以上文件 -->
```

每个文件只依赖排在前面的文件，无循环依赖。

---

## 常见修改速查

| 要改什么 | 去哪个文件 |
|----------|------------|
| 加一个"关于"弹层 | `index.html`（DOM）+ `style.css`（样式）+ `main.js`（事件绑定） |
| 新增运算符（如 %） | `config.js`（注册）+ `expression.js`（求值逻辑）+ `style.css`（符号按钮） |
| 调整手牌上限 | `config.js`（常量）+ `game.js`（drawCard 限制） |
| 修改 AI 难度 | `config.js`（getOps 配置）+ `game.js`（AI 行为参数） |
| 换颜色主题 | `style.css`（CSS 变量区） |
| 加音效 | `main.js`（事件绑定）+ `ui.js`（triggerVictoryEffect） |
| 改表达式求值 bug | `expression.js`（tokenize/求值管线） |
| 加新的游戏模式 | `index.html`（设置弹层）+ `config.js`（状态字段）+ `game.js`（流程函数）+ `main.js`（入口绑定） |
| 调整评分公式 | `history.js`（computeScore） |
| 新增成就标签 | `history.js`（computeTags）+ `style.css`（.tag-pill 样式） |
| 改历史存储结构 | `history.js`（saveRecord/loadHistory） |

---

## 设计约束

| 约束 | 说明 |
|------|------|
| 零外部依赖 | 纯 HTML+CSS+JS，不需要 Node.js/npm/打包 |
| 全局作用域 | 通过 `<script>` 加载顺序共享变量，不使用 ES Module |
| 浏览器直接打开 | 不依赖本地服务器 |
| 保留备份 | `app.js` 保留原始单文件代码 |