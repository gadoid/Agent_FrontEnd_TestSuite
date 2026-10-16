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
}

module.exports = { PluginManagerPage };
