# 📝 算式21点 — 更新日志

本项目所有值得关注的变更都会记录在此文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

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