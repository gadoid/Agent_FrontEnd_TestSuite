# Agent_FrontEnd_TestSuite 工作区指令

## 验证形态优先级（2026-10-30 起）

**后续测试开发与验证主要关注桌面端（electron 形态）**：

- 跑用例用 `npm run test:electron`（或 `npx playwright test --project=electron`）；
  运行前须彻底退出 ElineAI 桌面应用（硬性单实例锁，占 127.0.0.1:19387 会整体 skip）。
- web 轮（chromium）当前被已知应用缺陷阻断：`dsh web` 的 settings 写入被服务端拒绝
  （`profile reload requires the root Include entry`），「预览版说明」弹窗关不掉、
  全部 UI 用例快速失败。根因与证据见 `问题根因分析-M8-09工作区隔离与web端预览版弹窗.md`。
  应用修复前，web 轮失败不视为用例缺陷；修复后用例无需改动即可恢复。
- 新用例的选择器考古/探针脚本一律走 electron 同款启动方式
  （参考 `scripts/probe-plugin-capability.js`），不要用 web + token 路径。
