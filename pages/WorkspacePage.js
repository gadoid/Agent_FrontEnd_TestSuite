// @ts-check
/**
 * 工作区组件（侧栏工作区树 + 工作区操作 + 会话归属）
 *
 * 官方版实测（2026-10 真机探测）——工作区模型与社区版**根本不同**：
 *   社区版：侧栏底部有个常驻「选择工作区」按钮，点开菜单选工作区（=当前工作区）
 *   官方版：**没有该按钮**。侧栏是一棵两段式树，工作区行下挂会话行：
 *     工作区行  div[role="treeitem"][data-row-key="workspace:<uuid>"]（aria-expanded 表示展开/折叠）
 *     会话行    div[role="treeitem"][data-row-key="session:<uuid>"]（aria-selected 表示当前会话）
 *   点击工作区行只是**展开/折叠**，不是「切为当前工作区」——树里根本没有「当前工作区」标记。
 *   `选择工作区` 这个 aria-label 只存在于空态 hero 的工作区 chip 上，且该 chip 在已选工作区时
 *   不是按钮、异步渲染，读不到稳定文本。
 *
 * 因此本组件**不再提供"读当前工作区"**，改为依赖三个稳定得多的信号：
 *   1. 树行文本（工作区是否存在 / 标题是什么）
 *   2. button[aria-label="在“<title>”中新建会话"]（官方版新增，直接把会话建在指定工作区）
 *   3. button[aria-label="工作区“<title>”的操作"]（重命名 / 删除，逐字保留）
 *
 * Agent 预设（模式）已迁出到 pages/AgentPresetPage.js。
 */
const { BasePage } = require('./BasePage');

class WorkspacePage extends BasePage {
  /* ---------- 工作区树 ---------- */

  /** 全部工作区行 */
  rows() {
    return this.page.locator('div[role="treeitem"][data-row-key^="workspace:"]');
  }

  /** 指定标题的工作区行（文本精确匹配，避免前缀误命中） */
  row(title) {
    return this.rows().filter({ hasText: title });
  }

  /** 工作区是否存在 */
  async exists(title) {
    // 用 evaluate 做精确相等，避免 hasText 的子串匹配把 -renamed 也算进来
    return this.page.evaluate((t) => [...document.querySelectorAll('div[role="treeitem"][data-row-key^="workspace:"]')]
      .some(e => (e.innerText || '').trim() === t), title);
  }

  /** 全部工作区标题（按树中顺序） */
  async titles() {
    return this.page.evaluate(() => [...document.querySelectorAll('div[role="treeitem"][data-row-key^="workspace:"]')]
      .map(e => (e.innerText || '').trim()));
  }

  /** 展开/折叠指定工作区（点击树行本身） */
  async toggle(title) {
    await this.row(title).first().click();
    await this.page.waitForTimeout(600);
    return this;
  }

  /**
   * 在指定工作区中新建会话（官方版新增的 aria-label，比社区版绕菜单稳得多）。
   * 注意：该按钮平时 visibility:hidden，hover 所在工作区行才揭示 —— 必须先 hover。
   */
  async newSessionIn(title) {
    const row = this.row(title).first();
    await row.waitFor({ timeout: 15000 });
    await row.hover().catch(() => {});
    await this.page.waitForTimeout(300);
    const btn = this.page.getByRole('button', { name: `在“${title}”中新建会话` });
    await btn.waitFor({ state: 'attached', timeout: 10000 });
    await btn.click({ timeout: 10000 }).catch(() => btn.click({ force: true }));
    await this.page.waitForTimeout(1200);
    return this;
  }

  /** 「添加工作区」入口（会拉起目录选择；自动化请走 fixtures/workspace-api 的 RPC） */
  addWorkspaceEntry() {
    return this.page.getByRole('button', { name: '添加工作区' });
  }

  /* ---------- 会话行 ---------- */
  sessionRows() {
    return this.page.locator('div[role="treeitem"][data-row-key^="session:"]');
  }

  /** 当前选中的会话行（aria-selected="true"，官方版给会话行保留了这个标记） */
  selectedSession() {
    return this.page.locator('div[role="treeitem"][data-row-key^="session:"][aria-selected="true"]');
  }

  /* ---------- 工作区操作菜单（重命名 / 删除） ---------- */
  opsButton(title) {
    return this.page.getByRole('button', { name: `工作区“${title}”的操作` });
  }

  async openOpsMenu(title) {
    // 操作按钮平时不渲染/不可见，须先 hover 所在工作区行才会出现——
    // 因此不能直接等按钮 attached，得先定位行、滚入视口、hover。
    const row = this.row(title).first();
    await row.waitFor({ state: 'attached', timeout: 15000 });
    await row.scrollIntoViewIfNeeded().catch(() => {});
    await row.hover().catch(() => {});
    await this.page.waitForTimeout(400);

    const btn = this.opsButton(title).first();
    await btn.waitFor({ state: 'attached', timeout: 10000 });
    await btn.click({ timeout: 5000 }).catch(() => btn.click({ force: true }));
    await this.page.locator('[role="menuitem"]').filter({ hasText: /重命名|删除工作区/ }).first()
      .waitFor({ timeout: 10000 });
    return this;
  }

  opsMenuItem(name) {
    return this.page.locator('[role="menuitem"]').filter({ hasText: name }).first();
  }

  /* ---------- 通用弹窗控件（重命名/删除确认共用） ---------- */
  dialogInput() {
    return this.page.locator('[role="dialog"] input, [role="dialog"] [role="textbox"]').first();
  }

  dialogButton(name) {
    return this.page.locator('[role="dialog"] button').filter({ hasText: name }).first();
  }

  /** 走 UI 流程重命名：操作菜单 → 重命名 → 填新标题 → 确认 */
  async renameViaUi(title, newTitle) {
    await this.openOpsMenu(title);
    await this.opsMenuItem('重命名').click();
    await this.dialogInput().waitFor({ timeout: 10000 });
    await this.dialogInput().fill(newTitle);
    const confirm = this.dialogButton(/确定|重命名|保存/);
    if (await confirm.count()) await confirm.click();
    else await this.page.locator('[role="dialog"] button:not([disabled])').last().click();
    await this.page.waitForTimeout(1200);
    return this;
  }

  /** 走 UI 流程删除：操作菜单 → 删除工作区 → 确认弹窗 */
  async deleteViaUi(title) {
    await this.openOpsMenu(title);
    await this.opsMenuItem('删除工作区').click();
    await this.page.locator('[role="dialog"]').waitFor({ timeout: 10000 });
    const del = this.dialogButton(/删除|确定/);
    if (await del.count()) await del.click();
    else await this.page.locator('[role="dialog"] button:not([disabled])').last().click();
    await this.page.waitForTimeout(1200);
    return this;
  }
}

module.exports = { WorkspacePage };
