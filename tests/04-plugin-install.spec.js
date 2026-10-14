// @ts-check
/**
 * 模块四：插件安装（易链市场）
 * M4-01 市场页签与目录可见   M4-02 从目录安装插件   M4-03 启停切换 [electron]
 */
const { test, expect } = require('../fixtures/app.fixtures');

test.describe.configure({ mode: 'serial' });

test.describe('M4 插件安装', () => {

  test.beforeEach(async ({ pages }) => {
    await pages.sidebar.openApp();
    // 「易链市场」入口由部署级配置控制：部分部署不提供（插件管理在 设置 → 插件 查看）。
    // 入口缺失时如实 skip，而非把部署配置差异判为产品缺陷。
    const marketAvailable = await pages.sidebar.marketButton().count();
    test.skip(marketAvailable === 0, '本部署未提供「易链市场」入口（插件管理仅在 设置 → 插件 中查看）');
    await pages.sidebar.openMarket();
  });

  test.afterEach(async ({ pages }) => {
    await pages.market.close().catch(() => {});
  });

  test('M4-01 市场页签与目录可见 [双端]', async ({ pages }) => {
    const m = pages.market;
    await expect(m.catalogTab()).toBeVisible();
    await expect(m.installedTab()).toBeVisible();
    await expect(m.refreshButton()).toBeVisible();
    const ids = await m.installedPluginIds();
    expect(ids.length).toBeGreaterThan(0);
    test.info().annotations.push({ type: 'note', description: `已安装: ${ids.join(', ')}` });
  });

  test('M4-02 安装插件目录中的插件 [双端]', async ({ page, pages }) => {
    test.setTimeout(180000);
    const m = pages.market;

    const before = await m.installedPluginIds();
    await m.openCatalog();
    const installable = await m.installButtons().count();
    test.skip(installable === 0, '插件目录当前无可安装插件');

    const label = await m.installFirst();
    test.info().annotations.push({ type: 'note', description: `点击安装: ${label}` });

    const feedback = await m.waitForInstallFeedback(120000);
    const after = await m.installedPluginIds();
    const added = after.filter(id => !before.includes(id));
    test.info().annotations.push({ type: 'note', description: `新增已安装: ${added.join(', ') || '(无)'}` });

    expect(feedback || added.length > 0, '安装应产生可见反馈（按钮消失或列表新增）').toBe(true);
  });

  test('M4-03 已安装插件启用/停用切换 [electron]', async ({ page, mode, pages }) => {
    // 实测 web 端启停控件恒为 disabled（插件生命周期由桌面端管理），仅桌面端可操作
    test.skip(mode !== 'electron', '插件启停控件在 web 端为禁用态，仅 electron 桌面端可操作');
    test.setTimeout(120000);

    await pages.market.installedTab().click();
    // 等已安装列表真正渲染（出现任意 启用/停用 控件），避免竞态导致误跳过
    await page
      .locator('button')
      .filter({ hasText: /^停用$|^启用$/ })
      .first()
      .waitFor({ timeout: 15000 });

    const disableBtns = page.locator('button:not([disabled])').filter({ hasText: '停用' });
    const count = await disableBtns.count();
    test.skip(count === 0, '当前没有可停用的运行中插件');

    const target = disableBtns.nth(count - 1);
    await target.click();
    await page.waitForTimeout(1500);

    const enableBtns = page.locator('button:not([disabled])').filter({ hasText: '启用' });
    await expect(enableBtns.first()).toBeVisible({ timeout: 15000 });
    const enableCount = await enableBtns.count();
    await enableBtns.nth(enableCount - 1).click();
    await page.waitForTimeout(1500);
    await expect(page.locator('button:not([disabled])').filter({ hasText: '停用' }).first()).toBeVisible({ timeout: 15000 });
  });
});
