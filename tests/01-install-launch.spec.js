// @ts-check
/**
 * 模块一：安装 / 启动（服务健康 + 客户端加载）
 * M1-01 服务可达性 [web]   M1-02 未认证拦截 [web]
 * M1-03/M1-04 客户端启动、关键 UI 就绪 [双端]
 */
const { test, expect, APP_URL } = require('../fixtures/app.fixtures');
const { request: bareRequest } = require('@playwright/test');

test.describe('M1 安装/启动', () => {

  test('M1-01 web 服务可达且返回客户端页面 [web]', async ({ request, mode }) => {
    test.skip(mode !== 'web', 'web 专属用例');
    const resp = await request.get('/');
    expect(resp.status()).toBe(200);
    const html = await resp.text();
    expect(html).toContain('__ModuleLoader__');
    expect(html).toContain('__DSH_BOOT__');
  });

  test('M1-02 未认证访问被拦截（401）[web]', async ({ mode }) => {
    test.skip(mode !== 'web', 'web 专属用例');
    // 裸请求上下文：runner 内模块级 request 也会继承 use.storageState，需显式置空
    const ctx = await bareRequest.newContext({
      baseURL: APP_URL,
      storageState: { cookies: [], origins: [] },
    });
    const resp = await ctx.get('/');
    expect([401, 403]).toContain(resp.status());
    await ctx.dispose();
  });

  test('M1-03/M1-04 客户端启动，关键 UI 组件就绪 [双端]', async ({ page, mode, pages }) => {
    test.setTimeout(120000);

    await pages.sidebar.openApp(); // electron 下 no-op（窗口已就绪）

    // sparkseed（官方 DeepSeek Harness rc.7）页面标题为「sparkseed」
    expect(await page.title()).toMatch(/sparkseed/i);
    await expect(pages.sidebar.newSessionButton()).toBeVisible();
    await expect(pages.sidebar.settingsButton()).toBeVisible();
    await expect(pages.sidebar.searchInput()).toBeVisible();

    // 「插件」入口是官方版侧栏的一级入口（社区版的「易链市场」已不存在）；缺失仅记录
    if (await pages.sidebar.pluginsButton().count()) {
      await expect(pages.sidebar.pluginsButton()).toBeVisible();
    } else {
      test.info().annotations.push({ type: 'note', description: '本部署未启用「插件」入口（插件管理收敛至 设置 → 内置插件）' });
    }

    // 版本号：官方版品牌按钮只剩 logo 无文本，改从 设置 → 通用设置 的「当前版本：」
    const version = await pages.settings.versionText();
    await pages.settings.close();
    if (version) {
      expect(version).toMatch(/\d+\.\d+/);
      test.info().annotations.push({ type: 'note', description: `客户端版本: ${version}，mode=${mode}` });
    } else {
      test.info().annotations.push({ type: 'note', description: `未能从设置面板读到版本号，mode=${mode}` });
    }
  });
});
