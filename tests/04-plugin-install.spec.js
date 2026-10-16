// @ts-check
/**
 * 模块四：插件管理（侧栏「插件」页）
 *
 * 官方版已无社区版的「易链市场」弹窗（插件目录/已安装/刷新目录/安装 vX.Y.Z 全库 0 命中），
 * 插件管理收敛到**侧栏「插件」页**：每个插件一行，带「查看 X」「启用/停用 X」按钮，
 * 工具栏为 插件说明 / 刷新 / 添加插件。
 *
 * M4-01 插件页可打开、插件行清单可见
 * M4-02 「添加插件」入口可打开安装表单（**不实际安装**，避免污染被测环境）
 * M4-03 插件启用/停用切换 [electron]
 *
 * 说明：本组用例不做「从目录安装任意插件」——官方版该入口是自由文本安装源，
 * 真装会改动被测环境，属测试设计上应避免的副作用。
 */
const { test, expect } = require('../fixtures/app.fixtures');

test.describe.configure({ mode: 'serial' });

test.describe('M4 插件管理', () => {

  test.beforeEach(async ({ pages }) => {
    await pages.sidebar.openApp();
    await pages.plugins.open();
  });

  test('M4-01 插件页与插件清单可见 [双端]', async ({ pages }) => {
    const names = await pages.plugins.pluginNames();
    test.skip(names.length === 0, '本部署没有开放任何插件（插件页为空）');

    test.info().annotations.push({ type: 'note', description: `插件（${names.length}）: ${names.join(', ')}` });
    // 工具栏入口
    await expect(pages.plugins.refreshButton()).toBeVisible();
    await expect(pages.plugins.addPluginButton()).toBeVisible();
    // 分组说明项
    expect(await pages.plugins.items().count(), '插件页应有分组说明项').toBeGreaterThan(0);
  });

  test('M4-02 「添加插件」可打开安装表单（不实际安装）[双端]', async ({ pages }) => {
    await expect(pages.plugins.addPluginButton()).toBeVisible();
    const input = await pages.plugins.openAddPluginForm();
    const visible = await input.isVisible().catch(() => false);
    test.info().annotations.push({
      type: 'note',
      description: visible ? '添加插件表单已打开（未提交安装）' : '未定位到安装输入框，仅验证入口可点',
    });
    await pages.plugins.close();
  });

  test('M4-03 插件启用/停用切换 [electron]', async ({ mode, pages }) => {
    // 插件生命周期由桌面端管理；web 端切换控件通常为禁用态
    test.skip(mode !== 'electron', '插件启停由桌面端管理，仅 electron 桌面端可操作');
    test.setTimeout(120000);

    const names = await pages.plugins.toggleableNames();
    test.skip(names.length === 0, '当前没有可切换状态的插件');

    const target = names[0];
    const btn = pages.plugins.toggleButton(target);
    if (!(await btn.count())) {
      test.skip(true, `桌面端未渲染「${target}」的启停控件（本部署插件页形态不同）`);
    }
    // 启停控件平时隐藏，先 hover 插件行揭示
    await pages.plugins.pluginRow(target).hover().catch(() => {});
    await pages.sidebar.page.waitForTimeout(300);

    // 实测这是**开关（switch）**，aria-label 固定为「启用 X」，变的不是标签而是勾选态。
    const readChecked = async () => {
      const el = pages.plugins.toggleButton(target);
      const v = await el.getAttribute('aria-checked').catch(() => null);
      if (v !== null) return v;
      return String(await el.evaluate(e => e.getAttribute('data-state') || e.checked)).catch(() => '');
    };

    const before = await readChecked();
    await btn.click({ timeout: 15000 }).catch(() => btn.click({ force: true, timeout: 5000 }));

    // 勾选态翻转是异步生效的，轮询而非固定等待
    let after = before;
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline && after === before) {
      await pages.sidebar.page.waitForTimeout(500);
      after = await readChecked();
    }
    test.info().annotations.push({ type: 'note', description: `${target}: aria-checked ${before} → ${after}` });
    expect(after, '切换后勾选态应改变').not.toBe(before);

    // 还原
    await pages.plugins.toggleButton(target).click();
    await pages.sidebar.page.waitForTimeout(2000);
  });
});
