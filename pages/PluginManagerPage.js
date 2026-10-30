// @ts-check
/**
 * 侧栏「插件」页（替代社区版的「易链市场」弹窗）
 *
 * 官方版实测（2026-10 真机探测）：
 *   入口       侧栏一级按钮 button[aria-label="插件"]
 *   插件行     button[aria-label="查看 <name>"] + button[aria-label="启用 <name>"]
 *              （社区版是「插件目录/已安装」两个页签 + 「安装 vX.Y.Z」按钮，全库已不存在）
 *   设置项     [data-slot="plugins.item"]（如「限制每条命令最多能跑多久…」等分组说明）
 *   工具栏     插件说明 / 刷新 / 添加插件
 *
 * 「添加插件」打开安装输入框（占位符形如 dsh-plugin-whale-pet），因此本组用例**不实际安装**
 * 任意 npm 包——只验证入口与交互可达，避免测试污染被测环境。
 */
const { BasePage } = require('./BasePage');

class PluginManagerPage extends BasePage {
  /** 侧栏「插件」入口 */
  entry() {
    return this.page.getByRole('button', { name: '插件', exact: true });
  }

  /** 打开插件页 */
  async open() {
    await this.dismissOnboarding();
    await this.entry().click();
    // 等插件行真正渲染出来再返回——否则紧随其后的 toggleableNames() 会读到空列表，
    // 让依赖它的用例退化成「无可切换插件」跳过（覆盖悄悄丢失）。
    await this.page.locator('button[aria-label^="查看 "]').first()
      .waitFor({ state: 'visible', timeout: 20000 })
      .catch(() => {});
    await this.page.waitForTimeout(800);
    return this;
  }

  /** 全部插件行（按「查看 <name>」按钮识别） */
  viewButton(name) {
    return this.page.getByRole('button', { name: new RegExp(`^查看\\s+${name}$`) });
  }

  /** 插件名列表（从「查看 X」按钮提取） */
  async pluginNames() {
    return this.page.evaluate(() => [...document.querySelectorAll('button[aria-label^="查看 "]')]
      .map(b => b.getAttribute('aria-label').replace(/^查看\s+/, '').trim()));
  }

  /** 分组说明项 */
  items() {
    return this.page.locator('[data-slot="plugins.item"]');
  }

  /** 指定插件的启用/停用按钮（aria「启用 X」/「停用 X」） */
  toggleButton(name) {
    // 用**属性选择器**而不是 getByRole：这些控件平时隐藏，不在可访问性树里，
    // getByRole 匹配不到（与工作区操作按钮同一类「hover 才揭示」的模式）。
    return this.page.locator(
      `button[aria-label="启用 ${name}"], button[aria-label="停用 ${name}"]`
    ).first();
  }

  /** 插件行（「查看 X」按钮所属的条目容器） */
  pluginRow(name) {
    return this.page.locator(`button[aria-label="查看 ${name}"]`).first();
  }

  /**
   * 可切换状态的插件名列表。
   * **轮询到出现为止**——实测启停控件比插件行晚一拍渲染，读一次会拿到空数组，
   * 让依赖它的用例悄悄退化成「无可切换插件」跳过。
   */
  async toggleableNames({ timeout = 15000 } = {}) {
    const deadline = Date.now() + timeout;
    for (;;) {
      const names = await this.page.evaluate(() => [...document.querySelectorAll('button[aria-label]')]
        .map(b => b.getAttribute('aria-label'))
        .filter(l => /^(启用|停用)\s+/.test(l))
        .map(l => l.replace(/^(启用|停用)\s+/, '').trim()));
      if (names.length || Date.now() > deadline) return names;
      await this.page.waitForTimeout(500);
    }
  }

  /** 工具栏按钮 */
  refreshButton() {
    return this.page.getByRole('button', { name: '刷新', exact: true });
  }

  addPluginButton() {
    return this.page.getByRole('button', { name: '添加插件', exact: true });
  }

  helpButton() {
    return this.page.getByRole('button', { name: '插件说明', exact: true });
  }

  /** 点「添加插件」并返回出现的输入框（不实际提交安装） */
  async openAddPluginForm() {
    await this.addPluginButton().click();
    await this.page.waitForTimeout(800);
    const input = this.page.locator('input[type="text"], input:not([type])').last();
    await input.waitFor({ timeout: 8000 }).catch(() => {});
    return input;
  }

  close() {
    return this.page.keyboard.press('Escape');
  }

  /* ═════════ 插件能力面（M4-04..07，2026-10-30 electron 真机考古） ═════════
   *
   * 列表页   intro「安装、启用和配置插件」+「官方 N」分组徽标 + 插件卡片（实验性/配置型）
   * 详情页   「查看 X」进入：面包屑「插件列表」+「返回插件列表」+ 版本 v* + 状态徽标
   *          +「包含的组件 共 N 个 · N 运行中」+ 组件行（名称/描述/slot id/包名/运行状态
   *          + aria「启用组件 X」启停控件）。配置型插件（终端/网页搜索…）详情形态可能
   *          不同（无组件清单），用 openDetailWithParts() 逐个探测。
   * 安装表单 「添加插件」后在列表页内联展开（非弹窗）：placeholder「包名或地址」+
   *          「安装」按钮 +「插件安装引导和示例」展开/收起 +「安装源」选择器。
   * 设置面   设置→内置插件：只读清单（搜索「搜索插件」、分组计数「N 个」、无启停控件），
   *          配置页在侧栏插件页，这里只作 inventory。
   */

  /** 列表页 intro（面板副标题） */
  intro() {
    return this.page.getByText('安装、启用和配置插件', { exact: true });
  }

  /** 「官方」分组徽标（标题与计数分开渲染，取「官方」前缀首处） */
  officialBadge() {
    return this.page.getByText(/^官方/).first();
  }

  /** 插件说明展开后的指引描述（含「设置 → 内置插件」联动入口文案） */
  helpDescription() {
    return this.page.getByText(/在这里配置官方插件/);
  }

  /* ---------- 详情页 ---------- */

  /** 返回插件列表按钮（详情页面包屑根） */
  backToListButton() {
    return this.page.getByRole('button', { name: '返回插件列表', exact: true });
  }

  /** 详情页「包含的组件」标题 */
  partsTitle() {
    return this.page.getByText('包含的组件', { exact: true });
  }

  /** 详情页组件计数行（如「共 3 个 · 3 运行中」） */
  partsCountText() {
    return this.page.getByText(/共 \d+ 个/);
  }

  /** 详情页版本徽标（v{version}，如 v0.2.0-rc.6） */
  versionBadge() {
    return this.page.getByText(/^v\d[\w.\-]*$/);
  }

  /** 组件行启停控件（aria「启用组件 X」；平时隐藏，hover 组件行揭示） */
  partToggle(name) {
    return this.page.locator(`button[aria-label="启用组件 ${name}"]`).first();
  }

  partToggles() {
    return this.page.locator('button[aria-label^="启用组件 "]');
  }

  /**
   * 打开首个「带组件清单」的插件详情页，返回插件名；都带不了则返回 null（已回到列表）。
   * 实测实验性插件（智能体团队等）详情含「包含的组件」；配置型插件（终端/网页搜索…）
   * 详情形态可能不同——逐个尝试而不是硬编码插件名，换部署不自败。
   */
  async openDetailWithParts({ maxTry = 4, waitMs = 1200 } = {}) {
    const names = await this.pluginNames();
    for (const name of names.slice(0, maxTry)) {
      await this.viewButton(name).click();
      await this.page.waitForTimeout(waitMs);
      if (await this.partsTitle().isVisible().catch(() => false)) return name;
      if (await this.backToListButton().isVisible().catch(() => false)) {
        await this.backToListButton().click();
        await this.page.waitForTimeout(800);
      }
    }
    return null;
  }

  /* ---------- 安装表单（内联；本套件只验证交互，从不提交安装） ---------- */

  /** 「包名或地址」输入框。实测：aria-label=「包名或地址」，placeholder=「例如 {示例包名}」
   *  （无可见标签文本），故按 aria-label 定位。 */
  installSpecInput() {
    return this.page.locator('input[aria-label="包名或地址"]');
  }

  /** 表单「安装」按钮（exact，避免命中「安装源」） */
  installRunButton() {
    return this.page.getByRole('button', { name: '安装', exact: true });
  }

  /** 安装引导展开/收起开关（展开前「插件安装引导和示例」，展开后「收起引导」） */
  guideToggle() {
    return this.page.getByRole('button', { name: /插件安装引导和示例|收起引导/ }).first();
  }

  /** 引导展开后的「填入示例」按钮（aria 名带示例包名：填入示例 {example}，不能 exact 匹配） */
  guideFillExampleButton() {
    return this.page.getByRole('button', { name: /^填入示例/ }).first();
  }

  /** 安装源标签（选择器标题） */
  registryLabel() {
    return this.page.getByText('安装源', { exact: true });
  }

  /* ---------- 设置 → 内置插件（只读清单） ---------- */

  /** 内置插件清单搜索框 */
  builtinSearchInput() {
    return this.page.locator('input[placeholder="搜索插件"]');
  }

  /** 内置插件 intro（页签副标题） */
  builtinIntro() {
    return this.page.getByText('查看内置部署的插件列表', { exact: true });
  }

  /** 设置弹窗根（内置插件页签容器；分组计数只在弹窗内找，避免误匹配侧栏「展开其余 N 个会话」） */
  builtinSection() {
    return this.page.locator('[role="dialog"]').last();
  }

  /** 内置插件分组计数徽标（如「29 个」「191 个」）之和（0 = 没读到任何分组徽标） */
  async builtinTotal() {
    const text = await this.builtinSection().innerText().catch(() => '');
    let sum = 0;
    for (const m of text.matchAll(/(\d+) 个/g)) sum += parseInt(m[1], 10) || 0;
    return sum;
  }

  /** 只读性负断言用：内置插件页签内不应出现组件启停控件（配置页在侧栏插件页） */
  builtinPartToggles() {
    return this.page.locator('button[aria-label^="启用组件 "]');
  }
}

module.exports = { PluginManagerPage };
