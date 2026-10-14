// @ts-check
/** 设置弹窗组件：通用设置 / 模型 / 插件 / Agent 预设 四个页签 */
const { BasePage } = require('./BasePage');

const TABS = ['通用设置', '模型', '插件', 'Agent 预设'];

class SettingsDialogPage extends BasePage {
  tabButton(name) {
    return this.page.getByRole('button', { name, exact: name !== '插件' });
  }

  closeButton() {
    return this.page.getByRole('button', { name: '关闭' }).first();
  }

  /** 切换页签并等待渲染 */
  async openTab(name) {
    if (!TABS.includes(name)) throw new Error(`未知设置页签: ${name}，可选: ${TABS.join('/')}`);
    await this.tabButton(name).click();
    await this.page.waitForTimeout(600);
    return this;
  }

  /** 断言用：所有页签可见 */
  async expectTabsVisible(expect) {
    for (const t of TABS) {
      await expect(this.tabButton(t)).toBeVisible();
    }
  }

  async close() {
    await this.closeButton().click();
    await this.page.waitForTimeout(400);
  }

  /* ---------- 主题切换（通用设置页快捷区） ---------- */
  themeButton(name) {
    // 「浅色」「深色」「跟随系统」
    return this.page.getByRole('button', { name, exact: true });
  }

  /** 切换主题并返回 body 背景色的亮度（0-255，深色主题应显著更低） */
  async switchTheme(name) {
    await this.themeButton(name).click();
    await this.page.waitForTimeout(800);
    return this.page.evaluate(() => {
      const rgb = getComputedStyle(document.body).backgroundColor.match(/\d+/g) || ['0', '0', '0'];
      return Math.round((+rgb[0] * 299 + +rgb[1] * 587 + +rgb[2] * 114) / 1000);
    });
  }
}

module.exports = { SettingsDialogPage, SETTINGS_TABS: TABS };
