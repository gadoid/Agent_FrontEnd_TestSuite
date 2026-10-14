// @ts-check
/**
 * Web 模式登录态准备（setup 项目）
 *
 * DSH web 端认证方式：GET /?token=<dsh web 启动时打印的 token>
 *   → 303 → 种下 HttpOnly cookie dsh-auth-*（有效期 30 天）
 * 这里把 cookie 存进 .auth/dsh-state.json，供 web-chromium 项目复用，
 * 避免每条用例都走一遍 token 流程。
 *
 * token 来源（优先级）：环境变量 DSH_TOKEN / 项目根 .env（见 .env.example）。
 * 注意：token 由 `dsh web` 每次启动时打印，服务重启后需更新；
 * cookie 有效期内（30 天）可直接复用 state，无需 token。
 */
const { test: setup, expect, chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { ensureCleanRuntimeState, isServiceDown, servicePort } = require('../fixtures/runtime-state');

const STATE_FILE = path.join(__dirname, '..', '.auth', 'dsh-state.json');

setup('prepare web auth state (token → cookie)', async () => {
  setup.setTimeout(90000);
  const TOKEN = process.env.DSH_TOKEN || '';
  const PORT = servicePort();

  // 服务未运行时清理异常退出残留的 .dsh-desktop-runtime.json
  // （存在该文件会让 dsh 下次启动误判上次异常退出、走恢复流程）
  if (await isServiceDown(PORT)) {
    await ensureCleanRuntimeState({ logger: (m) => console.log(`[runtime-state] ${m}`) });
    throw new Error(`dsh web 服务未运行（127.0.0.1:${PORT} 无监听）。请先启动客户端，再重跑测试。`);
  }

  /* 1. 已有 state 且 cookie 仍有效（30 天）→ 直接复用，无需 token。
   *    token 由 `dsh web` 每次启动轮换，常过期；cookie 才是长效登录态。 */
  if (fs.existsSync(STATE_FILE)) {
    const b = await chromium.launch();
    const ctx = await b.newContext({ locale: 'zh-CN', storageState: STATE_FILE });
    const p = await ctx.newPage();
    const resp = await p.goto('/', { waitUntil: 'domcontentloaded' }).catch(() => null);
    const uiReady = resp && resp.status() < 400
      && await p.getByRole('button', { name: '新建会话' }).last()
          .waitFor({ timeout: 15000 }).then(() => true).catch(() => false);
    await b.close();
    if (uiReady) {
      setup.info().annotations.push({ type: 'note', description: '复用现有登录态（cookie 仍有效）' });
      return;
    }
  }

  /* 2. token 流程：带 token 访问 → 303 → cookie 种下 → 落地应用首页 */
  if (!TOKEN) {
    throw new Error([
      '缺少登录 token：DSH_TOKEN 未设置，且 .auth/dsh-state.json 不存在或已失效。',
      '请在项目根 .env（从 .env.example 复制）或环境变量中设置 DSH_TOKEN=',
      '（token 见 `dsh web` / 客户端启动时打印的 /?token=xxx）。',
    ].join('\n'));
  }

  const browser = await chromium.launch();
  const context = await browser.newContext({ locale: 'zh-CN' });
  const page = await context.newPage();

  const resp = await page.goto(`/?token=${TOKEN}`, { waitUntil: 'domcontentloaded' });
  expect(resp.status(), 'token 登录应成功（303/200）').toBeLessThan(400);

  // 验证确实拿到了 dsh-auth cookie
  const cookies = await context.cookies();
  const authCookie = cookies.find(c => c.name.startsWith('dsh-auth-'));
  expect(authCookie, '应种下 dsh-auth-* cookie').toBeTruthy();

  // 验证应用 UI 真正渲染
  await page.getByRole('button', { name: '新建会话' }).last().waitFor({ timeout: 30000 });

  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  await context.storageState({ path: STATE_FILE });
  await browser.close();
});
