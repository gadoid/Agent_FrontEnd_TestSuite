// @ts-check
const { defineConfig, devices } = require('@playwright/test');
// 机器相关配置（桌面端 exe / 服务地址）统一走 .env，命令行环境变量优先
require('./fixtures/env').loadEnv();

/**
 * 官方版 DeepSeek Harness 自动化测试
 *
 * 项目拓扑（依赖图决定「两轮分离」，不靠约定）：
 *   web-server ─┬→ setup ─→ web-chromium
 *               └→ (teardown 项目：跑完关闭服务)
 *   electron   —— 不声明依赖，因此 `--project=electron` 不会启动 web 服务
 *
 * 常用命令：
 *   npm run test:web        只跑 web（自动起停 dsh web 服务）
 *   npm run test:electron   只跑桌面端（须先彻底退出桌面应用：官方版有硬性单实例锁）
 *   npm test                串行跑两轮（两端共享 ~/.dsh 业务数据，并行会互相干扰）
 */
module.exports = defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // 被测对象是真实 LLM 流式回复，偶发模型行为波动（非代码缺陷）重试一次兜底
  retries: process.env.CI ? 2 : 1,
  // 用例全部打真实 LLM 后端，高并发易触发服务限流导致间歇失败；限 2 并发
  workers: 2,
  reporter: [['html', { open: 'never' }], ['list']],

  expect: { timeout: 15_000 },

  use: {
    baseURL: process.env.E2E_URL || 'http://127.0.0.1:3080',
    // 应用 UI 文案随浏览器语言切换，固定中文保证选择器稳定
    locale: 'zh-CN',
    // 1280x720 下右侧栏/统计条会被响应式隐藏，固定桌面分辨率
    viewport: { width: 1440, height: 900 },
    // M6-01 复制用例需要读取剪贴板
    permissions: ['clipboard-read', 'clipboard-write'],
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },

  projects: [
    /* 1. 起官方版 web 服务（`dsh web`）。teardown 项目保证即使中途失败也会收干净 */
    {
      name: 'web-server',
      testMatch: /web-server\.setup\.js/,
      teardown: 'web-server:teardown',
    },
    {
      name: 'web-server:teardown',
      testMatch: /web-server\.teardown\.js/,
    },

    /* 2. 登录态准备：只跑 auth.setup.js（离线构造 cookie，依赖服务已就绪） */
    {
      name: 'setup',
      testMatch: /auth\.setup\.js/,
      dependencies: ['web-server'],
    },

    /* 3. Web 形态 */
    {
      name: 'web-chromium',
      dependencies: ['setup'],
      testIgnore: [/auth\.setup\.js/, /web-server\.(setup|teardown)\.js/],
      use: {
        ...devices['Desktop Chrome'],
        storageState: '.auth/dsh-state.json',
        mode: 'web',
      },
    },

    /* 4. Electron 桌面形态：未配置 E2E_DSH_EXE 时用例自动 skip。
     *    官方版桌面 GUI 有硬性单实例锁（抢占失败即 app.quit()），且有独立的
     *    内部 host 端口 19387，与 web 形态的 3080 互不冲突——但两端共享
     *    ~/.dsh 业务数据（sessions/storages/workspace.json），仍应分轮串行跑。 */
    {
      name: 'electron',
      testIgnore: [/auth\.setup\.js/, /web-server\.(setup|teardown)\.js/],
      // 桌面客户端单实例锁：并行多实例后者直接退出，必须 workers=1 串行
      workers: 1,
      timeout: 120_000,
      use: {
        mode: 'electron',
      },
    },
  ],

  outputDir: 'test-results/',
});
