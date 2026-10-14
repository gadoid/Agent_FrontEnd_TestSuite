// @ts-check
/**
 * 右侧栏组件：会话视图右侧的 对话/轨迹/系统提示词 页签 + 布局按钮（新标签页/分栏/全屏）
 */
const { BasePage } = require('./BasePage');

/** 常驻页签；第三个页签是上下文相关的（系统提示词 / 文件 等），不做硬性断言 */
const REQUIRED_TABS = ['对话', '轨迹'];
const OPTIONAL_TABS = ['系统提示词', '文件'];

class RightPanelPage extends BasePage {
  /**
   * 展开右侧栏（折叠态显示「打开右侧边栏」按钮；
   * 「系统提示词」页签与布局按钮仅在展开后渲染）
   */
  async expand() {
    const expandBtn = this.page.getByRole('button', { name: '打开右侧边栏' });
    if (await expandBtn.count()) {
      await expandBtn.first().click();
      await this.page.waitForTimeout(800);
    }
    return this;
  }

  /** 页签按钮（对话/轨迹/系统提示词；button 或 role=tab 均可命中） */
  tabButton(name) {
    return this.page
      .locator('button, [role="tab"]')
      .filter({ hasText: new RegExp(`^\\s*${name}\\s*$`) })
      .first();
  }

  /** 断言用：常驻页签可见；返回当前实际出现的可选页签 */
  async expectTabsVisible(expect) {
    for (const t of REQUIRED_TABS) {
      await expect(this.tabButton(t)).toBeVisible();
    }
    const present = [];
    for (const t of OPTIONAL_TABS) {
      if (await this.tabButton(t).isVisible().catch(() => false)) present.push(t);
    }
    return present;
  }

  async openTab(name) {
    await this.tabButton(name).click();
    await this.page.waitForTimeout(600);
    return this;
  }

  /* ---------- 布局按钮 ---------- */
  newTabButton() {
    return this.page.getByRole('button', { name: '新标签页', exact: true });
  }

  splitButton() {
    return this.page.getByRole('button', { name: '分栏', exact: true });
  }

  fullscreenButton() {
    return this.page.getByRole('button', { name: '全屏', exact: true });
  }

  toggleSidebarButton() {
    return this.page.getByRole('button', { name: /^收起右侧边栏/ });
  }
}

module.exports = { RightPanelPage, REQUIRED_TABS, OPTIONAL_TABS };
