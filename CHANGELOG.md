# 📝 算式21点 — 更新日志

本项目所有值得关注的变更都会记录在此文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

---

## [v3.6] — 2026-05-02

### 新增
- 🌐 **中英文切换**：主菜单/设置弹窗/规则说明/游戏内按钮状态标签/结果弹窗/快捷聊天支持英文，语言选择记忆到 localStorage
- 🎨 **主界面图标3D化**：4个模式选择图标从扁平纯色升级为5层3D SVG（蓝宝石♠ / 红玻璃♥ / 金属金♦ / 绿玉石♣），含径向渐变+镜面高光+边缘亮线
- 📝 **获胜算式展示**：结果弹窗中展示获胜者提交的算式 `＝21`，含本地/AI/联网模式
- 🔒 **手机输入法禁用**：练习/AI模式禁用虚拟键盘弹出，仅保留物理键盘输入

### 优化
- 📱 **手机端AI布局反转**：AI对战手机端玩家牌桌移至下方，符合单手操作习惯
- 🃏 **主界面装饰牌**：移除对角线纹理、提高花色数字不透明度、减淡内阴影，清晰度大幅提升
- 🤝 **平局图标**：手握手图标从4段重叠描边替换为3段清洁路径
- 📐 **AI模式图标**：`svgIcon()` 支持完整SVG defs渲染，渐变ID独立避免冲突

### 修复
- 🐛 平局结算残留上局获胜算式
- 🐛 4个模式图标渐变ID冲突导致全蓝
- 🐛 镜面高光椭圆不贴合形状轮廓

### 工程
- 新增 `js/icons.js`：SVG 图标注册与渲染系统（从 `js/ui.js` 内联图标提取）

---

## [v3.5] — 2026-04-28

### 新增
- 🌐 **联网年会 MVP**：新增 Cloudflare Workers + Durable Objects 房间服，支持 2~4 人开房、加入、准备、开局、短线重连和快捷短语。
- ♣ **前端联网入口**：主菜单“联网对战”改为可用入口，新增创建/加入房间弹层、服务地址配置、在线公开手牌视图。
- 🧾 **服务端轻校验**：服务端负责发牌、加牌、提交表达式验算和胜负裁定；AI 求解和提示系统仍留在浏览器端。
- 🧪 **联网测试**：新增房间核心状态机测试、协议流程测试、500 客户端 / 125 房间模拟压测，并加入 `npm.cmd test`。

### 工程
- 新增 `worker/index.js`、`worker/room-core.cjs`、`wrangler.toml`、`package.json`。
- `sw.js` 缓存列表更新至 v5，纳入 `js/online.js`。

## [v3.4] — 2026-04-28

### 新增
- 🧠 **Web Worker 求解器**：后台异步求解，不阻塞 UI（`js/solver-worker.js` + `game.js` Worker 管理）
  - `ensureSolutionWorker()` 惰性创建 Worker，通过 `importScripts` 加载依赖
  - `requestSolutionAnalysis()` 发送求解请求，`solutionTaskId` + `handKey` 防止 stale response
  - `__eq21Perf` 性能诊断系统，追踪慢手牌/Worker 超时/降级事件
- 💎 **妙解评分系统**：`rateSolution()` / `findCoolExpressionsDP()` 智能搜索酷炫解法
  - 三级标签：🎩妙手天成(≥420) / ✨炫技解法(≥260) / 🧠奇思妙算(≥160)
  - 6 种算子判定（加减乘除幂开方阶乘）+ 五牌逆转 + 难度模式加分
- 📊 **双档输出**：`solveHandDetailed()` 统一入口，返回 `simpleSolutions` + `coolSolutions`
- ⏱ **时间预算控制**：`SOLVE_BUDGETS`（autoHint 80ms / manualHint 300ms / aiThink 500ms）
- 🔢 **DP 子集枚举搜索**：`findCoolExpressionsDP()` 用 Bitmask DP 找高质量解
  - `trimMap()` 每子集限 180 候选，`rankExpr()` 按评分+接近度排序
  - 支持 √ 和 ! 单卡预处理展开

### 优化
- 求解器缓存：`_aiCache`（aiSolve 结果） + `_detailedSolveCache`（solveHandDetailed 结果）双层隔离
- 清除提示卡顿：`autoHintMs` 预算内未命中 → 展示已有结果，不影响 UI 响应
- 解法质量排序：`rateSolution()` 按酷炫度排序，DP 搜索优先返回高质量解
- `aiSolve()` 支持 `style: 'cool'` 模式：运算符排序优先级反转（`^` > `*` > `/` > `+` > `-`）

### 测试
- 🧪 新增 4 套自动化测试：
  - `tests/test-static.js` (48 条) — 静态资源引用、PWA 清单、SW 缓存、JS 语法检查
  - `tests/test-dom-flow.js` (87 条) — 零依赖 fake DOM 流程测试（围桌入口、历史、妙解、Worker stale）
  - `tests/test-worker-flow.js` (28 条) — Worker 契约测试（妙解返回、超时边界、异常输入）
  - `tests/test-solver-perf.js` (默认 138 样本) — 性能回归测试，支持 `--stress --seed --hands`
- 📊 `tests/_bench_6332J.js` — 6332J 手牌微基准测试
- 📝 原有测试扩展：`test-expression.js` 132→183 条，`test-fuzz.js` 829→803 模板（重组）
- 📝 `TEST_PLAN.md` 手工回归清单同步更新，引用全部 6 套自动化测试

### 文档
- 📝 `ARCHITECTURE.md`：AI 求解器章节重写（双层架构 + 妙解 + Worker），P1 标记完成

---

## [v3.3] — 2026-04-28

### 新增
- 🃏 **围桌模式**：本地多人全面改造
  - 双人对坐布局（上方玩家 180° 旋转 + 中央信息栏 `#tabletop-center`）
  - 3/4 人布局选项（可用，但未完美）
  - 点击牌面 + 符号按钮构建算式，无需键盘输入（`.expr-display` 替代 `<input>`）
- 🌐 **PWA 支持**：`manifest.json` + `sw.js`（Cache-First），可添加到手机桌面离线玩
- 🔔 **音效开关**：头部栏 `#btn-sound` 一键切换，`localStorage` 持久化偏好
- 🃏 **牌背 3D 翻转动画**：`card-shell` / `card-inner` / `rotateY` / `backface-visibility` 系统，发牌入场动画、加牌快翻动画、hover 上浮效果

### 优化
- 🎨 UI 美化：菜单卡片 hover 阴影加深、难度卡渐变和纹理、`.menu-footer` 历史/规则链接
- 🏷 Logo 字体拆分：♠算式21点♣ 中数字 `21` 用独立 `Playfair Display` 衬线字体
- 📱 移动端：符号按钮放大、3/4 人围桌横屏提示、手机竖屏降级围桌布局

### 架构
- `State.get/set/reset` 状态管理规范化（`config.js`）
- `OPERATORS` 运算符注册表（`config.js`：7 个运算符统一配置）
- AI 求解器补全 `√` 和 `!` 一元搜索分支

---

## [v3.2.1] — 2026-04-27

### 修复
- 🐛 **BUG #1**: `√(expr)` / `sqrt(expr)` 括号开根报"括号不匹配" — 补 `TOK_LP` token (`js/expression.js:18,30`)
- 🐛 **BUG #2**: `(expr)!` 括号表达式阶乘报"非法字符" — `)` 后消费 `!` (`js/expression.js`)
- 🐛 **BUG #3**: `-5!` 负号阶乘错误提示不准 — 显式抛出"阶乘仅支持非负整数" (`js/expression.js:47`)
- 🐛 **BUG #4**: easy/normal 下 `5!` 报"非法字符" — 阶乘检测前显式判断 `hasFactorial()` (`js/expression.js:34`)

### 测试
- 🧪 **测试框架**：`tests/test-expression.js` (132 手工用例) + `tests/test-fuzz.js` (829 模板 × 3 难度 = 2766 实例)
- 📊 两套测试全部通过（0 失败，0 新增 Bug）
- 🔬 运行方式：`node tests/test-expression.js` 和 `node tests/test-fuzz.js`

### 文档
- 📝 `BUG_REPORT.md`：4 个 Bug 标记已修复，Fuzz 结果更新为最新数据
- 📝 `ARCHITECTURE.md`：测试覆盖描述和优先级表格更新
- 📝 `ROADMAP.md`：技术债务项"测试覆盖率"更新
- 📝 `TEST_PLAN.md`：添加自动化测试引用

---

## [v3.2] — 2026-04-27

### 新增
- 📜 **历史面板**：侧边滑出式对局历史，支持查看最近 20 局记录
- 🏆 **评分系统**：底分 + 运算符加分 + 成就加分（纯加分，无扣分）
  - 底分：获胜 +500 / 失败 +50（参与分）
  - 运算符加分：×÷ +50、^ +150、√ +200、! +300（仅获胜时）
  - 成就加分：三牌封喉 +150、一击必杀 +200、连胜 combo +100×次数、闪电心算 +200、速算达人 +100
- 🏷 **标签系统**：10 种成就标签自动判定展示
- 🔥 **连胜机制**：combo 连胜计数，≥3 连胜显示 `🔥X连胜` 标签
- 🗑 **清空历史**：一键清空所有对局记录
- 📊 **竞技统计**：总局数、胜率、最高分、最快用时（单人练习不计入统计）
- 📂 **新文件** `js/history.js`：全部历史逻辑（存储/查询/渲染/统计）

### 改动
- `js/config.js`：`game` 对象新增 `currentScore`、`scoreBreakdown`、`streak` 字段
- `js/game.js`：`submitFormula` 计算分数并写入历史；`showResult` 展示分数；新游戏读取 streak
- `js/ui.js`：结算弹窗改版为分数+标签展示；新增 `renderHistoryPanel()`、`openHistory()`、`closeHistory()`
- `index.html`：新增侧边历史面板 DOM + 底部 📜 按钮 + `script` 引入 history.js
- `style.css`：侧边面板样式、分数标签 pill 样式、mode 标签样式

### 历史面板数据
- localStorage 存储：version、streak、records（含 id/timestamp/mode/result/score/tags 等字段）
- 竞技局与单人练习分离统计：统计卡片仅反映竞技局数据

---

## [v3.1] — 2026-04-27

### 工程化
- 🏗 **代码模块化拆分**：从单文件 `数字21点V3.html` 拆分为独立 CSS + 5 个 JS 模块
- 📂 新建 `equation-21-simple/` 目录，最小拆分原则：
  - `style.css`：所有样式（从 `<style>` 提取）
  - `js/config.js`：全局状态、牌库、常量配置
  - `js/expression.js`：表达式求值器、AI 求解器
  - `js/ui.js`：UI 渲染（玩家卡片、操作栏、Toast、日志、胜利特效）
  - `js/game.js`：游戏逻辑（启动、流程、提示、AI 行为）
  - `js/main.js`：入口初始化、事件绑定
- 📄 `index.html` 菜单/弹窗按钮从内联 `onclick=""` 改用 JS 事件委托
- 📚 新增 `STRUCTURE.md` 项目结构说明文档

### 保留
- 📋 原始单文件 `数字21点V3.html` 和 `app.js` 保留不动，供参考

---

## [v3.0] — 2026-04-26

### 新增
- 🎚 **三种难度**：简单(A~10)、普通(A~K+幂+开根)、困难(A~K+幂+开根+阶乘)
- 🧑 **单人练习模式**：自由练习，3级渐进式提示
- 👥 **本地多人模式**：2~6人同设备轮流答题
- 🤖 **AI对战模式**：三种难度AI（新手/老练/专家）
- 📝 **完整日志面板**：底部实时滚动日志
- 🎉 **胜利特效**：撒花动画 + 音效
- 💡 **提示系统**：方向提示→步骤提示→完整答案
- 🔢 **安全求值器**：自研表达式解析器（调度场算法），不使用 `eval()`
- 🃏 **扑克牌UI**：模拟真实牌面卡片
- ⌨ **输入辅助**：点击牌面插入、符号按钮、键盘快捷键
- 🕐 **计时器**：游戏用时统计
- 📖 **游戏规则弹层**

### 技术
- 单文件 `数字21点V3.html`（~1689行）
- 零外部依赖，纯 HTML+CSS+JS
- 支持现代化浏览器（Chrome/Edge/Firefox/Safari 90+）
- 响应式布局（桌面/平板横屏优先）

---

## [v2.0] — 2026-04

### 新增
- 🧠 AI 对手（基础版）
- 🎚 多难度支持
- 🤖 AI 暴力求解器

### 文件
- `数字21点V2.html`

---

## [v1.0] — 2026-04 初

### 新增
- 🎯 基础游戏逻辑：发牌、算式验证、21点判定
- ✍ 表达式求值器（初版）
- 🃏 牌库系统（1~10数值）

### 文件
- 初始原型（已被后续版本取代）
