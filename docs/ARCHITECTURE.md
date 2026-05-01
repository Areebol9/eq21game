# 🏗 架构分析

> 对 `equation-21-simple/` 的架构级分析：核心模块设计、当前问题、后续重构方向。
> 文件职责说明和修改指引见 **[STRUCTURE.md](STRUCTURE.md)**。

---

## 一、全局状态 `game` 分析

当前所有状态集中在一个全局可变对象 `game` 中：

```javascript
game = {
  mode: 'menu' | 'solo' | 'local' | 'ai',
  phase: 'menu' | 'playing' | 'ended',
  target: 21,
  difficulty: 'easy' | 'normal' | 'hard',
  deck: [...],
  faceIcons: {...},
  players: [{ name, isAi, hand, conceded, feedback, feedbackType, inputDraft }],
  currentPlayerIndex: 0,
  aiPlayerIndex: null,
  aiLevel: 'easy' | 'medium' | 'hard',
  aiSolved: false,
  aiSolution: null,
  timerSec: 0,
  timerInterval: null,
  currentScore: 0,
  scoreBreakdown: { base: 0, opBonus: 0, achievement: 0, total: 0 },
  streak: 0,
  stats: { submits, hintsUsed, maxHints },
  _maxHintShown: false,
  _firstRender: false,
  _solving: false,
}
```

### 已识别的问题

| # | 问题 | 影响 | 建议方向 |
|---|------|------|----------|
| 1 | 全局可变状态过大 | 任何函数都可读写，调试时难以追踪修改来源 | 引入状态更新入口函数，统一管理写操作 |
| 2 | 多人模式和单人模式共用 `stats` 字段 | 语义混淆，多人模式下 stats.submits 含义不清 | 将 stats 移到玩家对象内部 |
| 3 | `_` 前缀的内部标志 | 表明缺少阶段性状态机，靠 ad-hoc 标志修补 | 引入明确的状态机（menu→setup→playing→ended） |
| 4 | 牌库和玩家混在同一对象 | 重置时需手动清理多个字段 | 分离 GameState / DeckState / PlayerState |
| 5 | AI 状态散落在顶层 | `aiSolved` `aiSolution` 与玩家对象脱节 | 将这些字段移入对应玩家对象的属性 |

---

## 二、表达式求值器分析

### 管线

```
输入字符串
  → 预处理（全角→半角、花括号→圆括号、笑脸符号替换）
  → Token 流解析（数字 / 运算符 / 括号 / 函数名）
  → 中缀→后缀转换（调度场算法，支持 ^ √ sqrt( ) !）
  → 后缀求值（值栈）
  → 结果 + 提取数字列表
```

### 设计评估

| 方面 | 评价 |
|------|------|
| 安全性 | ✅ 自研解析器，不使用 `eval()`，无注入风险 |
| 可扩展性 | ⚠️ 添加新运算符需修改 tokenize + 调度场 + 求值三处 |
| 错误处理 | ✅ 覆盖除零、非法字符、括号不匹配、连续运算符等 |
| 测试覆盖 | ✅ `tests/test-expression.js` (183用例) + `tests/test-fuzz.js` (2766实例) |

### 建议重构

- 将运算符定义抽取为配置表（符号、优先级、结合性、元数、求值函数），新增运算符只需加一行配置
- 分离 tokenizer / parser / evaluator 为独立函数体，便于单独测试
- 引入 AST（抽象语法树）作为中间表示，替代直接后缀求值，便于未来支持更复杂语法

> 测试覆盖: `tests/test-expression.js` (183 手工用例) + `tests/test-fuzz.js` (803 模板 × 3 难度 + 模糊测试 ≈ 2766 实例)，运行方式: `node tests/test-expression.js` 和 `node tests/test-fuzz.js`。

---

## 三、AI 求解器分析（v3.4 重写）

### 当前策略：双层架构

求解器现在由两层组成，分别用于不同的求解目标：

| 层级 | 函数 | 策略 | 用途 |
|------|------|------|------|
| 第一层 | `aiSolve()` | 全排列 + 枚举运算符 + 括号，暴力搜索 | 快速找解（提示/AI答题） |
| 第二层 | `findCoolExpressionsDP()` | Bitmask DP 子集枚举 | 找高质量妙解（炫技解法） |
| 调度 | `solveHandDetailed()` | 组合双档输出（simpleSolutions + coolSolutions） | 游戏内统一调用入口 |

### 性能评估

| 手牌数 | 组合量级 | 第一层耗时 | 第二层耗时 |
|--------|----------|------------|------------|
| 3 张 | ~数百 | 瞬时 | 瞬时 |
| 4 张 | ~数千 | <100ms | <200ms |
| 5 张 | ~数万 | ~300ms（时间预算控制） | ~800ms（DP 剪枝+trimMap 上限 180） |

> 5 张牌场景通过 **Web Worker** 将求解移到后台线程，主线程完全不阻塞。时间预算通过 `maxMs` 参数和 `Date.now()` 检查实现，超时自动返回已有结果。

### 时间预算

```javascript
const SOLVE_BUDGETS = {
  autoHintMs: 80,     // 自动验算预算（游戏开始/加牌后后台验算）
  manualHintMs: 300,  // 玩家点击提示按钮的预算
  aiThinkMs: 500      // AI 对手思考预算
};
```

预算内未找到解 → 降级到更简单的搜索 → 两次降级仍无解 → 返回空（等同"无解"）。

---

### 三-A、妙解评分系统

#### 评分公式

`rateSolution(expr, difficulty, handLength)` 对各维度评分：

| 维度 | 条件 | 加分 |
|------|------|------|
| 乘除运算 | 使用了 `*` 或 `/` | +30 |
| 幂运算 `^` | 使用了 `^` | +180 |
| 开方 `√` / `sqrt()` | 使用了开根号 | +200 |
| 阶乘 `!` | 使用了阶乘 | +300 |
| 五牌逆转 | 5 张手牌才解出 | +80 |
| 普通模式加成 | normal 难度用 ^/√ | +80 |
| 困难模式加成 | hard 难度用 ! | +100 |
| 精彩除法 | 除以较大的数 | +40 |
| 巧妙组合 | 含 7×3 / 20 / 24 等经典模式 | +60 |

#### 标签层级

| 标签 | 条件 | 含义 |
|------|------|------|
| 💥阶乘狂人 | 用了 `!` | 阶乘专属 |
| 📐开方妙用 | 用了 `√` / `sqrt()` | 开方专属 |
| 🔮幂指神算 | 用了 `^` | 幂运算专属 |
| 🃏五牌逆转 | 5 张牌才解出 | 手牌专属 |
| 🎩妙手天成 | score ≥ 420 | 顶级炫技解法 |
| ✨炫技解法 | score ≥ 260 | 高阶炫技解法 |
| 🧠奇思妙算 | score ≥ 160 | 中级巧妙解法 |

#### DP 搜索实现

`findCoolExpressionsDP(hand, target, ops, options)`:
- 用 Bitmask 表示子集（`dp[mask] = Map<valueKey, {value, expr, rank}>`）
- 对每个子集枚举拆分 `(sub, mask ^ sub)`，组合产生新表达式
- `trimMap()` 限流至每个子集最多 180 个候选
- `rankExpr()` 按评分排序，最终输出 top-N 妙解

---

### 三-B、Web Worker 架构

```
主线程 (main/game.js)                  Worker 线程 (solver-worker.js)
    │                                         │
    │  postMessage({ hand, target,              │
    │    maxMs, difficulty })  ──────────►     onmessage → solveHandDetailed()
    │                                         │
    │  ◄──────────  postMessage({              │
    │    simpleSolutions, coolSolutions,         │
    │    timedOut, handKey })                  │
    │                                         │
```

- `game.js` 中 `ensureSolutionWorker()` 惰性创建 Worker（使用 `new Worker('js/solver-worker.js')`）
- `requestSolutionAnalysis()` 发送求解请求，递增 `solutionTaskId`
- Worker 返回时校验 `handKey` + `msg.id === game.solutionTaskId`，丢弃 stale 响应
- `solver-worker.js` 通过 `importScripts('config.js', 'expression.js')` 加载依赖

### 性能诊断

`game.__eq21Perf` 追踪：
- 慢手牌列表（求解耗时 > 阈值）
- Worker 超时次数 / 降级事件
- 控制台 `__eq21Perf.print()` 查看汇总报告

---

## 四、提示系统分析

单人模式提供三级渐进式提示：

| 级别 | 内容 | 触发条件 |
|------|------|----------|
| 方向提示 | 建议运算思路 | 第 1 次点击提示 |
| 步骤提示 | 部分中间步骤 | 第 2 次点击提示 |
| 完整答案 | 直接给出解 | 第 3 次点击提示 |

### 当前实现问题

- 提示内容基于 `aiSolve()` 结果生成，但提示逻辑耦合在 `game.js` 中
- 无解时提示"当前牌组无法算出21"，但未区分「确实无解」和「搜索超时」

---

## 五、关键设计决策回顾

| 决策 | 理由 | 代价 |
|------|------|------|
| 单文件结构（已拆分为 8 文件 + PWA） | 分发方便，零构建 | 全局作用域，命名冲突风险 |
| 全局 `game` 对象 | 简单直观 | 状态追踪困难 |
| 自研表达式解析器 | 避免 `eval()` 安全风险 | 维护成本较高 |
| 纯浏览器端运行 | 零环境依赖 | 持久化仅限 localStorage |
| PWA 离线支持 | 可添加到手机桌面，离线游玩 | 需维护 sw.js 缓存策略 |
| 围桌模式双轨渲染 | `renderAll()` 分支：solo/AI → 通用，local → `renderTabletop2P()` | 两种渲染路径需保持功能一致 |
| SVG 图标系统 | `js/icons.js` 注册表 + `svgIcon()` 自动检测 `<defs>` 切换渲染模式 | 模式图标 3D 效果与花色图标独立定义 |
| 获胜算式展示 | `winningFormula` 存储在 player 对象，`showResult()` 读取 | 平局需显式隐藏残留 |
| CSS Grid/Flexbox | 现代响应式布局 | 不支持 IE |

---

## 六、重构优先级

| 优先级 | 项目 | 理由 |
|--------|------|------|
| ~~🔴 P0~~ | ~~给表达式求值器写单元测试~~ | ✅ **已完成** — `tests/test-expression.js` + `tests/test-fuzz.js` |
| ~~🔴 P0~~ | ~~规范化状态管理~~ | ✅ **已完成** — `State.get/set/reset` 入口函数 + 40+ 处替换（`config.js`） |
| ~~🟡 P1~~ | ~~运算符配置表化~~ | ✅ **已完成** — `OPERATORS` 注册表 7 运算符（`config.js`） |
| ~~🟡 P1~~ | ~~AI 搜索加剪枝 / Web Worker~~ | ✅ **已完成** — Web Worker + DP搜索 + 时间预算 + 妙解评分（v3.4） |
| ~~🟢 P2~~ | ~~引入构建工具（Vite）~~ | ~~仅在需要发布生产版本时必要~~ |
| ~~🟢 P2~~ | ~~引入 TypeScript~~ | ~~类型安全，但增加构建步骤~~ |

---

## 七、扩展性设计要点（架构视角）

### 如何添加新运算符

当前需改 3 处（tokenize + 调度场 + 求值）。建议的配置化方案：

```javascript
// 理想形态：运算符注册表
const OPERATORS = {
  '^': { prec: 4, assoc: 'right', arity: 2, fn: (a, b) => Math.pow(a, b) },
  '√': { prec: 4, assoc: 'right', arity: 1, fn: (a) => Math.sqrt(a) },
  '!': { prec: 5, assoc: 'left',  arity: 1, fn: factorial },
  // 新增运算符只需加一行
};
```

### 如何添加新游戏模式

当前需改 4 个文件（config.js + game.js + index.html + main.js）。建议抽取模式注册机制，将每种模式封装为独立对象：

```javascript
const GAME_MODES = {
  solo:  { setupOverlay: '#solo-setup',  startFn: startSoloGame,  ... },
  local: { setupOverlay: '#table-setup-overlay', startFn: startLocalGame, ... },  // 围桌模式
  ai:    { setupOverlay: '#ai-setup',    startFn: startAIGame,    ... },
};
```

---

## 八、历史与评分系统（v3.2 新增）

### 模块位置

`js/history.js` — 独立于游戏逻辑，仅依赖 `config.js`。

### 评分公式

```
总分 = 底分 + 运算符加分 + 成就加分

底分：
  - 获胜             +500 分
  - 失败/认输         +50 分（参与分）

运算符加分（仅获胜时）：
  + 使用 × 或 ÷       +50 分
  + 使用 ^（幂）      +150 分
  + 使用 √（根号）    +200 分
  + 使用 !（阶乘）    +300 分

成就加分（仅获胜时）：
  + 3张牌直解         +150 分
  + 首次提交即成功     +200 分
  + 连胜 combo        +100 × 连胜次数
  + 用时 ≤ 15秒       +200 分
  + 用时 ≤ 30秒       +100 分
```

### 标签判定

| 标签 | 条件 |
|------|------|
| ⚡三牌封喉 | 3张牌就解开 |
| 🎯一击必杀 | 首次提交即成功 |
| ⚡闪电心算 | 用时 ≤ 15秒 |
| 💨速算达人 | 用时 ≤ 30秒 |
| 🔢乘除巧算 | 用了 × 或 ÷ |
| 🔮幂指神算 | 用了 ^ |
| 📐开方妙用 | 用了 √ |
| 💥阶乘狂人 | 用了 ! |
| 🔥X连胜 | combo ≥ 3 |
| 🃏五牌逆转 | 5张牌才解出 |

### 数据持久化

```js
localStorage['equation21_history'] = {
  version: 1,
  streak: 3,
  records: [
    {
      id: "20260427-001", ts: 1714204800000,
      mode: "solo", difficulty: "normal", result: "win",
      player: "玩家", hand: [5,9,7], formula: "5+9+7",
      score: 510, timeSec: 45, submits: 1, hintsUsed: 0,
      tags: ["三牌封喉"]
    }
  ]
}
```

### 竞技统计规则

- 竞技统计（总局数/胜率/最高分/最快用时）**仅计入非单人模式**的局
- 单人练习（`mode: 'solo'`）记录保留在历史列表中，但不出现在统计卡中
- `getStats(mode)` 接受 `mode` 参数区分口径

### 设计考量

| 方面 | 说明 |
|------|------|
| 纯加分 | 无扣分机制，失败也有参与分，鼓励尝试 |
| 运算符加分叠加 | 同时使用多种高级运算符可叠加加分 |
| 标签不互斥 | 一局可同时获得多个标签 |
| 连胜跨会话 | streak 存储在 localStorage，关闭浏览器后保留 |
| 清空不可逆 | 清空历史会同时重置 streak |

---

## 九、浏览器兼容性

| 浏览器 | 最低版本 | 关键特性 |
|--------|----------|----------|
| Chrome / Edge | 90+ | CSS Grid, Custom Properties, Web Audio API |
| Firefox | 90+ | 同上 |
| Safari | 14+ | CSS Grid 完全支持 |
| Internet Explorer | ❌ 不支持 | 缺少 CSS Grid、ES6+ |