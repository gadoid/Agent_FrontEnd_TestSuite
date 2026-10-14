// @ts-check
/**
 * 模块二：登录 / 认证
 * M2-01 token 登录换 cookie [web]   M2-02 无凭证被拒 [web]
 * M2-03/M2-04 认证态开箱可用 [双端]
 */
const { test, expect, APP_URL } = require('../fixtures/app.fixtures');
const { request: bareRequest } = require('@playwright/test');

test.describe('M2 登录/认证', () => {

  test('M2-01 token 登录 → 303 → auth cookie [web]', async ({ mode, browser }) => {
    test.skip(mode !== 'web', 'web 专属用例');
    const TOKEN = process.env.DSH_TOKEN || '';
    test.skip(!TOKEN, '未设置 DSH_TOKEN（token 由 dsh 每次启动轮换，请在 .env 或环境变量提供）');

    const context = await browser.newContext({ locale: 'zh-CN' }); // 干净上下文，模拟首次登录
    const page = await context.newPage();
    const resp = await page.goto(`${APP_URL}/?token=${TOKEN}`, { waitUntil: 'domcontentloaded' });

    expect(resp.status()).toBeLessThan(400);
    const cookies = await context.cookies();
    const auth = cookies.find(c => c.name.startsWith('dsh-auth-'));
    expect(auth, '应种下 dsh-auth-* cookie').toBeTruthy();
    expect(auth.httpOnly, 'auth cookie 应为 HttpOnly').toBe(true);

    await page.getByRole('button', { name: '新建会话' }).last().waitFor({ timeout: 30000 });
    await context.close();
  });

  test('M2-02 无 token/cookie 直接访问被拒 [web]', async ({ mode }) => {
    test.skip(mode !== 'web', 'web 专属用例');
    const ctx = await bareRequest.newContext({
      baseURL: APP_URL,
      storageState: { cookies: [], origins: [] },
    });
    const resp = await ctx.get('/');
    expect([401, 403]).toContain(resp.status());
    expect((await resp.text()).toLowerCase()).toContain('auth');
    await ctx.dispose();
  });

  test('M2-03/M2-04 认证态下应用完整可用 [双端]', async ({ pages }) => {
    test.setTimeout(120000);
    await pages.sidebar.openApp();

    await expect(pages.sidebar.newSessionButton()).toBeVisible();
    const ws = await pages.sidebar.currentWorkspaceName();
    expect(ws.length, '工作区名称应非空').toBeGreaterThan(0);
    test.info().annotations.push({ type: 'note', description: `当前工作区: ${ws}` });
  });
});
