// @ts-check
const { defineConfig, devices } = require('@playwright/test');
// 机器相关配置（token/桌面端路径/服务地址）统一走 .env，命令行/CI 环境变量优先
require('./fixtures/env').loadEnv();

/**
 * DSH 客户端（DeepSeek Harness / 外贸赋能中心）自动化测试
 *
 * 三个项目：
 *   1. setup          —— token → auth cookie → .auth/dsh-state.json（仅 web）
 *   2. web-chromium   —— 浏览器形态，复用登录态
 *   3. electron       —— 桌面形态，需设置 DSH_ELECTRON_PATH，否则整组跳过
 *
 * 常用命令：
 *   npm run test:web        只跑 web
 *   npm run test:electron   跑桌面端（DSH_ELECTRON_PATH=<exe路径> npm run test:electron）
 *   npm test                全部
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

  /* web 公共配置（electron 项目会覆盖 mode） */
  use: {
    baseURL: process.env.DSH_URL || 'http://127.0.0.1:3080',
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
    /* 1. 登录态准备：只跑 auth.setup.js */
    {
      name: 'setup',
      testMatch: /auth\.setup\.js/,
    },

    /* 2. Web 形态 */
    {
      name: 'web-chromium',
      dependencies: ['setup'],
      testIgnore: /auth\.setup\.js/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: '.auth/dsh-state.json',
        mode: 'web',
      },
    },

    /* 3. Electron 桌面形态：未设置 DSH_ELECTRON_PATH 时用例自动 skip。
     *    注意：须与 web 项目分开跑（electron 用例自管 runtime，3080 服务
     *    已运行时桌面实例会依附现有服务并退出，Playwright 无法接管——
     *    fixtures 检测到该情况会整组 skip 并说明原因）。 */
    {
      name: 'electron',
      testIgnore: /auth\.setup\.js/,
      // 桌面客户端有单实例锁（requestSingleInstanceLock）：并行多实例后者直接退出，
      // 必须 workers=1 串行；firstWindow 等待较慢，放宽单用例超时
      workers: 1,
      timeout: 180_000,
      use: {
        mode: 'electron',
      },
    },
  ],

  outputDir: 'test-results/',
});
