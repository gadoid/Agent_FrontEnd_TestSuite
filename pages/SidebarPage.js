// @ts-check
/**
 * 侧边栏组件：品牌 / 新建会话 / 插件 / 搜索 / 工作区树 / 设置
 *
 * 官方版实测（2026-10 真机探测）：
 *   品牌位按钮  button[aria-label="新建会话"]（**已无文本**，只剩 logo，取 first()）
 *   新建会话    button[aria-label="新建会话"]（class *_newSession，取 last()）
 *   插件入口    button[aria-label="插件"]（→ 侧栏插件页；社区版的「易链市场」已不存在）
 *   搜索        button[aria-label="搜索会话"] + input[placeholder="搜索会话名称"]
 *   视图选项    button[aria-label="视图选项"]（分组/排序/筛选）
 *   添加工作区  button[aria-label="添加工作区"]（注意：无省略号）
 *   工作区行    div[role="treeitem"][data-row-key="workspace:<uuid>"]
 *   会话行      div[role="treeitem"][data-row-key="session:<uuid>"]，当前会话带 aria-selected="true"
 *
 * 会话/工作区树已从「侧栏自绘」搬进 @deepseek-ai/dsh-client-ui-workspace，
 * data-row-key 是最稳的钩子（比构建 hash 类名可靠）。
 */
const { BasePage } = require('./BasePage');

class SidebarPage extends BasePage {
  /** 品牌位按钮（aria-label 同为「新建会话」，取 first()） */
  brandButton() {
    return this.page.getByRole('button', { name: '新建会话' }).first();
  }

  /** 「新建会话」按钮（与品牌按钮同名，取 last()） */
  newSessionButton() {
    return this.page.getByRole('button', { name: '新建会话' }).last();
  }

  /** 插件入口（侧栏「插件」页） */
  pluginsButton() {
    return this.page.getByRole('button', { name: '插件', exact: true });
  }

  /** 设置入口。
   *  **双端不同**：web 形态是 `button[aria-label="设置"]`；
   *  桌面形态是侧栏底部 `button[aria-label="账号菜单"]`（头像），点开菜单里才有「设置」。 */
  settingsButton() {
    return this.page.getByRole('button', { name: /^(设置|账号菜单)$/ });
  }

  /** 搜索会话输入框（官方版 placeholder 为「搜索会话名称」） */
  searchInput() {
    return this.page.getByPlaceholder('搜索会话名称');
  }

  /** 搜索按钮（点击展开搜索框） */
  searchButton() {
    return this.page.getByRole('button', { name: '搜索会话' });
  }

  /** 视图选项（分组方式 / 排序方式 / 筛选会话） */
  viewOptionsButton() {
    return this.page.getByRole('button', { name: '视图选项' });
  }

  /** 「添加工作区」入口（会拉起目录选择，自动化请走 WorkspacePage / RPC） */
  addWorkspaceButton() {
    return this.page.getByRole('button', { name: '添加工作区' });
  }

  /** 工作区树行 */
  workspaceRows() {
    return this.page.locator('div[role="treeitem"][data-row-key^="workspace:"]');
  }

  /** 会话树行 */
  sessionRows() {
    return this.page.locator('div[role="treeitem"][data-row-key^="session:"]');
  }

  /** 新建会话 */
  async newSession() {
    await this.newSessionButton().click();
    await this.page.waitForTimeout(600);
    return this;
  }

  /** 打开侧栏「插件」页 */
  async openPlugins() {
    await this.pluginsButton().click();
    await this.page.waitForTimeout(1000);
    return this;
  }

  /** 打开设置。注意：官网版侧栏在「新建会话」按钮出现后仍有一小段不可交互窗口，
   *  直接点会静默失败（后续所有设置相关断言连锁失败），因此这里点了要等面板真的出现。 */
  async openSettings() {
    await this.dismissOnboarding();
    const nav = this.page.locator('[class*="navList"] button');
    for (let i = 0; i < 3; i++) {
      await this.settingsButton().first().click({ timeout: 10000 }).catch(() => {});
      // 桌面形态：点「账号菜单」后，菜单里再点「设置」
      const menuItem = this.page.getByRole('menuitem', { name: '设置' });
      if (await menuItem.count().catch(() => 0)) {
        await menuItem.first().click({ timeout: 5000 }).catch(() => {});
      }
      const opened = await nav.first().waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false);
      if (opened) return this;
      await this.page.keyboard.press('Escape').catch(() => {});
      await this.page.waitForTimeout(800);
    }
    throw new Error('设置面板未能打开（已重试 3 次）。web 形态点「设置」；桌面形态点「账号菜单」→ 菜单里的「设置」');
  }

  /**
   * 搜索会话并返回过滤后的结果条目数。
   *
   * 实测：搜索态下结果行**不再带 `session:` 前缀的 data-row-key**（每行尾部还内联显示所属
   * 工作区名），因此不能用 sessionRows() 计数；这里直接数树里的 treeitem。
   * 过滤由应用自身完成，无需自行按文本二次过滤。
   */
  async searchSessions(keyword) {
    if (!(await this.searchInput().isVisible().catch(() => false))) {
      await this.searchButton().click().catch(() => {});
      await this.page.waitForTimeout(600);
    }
    await this.searchInput().fill(keyword);
    await this.page.waitForTimeout(1500);
    return this.page.locator('[role="tree"] [role="treeitem"]').count();
  }
}

module.exports = { SidebarPage };
