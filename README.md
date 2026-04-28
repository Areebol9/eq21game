# 🃏 算式21点 (Equation 21)

> 一款用数学算式对决的网页卡牌游戏，适合酒局、聚会、数学练习。

---

## 📖 项目简介

这不是传统的 Blackjack（黑杰克/21点），而是一个**数学算式游戏**。

玩家从牌库中随机抽取卡牌（每张牌有对应的数值），需要用尽所有手牌，组合 `+` `-` `*` `/` `( )` 等运算符，写出一个结果等于 **21** 的算式。先算出来的玩家获胜！

---

## ✨ 当前功能（v3.4）

| 功能 | 说明 |
|------|------|
| 🧑 单人练习 | 自由练习，提供 3 级渐进式提示 |
| 👥 围桌模式 | 2~4 人同设备对坐围桌，点击牌面构建算式 |
| 🤖 AI 对战 | 挑战新手/老练/专家三种难度 AI |
| 🎚 三种难度 | 简单（A~10）、普通（A~K+幂+开根）、困难（A~K+幂+开根+阶乘） |
| 🃏 扑克牌 UI | 模拟真实牌面，3D 翻牌动画，支持平板横屏和手机竖屏 |
| 🌐 PWA 支持 | 可添加到手机桌面，离线游玩 |
| 🔔 音效开关 | 头部按钮一键切换，偏好自动保存 |
| 📝 完整日志 | 底部实时滚动日志，记录每一步操作 |
| 🎉 胜利特效 | 撒花动画和音效 |
| 🔢 安全求值 | 自研表达式解析器，不使用 `eval()` |
| 🧠 智能求解器 | Web Worker 后台异步求解，时间预算控制，不阻塞 UI |
| 💎 妙解评分 | 解法自动评分排序，炫技解法（🎩妙手天成/✨炫技解法/🧠奇思妙算）优选展示 |
| 🏆 评分系统 | 底分 + 运算符加分 + 成就加分，纯加分无扣分 |
| 🏷 成就标签 | 10 种标签自动判定（三牌封喉、一击必杀、闪电心算等） |
| 📜 历史面板 | 侧边滑出式对局历史，统计卡 + 最漂亮解法 + 最近记录 |
| 🔥 连胜追踪 | combo 连胜计数，≥3 连胜特殊标签 |
| 🌐 联网对战 MVP | Cloudflare Workers + Durable Objects 房间服，支持 2~4 人开房、短线重连、快捷短语 |

---

## 🚀 运行方式

直接双击打开 `index.html`，用浏览器即可游玩。

> **PWA 提示**：要体验"添加到桌面"和离线功能，需通过 `http://` 访问（不能是 `file://`）。用 VS Code Live Server 或 `npx serve .` 即可。

### 系统要求
- **浏览器**：Chrome 90+ / Edge 90+ / Firefox 90+ / Safari 14+
- **单机/围桌/AI 模式不需要** 安装任何软件、不需要 Node.js、不需要服务器
- **建议** 在平板横屏或电脑上获得最佳体验

### 联网对战开发方式

联网模式需要单独启动 Cloudflare Worker 房间服务：

```powershell
npm.cmd install
npm.cmd run dev:worker
```

本地 Worker 默认地址通常是 `http://localhost:8787`。打开网页后进入“联网对战”，在“服务地址”里填这个地址即可创建/加入房间。

部署到 Cloudflare：

```powershell
npm.cmd run deploy:worker
```

前端部署到 Cloudflare Pages：

```powershell
npm.cmd run build:pages
```

Pages 项目设置：
- 构建命令：`npm run build:pages`
- 输出目录：`dist`
- 环境变量：`EQ21_ONLINE_URL=https://你的-worker地址.workers.dev`

也可以用 Wrangler 直接发布 Pages：

```powershell
$env:EQ21_ONLINE_URL="https://你的-worker地址.workers.dev"
npm.cmd run deploy:pages
```

> PowerShell 如果拦截 `npm`，请使用 `npm.cmd`。联网服务端只做房间、发牌、提交验算和胜负广播；AI 求解、提示系统仍在浏览器端运行。

---

## 📁 文件索引

| 文件 | 说明 |
|------|------|
| `manifest.json` | PWA 清单（桌面图标、全屏启动） |
| `sw.js` | Service Worker（离线缓存） |
| `index.html` | 入口文件（页面结构） |
| `style.css` | 所有样式 |
| `js/config.js` | 全局状态、运算符注册表、音效 |
| `js/solver-worker.js` | Web Worker 求解器（后台异步，由 game.js 动态创建） |
| `js/expression.js` | 表达式求值器、AI求解器、妙解评分 |
| `js/ui.js` | UI渲染（含围桌模式专用渲染） |
| `js/online.js` | 联网房间客户端（创建/加入、WebSocket、重连、快捷短语） |
| `js/game.js` | 游戏逻辑引擎 |
| `js/history.js` | 历史记录、评分计算、成就标签判定 |
| `js/main.js` | 入口初始化、事件绑定 |
| `worker/` | Cloudflare Worker + Durable Object 联网房间服务 |
| `app.js` | 原始单文件备份（供参考） |
| `tests/` | 自动化测试（含表达式、Fuzz、静态、DOM、Worker、联网协议和 500 客户端模拟） |

> 各文件详细职责及修改指引见 **[STRUCTURE.md](STRUCTURE.md)**；
> 架构设计分析与重构方向见 **[ARCHITECTURE.md](ARCHITECTURE.md)**。

### 文档

| 文件 | 说明 |
|------|------|
| `GAME_RULES.md` | 完整游戏规则 |
| `STRUCTURE.md` | 项目结构 & 文件职责说明 |
| `ARCHITECTURE.md` | 架构分析 & 重构方向 |
| `ROADMAP.md` | 开发路线图 |
| `CHANGELOG.md` | 更新日志 |
| `TEST_PLAN.md` | 手工测试清单 |
| `tests/BUG_REPORT.md` | Bug 修复记录 |

---

## ⚠️ 版本限制

- **v3.5+ 支持 Web Worker 异步求解、妙解评分、PWA 离线游玩、围桌多人、3D 牌面动画、联网房间 MVP**
- 牌值范围为 1~13（A=1, J=11, Q=12, K=13），不含大小王
- 每局最多 5 张手牌
- 不支持分数运算（除法结果可以是小数）
- 不支持自定义牌组

### 浏览器兼容性

| 浏览器 | 最低版本 |
|--------|----------|
| Chrome / Edge | 90+ |
| Firefox | 90+ |
| Safari | 14+ |
| Internet Explorer | ❌ 不支持 |

---

## 📄 许可

本项目仅用于学习交流。欢迎自由修改和分发。
