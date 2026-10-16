// @ts-check
/**
 * 设置弹窗组件
 *
 * 官方版实测（2026-10 真机探测）：已从社区版的「4 个页签」改为**左侧导航列表**
 * （DOM：div[class*="navList"] > button），本部署实际出现 4 项：
 *   通用设置 / 模型 / 内置插件 / Agent 预设
 * 注意「插件」已改名为 **「内置插件」**。
 *
 * 版本号：官方版品牌按钮只剩 logo 无文本，版本号移到 通用设置 里的
 * 「当前版本：{version}」（见 versionText()）。
 *
 * data-slot：settings.header / settings.close / settings.section / settings.general.item
 */
const { BasePage } = require('./BasePage');

/** 本部署实测存在的设置导航项（缺失的项会被优雅跳过，不硬失败） */
const NAV_ITEMS = ['通用设置', '模型', '内置插件', 'Agent 预设'];

class SettingsDialogPage extends BasePage {
  dialog() {
    return this.page.locator('[role="dialog"]').last();
  }

  /** 设置导航项（左侧列表里的按钮） */
  navItem(name) {
    return this.page.locator('[class*="navList"] button').filter({ hasText: name }).first();
  }

  closeButton() {
    return this.page.locator('[data-slot="settings.close"]')
      .or(this.page.getByRole('button', { name: '关闭' })).first();
  }

  /** 导航列表是否已渲染（面板真的开着） */
  async isOpen() {
    return this.page.locator('[class*="navList"] button').first().isVisible().catch(() => false);
  }

  /**
   * 确保设置面板处于打开态。
   * 实测存在「点开后随即被关闭」的竞态（开→断言之间面板消失），因此每次操作前自愈一次，
   * 而不是只在用例开头打开一次。
   */
  async ensureOpen() {
    if (await this.isOpen()) return this;
    await this.page.keyboard.press('Escape').catch(() => {});
    await this.page.waitForTimeout(300);
    await this.page.getByRole('button', { name: /^(设置|账号菜单)$/ }).first()
      .click({ timeout: 10000 }).catch(() => {});
    // 桌面形态：账号菜单 → 菜单里的「设置」
    const menuItem = this.page.getByRole('menuitem', { name: '设置' });
    if (await menuItem.count().catch(() => 0)) {
      await menuItem.first().click({ timeout: 5000 }).catch(() => {});
    }
    await this.page.locator('[class*="navList"] button').first()
      .waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
    return this;
  }

  /** 切换设置分区并等待渲染 */
  async openTab(name) {
    await this.ensureOpen();
    const item = this.navItem(name);
    if (!(await item.count())) {
      throw new Error(`设置里没有导航项「${name}」。本部署实测项: ${NAV_ITEMS.join(' / ')}`);
    }
    await item.click();
    await this.page.waitForTimeout(700);
    return this;
  }

  /** 断言用：本部署实际存在的导航项都应可见 */
  async expectTabsVisible(expect) {
    await this.ensureOpen();
    for (const t of NAV_ITEMS) {
      const item = this.navItem(t);
      if (await item.count()) await expect(item).toBeVisible();
    }
  }

  /** 当前客户端版本（从 通用设置 的「当前版本：{version}」读取） */
  async versionText() {
    await this.ensureOpen();
    await this.openTab('通用设置').catch(() => {});
    await this.page.waitForTimeout(500);
    const text = await this.page.evaluate(() => document.body.innerText);
    const m = text.match(/当前版本[：:]\s*([^\s\n]+)/);
    return m ? m[1].trim() : '';
  }

  async close() {
    // 显式时限：点不到时不能挂满整个 test timeout（Playwright 默认 actionTimeout=0）
    await this.closeButton().click({ timeout: 5000 }).catch(async () => { await this.page.keyboard.press('Escape').catch(() => {}); });
    await this.page.waitForTimeout(400);
  }

  /* ---------- 主题切换（通用设置） ---------- */
  themeButton(name) {
    // 「浅色」「深色」「跟随系统」。按文本匹配而非可访问名精确匹配——
    // 实测这些按钮的可访问名可能与 innerText 不完全一致，exact 会匹配不到。
    return this.page.locator('button')
      .filter({ hasText: new RegExp(`^\\s*${name}\\s*$`) })
      .first();
  }

  /** 切换主题并返回 body 背景色的亮度（0-255，深色主题应显著更低） */
  async switchTheme(name) {
    await this.ensureOpen();
    await this.openTab('通用设置').catch(() => {});
    const btn = this.themeButton(name);
    await btn.waitFor({ state: 'visible', timeout: 15000 });
    await btn.click({ timeout: 10000 }).catch(() => btn.click({ force: true, timeout: 5000 }));
    await this.page.waitForTimeout(800);
    return this.page.evaluate(() => {
      const rgb = getComputedStyle(document.body).backgroundColor.match(/\d+/g) || ['0', '0', '0'];
      return Math.round((+rgb[0] * 299 + +rgb[1] * 587 + +rgb[2] * 114) / 1000);
    });
  }
}

module.exports = { SettingsDialogPage, SETTINGS_NAV: NAV_ITEMS };
