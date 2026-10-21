// @ts-check
/**
 * 设置弹窗组件
 *
 * eline 实测（2026-10，eline.exe v0.2.0-rc.2 定制构建）：左侧导航列表
 * （DOM：div[class*="navList"] > button），本部署 4 项：
 *   通用设置 / 模型 / 内置插件 / Agent 预设
 *
 * **没有独立的「应用/保存」按钮**——所有设置改动即时生效落盘（主题/字号/权限默认值）。
 * 「应用按钮」语义由即时生效控件承载：主题三态按钮、增大/减小字号 等，见下方对应方法。
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

  /** 读当前 body 背景色亮度（0-255），不切主题（M8-06A 复原断言用） */
  async readLuminance() {
    await this.ensureOpen();
    return this.page.evaluate(() => {
      const rgb = getComputedStyle(document.body).backgroundColor.match(/\d+/g) || ['0', '0', '0'];
      return Math.round((+rgb[0] * 299 + +rgb[1] * 587 + +rgb[2] * 114) / 1000);
    });
  }

  /* ---------- 即时生效的设置控件（「应用」语义） ----------
   * eline 设置无独立「应用/保存」按钮，改动即时落盘生效（2026-10 实测）。
   * 字号大小的「增大/减小字号」是最直接的可点击应用控件，点击后字号立即变化。 */
  fontIncreaseButton() {
    return this.page.getByRole('button', { name: '增大字号' });
  }

  fontDecreaseButton() {
    return this.page.getByRole('button', { name: '减小字号' });
  }

  /** 读取会话内容字号（px）。
   *  实测该设置落在 body 的内联 CSS 变量 --dsh-content-font-size 上（如 "14px"），
   *  变 readHtml/body 的 computed font-size 无感。
   *  满载下读取可能拿到 0（变量未就绪），重试一次避免误报。 */
  async fontSizePx() {
    let v = await this._readFontSizePx();
    if (!v) {
      await this.page.waitForTimeout(800);
      v = await this._readFontSizePx();
    }
    return v;
  }

  async _readFontSizePx() {
    return this.page.evaluate(() => {
      const raw = document.body.style.getPropertyValue('--dsh-content-font-size')
        || getComputedStyle(document.body).getPropertyValue('--dsh-content-font-size');
      const val = parseFloat(raw);
      if (Number.isFinite(val)) return val;
      const probe = document.querySelector('[class*="transcript"], [class*="composer"], main, body');
      return probe ? parseFloat(getComputedStyle(probe).fontSize) : 0;
    });
  }

  /** 点一次「增大字号」应用控件 */
  async increaseFontSize() {
    await this.ensureOpen();
    await this.openTab('通用设置').catch(() => {});
    const btn = this.fontIncreaseButton();
    await btn.waitFor({ state: 'visible', timeout: 15000 });
    await btn.click({ timeout: 10000 }).catch(() => btn.click({ force: true, timeout: 5000 }));
    await this.page.waitForTimeout(600);
    return this;
  }

  /** 点一次「减小字号」应用控件（恢复用） */
  async decreaseFontSize() {
    const btn = this.fontDecreaseButton();
    if (await btn.isVisible().catch(() => false)) {
      await btn.click({ timeout: 10000 }).catch(() => btn.click({ force: true, timeout: 5000 }));
      await this.page.waitForTimeout(600);
    }
    return this;
  }

  /* ---------- 语言切换（M10） ---------- */
  /** 打开语言下拉，返回可选语言菜单项（中文/English，语言名以原生名显示） */
  async openLanguageMenu() {
    await this.ensureOpen();
    await this.openTab('通用设置').catch(() => {});
    const trigger = this.page.locator('[role="dialog"] button').filter({ hasText: /^(中文|English)$/ }).first();
    await trigger.click({ timeout: 8000 }).catch(() => {});
    await this.page.locator('[role="menuitem"]').first().waitFor({ timeout: 8000 }).catch(() => {});
    await this.page.waitForTimeout(400);
    return this.page.locator('[role="menuitem"]').allInnerTexts();
  }

  /** 选择语言（语言名原生显示：中文 / English）。注意：切 English 后弹层文案可能整体变英文。 */
  async selectLanguage(name) {
    const item = this.page.locator('[role="menuitem"]').filter({ hasText: new RegExp(`^\\s*${name}\\s*$`) }).first();
    await item.click({ timeout: 8000 }).catch(() => {});
    await this.page.waitForTimeout(1500);
    return this;
  }

  /* ---------- 设置功能开关（M10）：点击即生效，用例需翻转后复原 ----------
   * 实测控件形态不一：显示代码工作视图/上传 Session Log 是 role=switch（aria-checked），
   * 排队发送是普通 button（aria-pressed）。统一定位：含名称文本的 switch 或 button。 */
  _switchControl(name) {
    return this.page.locator('[role="switch"]').filter({ hasText: new RegExp(name) })
      .or(this.page.locator('button[aria-pressed]').filter({ hasText: new RegExp(name) }))
      .or(this.page.getByRole('switch', { name })).first();
  }

  async _controlState(control) {
    return (await control.getAttribute('aria-checked')) ?? (await control.getAttribute('aria-pressed'));
  }

  /** 读开关当前状态（'true'/'false'/null）。桌面端会自愈重开面板。 */
  async switchState(name) {
    await this.ensureOpen();
    await this.openTab('通用设置').catch(() => {});
    return this._controlState(this._switchControl(name));
  }

  /** 读开关状态并翻转一次，返回 {before, after}。
   *  桌面端存在「面板开了随即被关」的竞态（恢复会话的补发回复会打断弹窗），
   *  操作前必须 ensureOpen 自愈并落到 通用设置 页签。 */
  async toggleSwitch(name) {
    await this.ensureOpen();
    await this.openTab('通用设置').catch(() => {});
    const control = this._switchControl(name);
    await control.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
    const before = await this._controlState(control);
    await control.click({ timeout: 8000 }).catch(() => control.click({ force: true, timeout: 5000 }));
    await this.page.waitForTimeout(700);
    const after = await this._controlState(control);
    return { before, after };
  }

  /** 把开关恢复到指定状态（幂等；state 为 'true'/'false'） */
  async restoreSwitch(name, state) {
    await this.ensureOpen();
    await this.openTab('通用设置').catch(() => {});
    const control = this._switchControl(name);
    if (!(await control.isVisible().catch(() => false))) return this;
    if ((await this._controlState(control)) !== state) {
      await control.click({ timeout: 8000 }).catch(() => control.click({ force: true, timeout: 5000 }));
      await this.page.waitForTimeout(600);
    }
    return this;
  }

  /* ---------- 设置下拉选择器（M10） ----------
   * 通用设置里除语言外，「排队发送」也是下拉选择器（aria-haspopup=menu，非开关）。 */
  /** 打开指定下拉选择器的菜单，返回可见菜单项（仅读取，不选择） */
  async openSelectorMenu(label) {
    await this.ensureOpen();
    await this.openTab('通用设置').catch(() => {});
    const trigger = this.page.locator('[role="dialog"] button[aria-haspopup="menu"]')
      .filter({ hasText: new RegExp(label) }).first();
    await trigger.click({ timeout: 8000 }).catch(() => {});
    await this.page.locator('[role="menuitem"]').first().waitFor({ timeout: 8000 }).catch(() => {});
    await this.page.waitForTimeout(400);
    return this.page.locator('[role="menuitem"]').allInnerTexts();
  }

  /** 关闭打开的下拉菜单 */
  async closeSelectorMenu() {
    await this.page.keyboard.press('Escape').catch(() => {});
    await this.page.waitForTimeout(350);
    return this;
  }

  /* ---------- 快捷键编辑器（M10） ---------- */
  openShortcutEditorButton() {
    return this.page.getByRole('button', { name: '编辑快捷键' });
  }

  async openShortcutEditor() {
    await this.ensureOpen();
    await this.openTab('通用设置').catch(() => {});
    await this.openShortcutEditorButton().click({ timeout: 8000 }).catch(() => {});
    await this.page.getByRole('heading', { name: '快捷键' }).first()
      .waitFor({ timeout: 10000 }).catch(() => {});
    await this.page.waitForTimeout(500);
    return this;
  }

  /** 快捷键编辑器内搜索过滤 */
  async searchShortcut(keyword) {
    const input = this.page.getByPlaceholder('搜索快捷键').first();
    await input.fill(keyword);
    await this.page.waitForTimeout(600);
    return this;
  }

  async closeShortcutEditor() {
    const close = this.page.getByRole('button', { name: '关闭快捷键' }).first();
    if (await close.isVisible().catch(() => false)) await close.click({ timeout: 5000 }).catch(() => {});
    else await this.page.keyboard.press('Escape').catch(() => {});
    await this.page.waitForTimeout(400);
    return this;
  }

  /* ---------- 模型提供商编辑器（M10） ---------- */
  /** 打开「编辑 中转站」弹层（含 模型ID/显示名称/添加模型/保存/取消） */
  async openProviderEditor() {
    await this.ensureOpen();
    await this.openTab('模型').catch(() => {});
    const edit = this.page.getByRole('button', { name: /编辑 中转站/ }).first();
    await edit.click({ timeout: 8000 }).catch(() => {});
    await this.page.locator('[role="dialog"] input').first()
      .waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
    await this.page.waitForTimeout(400);
    return this;
  }

  async cancelProviderEditor() {
    const cancel = this.page.locator('[role="dialog"] button').filter({ hasText: /^取消$/ }).first();
    if (await cancel.isVisible().catch(() => false)) await cancel.click({ timeout: 5000 }).catch(() => {});
    await this.page.waitForTimeout(500);
    return this;
  }

  addProviderButton() {
    return this.page.getByRole('button', { name: '添加模型提供商' }).first();
  }

  /* ---------- Agent 预设辅助操作（M10） ---------- */
  /** 在 Agent 预设页签点某预设的辅助操作（模式说明/如何使用），返回弹层可见性 */
  async openPresetAuxDialog(auxName, presetName) {
    await this.ensureOpen();
    await this.openTab('Agent 预设').catch(() => {});
    const btn = this.page.getByRole('button', { name: new RegExp(`${auxName}: ${presetName}`) }).first();
    if (!(await btn.isVisible().catch(() => false))) return false;
    await btn.click({ timeout: 8000 }).catch(() => {});
    await this.page.waitForTimeout(700);
    return true;
  }
}

module.exports = { SettingsDialogPage, SETTINGS_NAV: NAV_ITEMS };
