// @ts-check
/**
 * 模块四（续）：插件能力 —— 侧栏插件页的管理能力纵深 + 设置→内置插件只读清单。
 *
 * 与 04-plugin-install.spec.js（M4-01..03 清单/添加入口/启停）互补，本组验证「能力面」：
 *   M4-04 插件说明指引与「设置 → 内置插件」联动入口
 *   M4-05 插件详情页：版本/组件清单/运行状态/组件启停控件（不点击）
 *   M4-06 安装表单引导与安装源（只展开收起，绝不提交安装）
 *   M4-07 设置 → 内置插件只读清单（搜索框/分组计数/无启停控件）
 *
 * 选择器考古（2026-10-30 electron 真机，rc.6）：
 *   · 「查看 X」进入插件详情：面包屑「插件列表」+「返回插件列表」+ v{version} 徽标 +
 *     状态徽标（实验性）+「包含的组件 共 N 个 · N 运行中」+ 组件行（描述/slot id/包名/
 *     运行状态 + aria「启用组件 X」）。配置型插件（终端/网页搜索…）详情形态可能不同，
 *     openDetailWithParts() 逐个探测而不是硬编码插件名。
 *   · 「添加插件」在列表页内联展开（非弹窗）：输入框 aria-label「包名或地址」（placeholder
 *     「例如 {示例包名}」）+「安装」按钮（空输入时禁用）+「插件安装引导和示例」展开
 *     （示例 eline-plugin-whale-pet、安全提示）+「安装源」选择器。
 *   · 设置→内置插件：只读 inventory（intro「查看内置部署的插件列表」+ 搜索「搜索插件」+
 *     分组计数「N 个」），配置页在侧栏插件页，此处无组件启停控件。
 */
const { test, expect } = require('../fixtures/app.fixtures');
const CATALOG = require('../fixtures/test-data/ui-catalog');

test.describe.configure({ mode: 'serial' });

test.describe('M4 插件能力', () => {

  test.beforeEach(async ({ pages }) => {
    await pages.sidebar.openApp();
    await pages.plugins.open();
  });

  test('M4-04 插件说明指引与「设置 → 内置插件」联动入口 [双端]', async ({ pages }) => {
    // 列表页骨架：intro + 「官方」分组徽标
    await expect(pages.plugins.intro()).toBeVisible();
    await expect(pages.plugins.officialBadge()).toBeVisible();

    const names = await pages.plugins.pluginNames();
    test.info().annotations.push({ type: 'note', description: `插件（${names.length}）: ${names.join(', ')}` });

    // 「插件说明」展开指引描述，指向 设置 → 内置插件（联动入口的存在性）
    await expect(pages.plugins.helpButton()).toBeVisible();
    await pages.plugins.helpButton().click();
    await expect(pages.plugins.helpDescription()).toBeVisible({ timeout: 10000 });
    await expect(pages.plugins.helpDescription()).toContainText('设置 → 内置插件');
  });

  test('M4-05 插件详情页：组件清单与运行状态 [双端]', async ({ pages }) => {
    const before = await pages.plugins.pluginNames();
    test.skip(before.length === 0, '本部署没有开放任何插件');

    // 逐个探测出首个带「包含的组件」的详情页（配置型插件详情形态可能不同）
    const name = await pages.plugins.openDetailWithParts();
    test.skip(!name, '所试插件详情均无组件清单形态（部署差异）');
    test.info().annotations.push({ type: 'note', description: `详情页插件: ${name}` });

    await expect(pages.plugins.backToListButton()).toBeVisible();
    await expect(pages.plugins.partsTitle()).toBeVisible();
    await expect(pages.plugins.partsCountText()).toBeVisible();          // 共 N 个 · N 运行中
    await expect(pages.plugins.partToggles().first()).toBeAttached();    // aria「启用组件 X」（不点击）

    // 组件运行状态词（运行中/已停用/…）至少出现一种
    const body = await pages.sidebar.page.evaluate(() => document.body.innerText);
    const phases = CATALOG.PLUGIN_PART_PHASES.filter(p => body.includes(p));
    expect(phases.length, `详情页应出现状态词之一（${CATALOG.PLUGIN_PART_PHASES.join('/')}）`).toBeGreaterThan(0);
    test.info().annotations.push({ type: 'note', description: `状态词: ${phases.join(', ')}` });

    // 版本徽标随插件类型下发（实验性插件实测有 v*），缺失仅记录
    const ver = await pages.plugins.versionBadge().first().innerText().catch(() => '');
    if (ver) test.info().annotations.push({ type: 'note', description: `版本: ${ver.trim()}` });

    // 返回列表：清单恢复一致
    await pages.plugins.backToListButton().click();
    await expect(pages.plugins.viewButton(name)).toBeVisible({ timeout: 15000 });
    expect(await pages.plugins.pluginNames(), '返回后插件清单应与进入前一致').toEqual(before);
  });

  test('M4-06 安装表单引导与安装源（不实际安装）[双端]', async ({ pages }) => {
    await expect(pages.plugins.addPluginButton()).toBeVisible();
    await pages.plugins.openAddPluginForm();
    const spec = pages.plugins.installSpecInput();
    test.skip(!(await spec.isVisible().catch(() => false)), '安装表单未渲染「包名或地址」输入框（部署形态差异）');

    await expect(pages.plugins.installSpecInput()).toBeVisible();
    await expect(spec).toHaveAttribute('aria-label', '包名或地址');
    // 实测 placeholder = 「例如 {示例包名}」（数据驱动）
    const placeholder = await spec.getAttribute('placeholder');
    expect(placeholder, 'placeholder 应含安装引导示例包名').toContain(CATALOG.PLUGIN_INSTALL_EXAMPLE);
    await expect(pages.plugins.installRunButton()).toBeVisible();
    // 安装源选择器存在（可选值见 CATALOG.PLUGIN_INSTALL_REGISTRIES；不切换、不提交）
    await expect(pages.plugins.registryLabel()).toBeVisible();

    // 展开安装引导：引导标题 + 填入示例（aria 名带示例包名）+ 安全提示
    await pages.plugins.guideToggle().click();
    await expect(pages.plugins.page.getByText('填入插件 npm 包名')).toBeVisible({ timeout: 10000 });
    const fillBtn = pages.plugins.guideFillExampleButton();
    await expect(fillBtn).toBeVisible();
    await expect(fillBtn).toHaveAccessibleName(new RegExp(`填入示例\\s*${CATALOG.PLUGIN_INSTALL_EXAMPLE}`));
    await expect(pages.plugins.page.getByText(/请确认插件来源可信/).first()).toBeVisible();

    // 收起引导复原（开关文案回到「插件安装引导和示例」）
    await pages.plugins.guideToggle().click();
    await expect(pages.plugins.page.getByRole('button', { name: '插件安装引导和示例' }).first())
      .toBeVisible({ timeout: 10000 });

    // 不提交安装，Esc 收起表单
    await pages.plugins.close();
    test.info().annotations.push({ type: 'note', description: '安装表单仅验证交互可达，未提交安装' });
  });

  test('M4-07 设置 → 内置插件只读清单 [双端]', async ({ pages }) => {
    await pages.settings.openTab('内置插件');
    const dlg = pages.settings.dialog();

    await expect(pages.plugins.builtinIntro()).toBeVisible();
    await expect(pages.plugins.builtinSearchInput()).toBeVisible();

    // 分组计数徽标（如「29 个」「191 个」）→ 清单非空
    const total = await pages.plugins.builtinTotal();
    test.info().annotations.push({ type: 'note', description: `内置插件分组计数合计: ${total}` });
    expect(total, '内置插件清单应为非空（分组计数 > 0）').toBeGreaterThan(0);

    // 数据驱动：分组名（会话插件/全局插件…），缺失的组随部署优雅跳过
    const present = [];
    for (const g of CATALOG.BUILTIN_PLUGIN_GROUPS) {
      if (await dlg.getByText(g, { exact: true }).first().isVisible().catch(() => false)) present.push(g);
    }
    test.info().annotations.push({ type: 'note', description: `分组: ${present.join(', ') || '(无匹配)'}` });
    expect(present.length, '至少应出现一个内置插件分组').toBeGreaterThan(0);

    // 只读清单：配置页在侧栏插件页，此处不应有组件启停控件
    expect(await pages.plugins.builtinPartToggles().count(), '内置插件页签应为只读清单（无组件启停控件）').toBe(0);

    await pages.settings.closeButton().click().catch(() => {});
  });
});
