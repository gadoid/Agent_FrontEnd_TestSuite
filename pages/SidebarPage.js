// @ts-check
/** 侧边栏组件：品牌 / 新建会话 / 易链市场 / 搜索会话 / 工作区 / 设置 入口 */
const { BasePage } = require('./BasePage');

class SidebarPage extends BasePage {
  /** 品牌按钮（外贸赋能中心 + 版本号），aria-label 同为「新建会话」，取 first() */
  brandButton() {
    return this.page.getByRole('button', { name: '新建会话' }).first();
  }

  /** 「新建会话」按钮（与品牌按钮同名，取 last()） */
  newSessionButton() {
    return this.page.getByRole('button', { name: '新建会话' }).last();
  }

  marketButton() {
    return this.page.getByRole('button', { name: '易链市场' });
  }

  settingsButton() {
    return this.page.getByRole('button', { name: '设置' });
  }

  searchInput() {
    return this.page.getByPlaceholder('搜索会话…');
  }

  /** 新建会话 */
  async newSession() {
    await this.newSessionButton().click();
    await this.page.waitForTimeout(600);
    return this;
  }

  /** 打开易链市场（插件） */
  async openMarket() {
    await this.marketButton().click();
    await this.page.getByRole('button', { name: '刷新目录' }).waitFor({ timeout: 15000 });
    return this;
  }

  /** 打开设置 */
  async openSettings() {
    await this.settingsButton().click();
    await this.page.getByRole('button', { name: '通用设置' }).waitFor({ timeout: 10000 });
    return this;
  }

  /** 搜索会话并返回过滤后匹配关键字的会话条目数（treeitem） */
  async searchSessions(keyword) {
    await this.searchInput().fill(keyword);
    await this.page.waitForTimeout(1000);
    if (keyword === '') return this.page.locator('[role="treeitem"]').count();
    return this.page.locator('[role="treeitem"]', { hasText: keyword }).count();
  }

  /** 当前工作区名称（底部工作区选择按钮文本） */
  async currentWorkspaceName() {
    return (await this.page.getByRole('button', { name: '选择工作区' }).innerText()).trim();
  }

  /** 应用版本号文本，如 "0.1.5-rc.1-18a8c50" */
  async appVersion() {
    const text = await this.brandButton().innerText();
    const m = text.match(/[\d.]+[-\w.]*\b[\w]+\b/);
    return m ? m[0] : text.trim();
  }
}

module.exports = { SidebarPage };
