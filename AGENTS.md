# Agent_FrontEnd_TestSuite 工作区指令

## 被测应用（2026-10-30 起）

**ElineAI 已更名为 SparkSeed**（官方 DeepSeek Harness，exe 当前在
`D:\sparkseed\sparkseed.exe`，v0.2.0-rc.8；套件适配基线是 rc.7 时代的
`D:\elineai` 安装，rc.8 换了安装目录，关键机制——dsh-app:// 窗口协议、
dsh CLI 入口、userData `%APPDATA%/sparkseed`——经核验一致）。
套件已适配：exe 探测路径、单实例检测（rc.7 起 19387 硬编码端口已移除，改为按
映像名查进程，见 `fixtures/ports.js` 的 `desktopAppRunning`）。

**cookie 清理已移除（2026-10-31）**：旧版 dsh-auth-* cookie 无限累积问题**应用侧已修复**，
测试侧不再在启动前清理 `%APPDATA%/sparkseed/Network/Cookies`——不要在夹具或用例里再引入
任何 cookie 清理逻辑。

## 已知应用回归（2026-10-31 10:48 构建，rc.8 重打包）

当天构建引入三个问题，证据与复现探针齐备（`scripts/probe-rc8b-*.js`）：

1. **settings/mutate 全被拒**（HTTP 200 包 `settings/rejected: "profile reload requires
   the root Include entry"`）：新构建把数据 HOME 从 `~/.dsh` 换成 `~/.sparkseed` 并全新初始化，
   生成的 profile 根文档（`cordis.yml`）是**没有根 Include 条目的旧式空列表**，任何设置写入
   触发 profile 协调即被拒，前端静默吞掉——主题/字号/语言等全部设置**点了没反应**。
   **M8-06A 失败是真阳性**，应用修复前不视为用例缺陷、不要改用例迁就。
2. **hover 预览卡（Rx-Pca_hoverContent）只在点击其它区域时关闭**：鼠标移开/Esc 均不关，
   残留浮层拦截 hero 区按钮点击（M9-08A 根因）。`WorkspacePage.openPickerMenu()` 已加
   `dismissHoverOverlay()` 守卫（click-outside 清除），新入口若遇同类拦截照此处理。
3. **`dsh web` 启动即崩**（64 个 client bundle 激活失败，`~/.sparkseed` 下无 web profile）：
   web 轮整体不可用，桌面优先不受影响。

另：数据 HOME 已按部署更名（ElineAI `~/.eline` → sparkseed `~/.sparkseed`）；套件文档里
`~/.dsh` 的表述指官方 dsh 默认，sparkseed 实测以 `~/.sparkseed` 为准。

## 验证形态优先级

**后续测试开发与验证主要关注桌面端（electron 形态）**：

- 跑用例用 `npm run test:electron`（或 `npx playwright test --project=electron`）；
  运行前须彻底退出 SparkSeed 桌面应用（Electron `requestSingleInstanceLock`
  硬性单实例锁，检测到进程存活会整体 skip）。
- web 轮（chromium）：rc.7 下基础设施已验证可用——`dsh web` 正常启动、token 自动捕获、
  M1-01/02 通过；rc.2 时代的「预览版说明」弹窗已移除。但 web 形态设置面板无「账号」
  页签（与桌面端形态差异，桌面数据目录 ui-catalog.SETTINGS_TABS 含「账号」），
  且旧缺陷（settings 写入被拒，`profile reload requires the root Include entry`，
  见 `docs/问题根因分析-M8-09工作区隔离与web端预览版弹窗.md`）是否完全修复未深查。
  **web 轮失败先对照桌面端行为判断是否形态差异，不视为用例缺陷。**
- 新用例的选择器考古/探针脚本一律走 electron 同款启动方式
  （参考 `scripts/probe-plugin-capability.js`），不要用 web + token 路径。

## 部署相关数据

ElineAI 时代的部署数据（「外贸专家模式」等五模式、易链中转模型目录、
`eline-plugin-whale-pet` 示例包名）已随更名移除。换部署/换版本时只改
`fixtures/test-data/ui-catalog.js`（数据源），不改用例；实测基线以探针脚本输出为准。

## 工具与文档

- 使用手册（环境/运行/报告导出/排错）：`docs/USAGE.md`；用例表与描述单一事实源：`TEST-CASES.md`。
- 控制台用例描述打印：`reporters/case-logger.js`（每条用例开始时输出 ID+描述，随 list reporter 并存）。
- 报告留档：每轮跑完 `playwright-report/` 会被覆盖，留档用 `npm run report:export`（输出到 `reports/`，已 gitignored）。
