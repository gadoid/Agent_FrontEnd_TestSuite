// @ts-check
/**
 * 侧边栏组件：品牌 / 折叠 / 新建会话 / 插件 / 搜索 / 视图选项 / 工作区树 / 设置
 *
 * eline 实测（2026-10，eline.exe v0.2.0-rc.2 定制构建，与官方 DSH 同代码基座）：
 *   品牌位按钮  button[aria-label="新建会话"]（**已无文本**，只剩 logo，取 first()）；
 *              侧栏折叠后同一位置变为 button[aria-label="打开侧边栏"]
 *   折叠按钮    button[aria-label="收起侧边栏"]（侧栏头部右侧）
 *   新建会话    button[aria-label="新建会话"]（带快捷键提示 Ctrl+Alt+N，取 last()）
 *   插件入口    button[aria-label="插件"]（→ 侧栏插件页）
 *   搜索        button[aria-label="搜索会话"] + input[placeholder="搜索会话名称"]
 *   视图选项    button[aria-label="视图选项"]（分组：按工作区/按工作区树/单列表 等）
 *   添加工作区  button[aria-label="添加工作区"]（注意：无省略号）
 *   工作区行    div[role="treeitem"][data-row-key="workspace:<uuid>"]
 *   会话行      div[role="treeitem"][data-row-key="session:<uuid>"]，当前会话带 aria-selected="true"
 *   设置入口    web 形态 button[aria-label="设置"]；桌面形态「账号菜单」→ 菜单里的「设置」
 *
 * data-row-key 是最稳的树钩子（比构建 hash 类名可靠）。
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

  /* ---------- 左上角 折叠/打开 会话页（eline 实测） ----------
   * 侧栏头部按钮 button[aria-label="收起侧边栏"]；
   * 折叠后整个侧栏收起，品牌位变为 button[aria-label="打开侧边栏"]（文本只剩 logo）。 */
  collapseSidebarButton() {
    return this.page.getByRole('button', { name: '收起侧边栏' });
  }

  expandSidebarButton() {
    return this.page.getByRole('button', { name: '打开侧边栏' });
  }

  /** 折叠左侧会话页（侧栏） */
  async collapseSidebar() {
    await this.collapseSidebarButton().click();
    await this.expandSidebarButton().waitFor({ timeout: 10000 }).catch(() => {});
    await this.page.waitForTimeout(500);
    return this;
  }

  /** 重新打开左侧会话页 */
  async expandSidebar() {
    await this.expandSidebarButton().click();
    await this.newSessionButton().waitFor({ timeout: 10000 }).catch(() => {});
    await this.page.waitForTimeout(500);
    return this;
  }

  /** 侧栏是否处于折叠态 */
  async sidebarCollapsed() {
    return this.expandSidebarButton().isVisible().catch(() => false);
  }

  /* ---------- 视图选项（分组/排序/筛选） ----------
   * 实测菜单项：按工作区 / 按工作区树 / 单列表 / 手动排序 / 最近更新 /
   *             隐藏已归档 / 全部对话（显示已归档） / 仅显示已归档 */
  async openViewOptionsMenu() {
    await this.viewOptionsButton().click();
    await this.page.locator('[role="menuitem"]').first().waitFor({ timeout: 10000 });
    await this.page.waitForTimeout(400);
    return this.page.locator('[role="menuitem"]').allInnerTexts();
  }

  /** 点击视图选项菜单里的某一项（如「按工作区树」）并等树重渲染 */
  async pickViewOption(name) {
    await this.page.locator('[role="menuitem"]').filter({ hasText: name }).first().click();
    await this.page.waitForTimeout(800);
    return this;
  }

  /* ---------- 会话切换 ----------
   * 会话树行 div[role="treeitem"][data-row-key^="session:"]，
   * 当前会话行带 aria-selected="true"。点击行即切换会话。 */

  /** 按序号取会话树行（0 起） */
  sessionRow(index) {
    return this.sessionRows().nth(index);
  }

  /** 点击树中第 index 个会话行完成切换 */
  async switchToSession(index) {
    const row = this.sessionRow(index);
    await row.waitFor({ state: 'visible', timeout: 15000 });
    await row.click();
    await this.page.waitForTimeout(1200);
    return this;
  }

  /** 当前选中的会话行文本（aria-selected="true"） */
  async selectedSessionText() {
    const sel = this.page.locator('div[role="treeitem"][data-row-key^="session:"][aria-selected="true"]');
    return (await sel.count()) ? (await sel.first().innerText()).trim() : '';
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
