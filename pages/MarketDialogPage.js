// @ts-check
/**
 * 易链市场（插件市场）组件
 *
 * 结构：两个页签「插件目录」（可安装）/「已安装」；
 * 已安装条目格式：插件 id + 状态（运行中/未加载）+ 版本 + 启用/停用 按钮。
 */
const { BasePage } = require('./BasePage');

class MarketDialogPage extends BasePage {
  catalogTab() {
    return this.page.getByRole('button', { name: '插件目录' });
  }

  installedTab() {
    return this.page.getByRole('button', { name: '已安装' });
  }

  refreshButton() {
    return this.page.getByRole('button', { name: '刷新目录' });
  }

  /** 插件目录中所有「安装 vX.Y.Z」按钮 */
  installButtons() {
    return this.page.locator('button', { hasText: /^安装\s*v?\d/ });
  }

  /** 已安装列表中的插件 id 文本集合 */
  async installedPluginIds() {
    await this.installedTab().click();
    await this.page.waitForTimeout(800);
    const ids = await this.page.evaluate(() => {
      const out = [];
      // 已安装面板中，插件 id 是以 @ 开头的 span/div，或形如 xxx-yyy 的短 id 行
      document.querySelectorAll('span, div').forEach(el => {
        if (el.children.length === 0) {
          const t = (el.innerText || '').trim();
          if (/^(@[\w-]+\/[\w.-]+|[a-z][\w-]{2,})$/.test(t) && t.length < 60) out.push(t);
        }
      });
      return [...new Set(out)];
    });
    return ids;
  }

  async openCatalog() {
    await this.catalogTab().click();
    await this.page.waitForTimeout(800);
    return this;
  }

  /** 安装插件目录中第 idx 个可安装插件，返回安装按钮文本（含版本） */
  async installFirst({ index = 0 } = {}) {
    await this.openCatalog();
    const btn = this.installButtons().nth(index);
    await btn.waitFor({ timeout: 10000 });
    const label = await btn.innerText();
    await btn.click();
    return label.trim();
  }

  /** 等待安装动作出现的反馈：按钮消失 / 变为已安装 / 出现加载态。返回是否观察到变化 */
  async waitForInstallFeedback(timeout = 60000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const remaining = await this.installButtons().count();
      if (remaining === 0) return true;
      await this.page.waitForTimeout(2000);
    }
    return false;
  }

  /** 关闭市场弹窗：短超时点「关闭」，失败则 Esc 兜底（服务慢时按钮可能未就绪，勿挂满默认超时） */
  async close() {
    const btn = this.page.getByRole('button', { name: '关闭' }).first();
    if (!(await btn.isVisible().catch(() => false))) return;
    await btn.click({ timeout: 3000 }).catch(() => {});
    await this.page.keyboard.press('Escape').catch(() => {});
    await this.page.waitForTimeout(400);
  }
}

module.exports = { MarketDialogPage };
