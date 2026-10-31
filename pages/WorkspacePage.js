// @ts-check
/**
 * 工作区组件（侧栏工作区树 + 选择工作区 + 工作区操作 + 会话归属）
 *
 * eline 实测（2026-10，eline.exe v0.2.0-rc.2 定制构建）——与官方 DSH 同代码基座，
 * 但 eline 在 hero 区恢复了**常驻「选择工作区」按钮**（官方版已移除）：
 *   button[aria-label="选择工作区"]（文本=当前工作区名，aria-haspopup=menu）
 *   菜单项 = 工作区列表 + 「添加工作区…」
 *
 * 工作区树不变：
 *   工作区行  div[role="treeitem"][data-row-key="workspace:<uuid>"]
 *   会话行    div[role="treeitem"][data-row-key="session:<uuid>"]（aria-selected 标记当前会话）
 *   稳定信号：树行文本 / button[aria-label="在“<title>”中新建会话"] /
 *            button[aria-label="工作区“<title>”的操作"]（重命名/删除）
 *
 * 「添加工作区」的 UI 会拉起 OS 目录选择器，自动化走 fixtures/workspace-api 的同源 RPC。
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

  /* ---------- 选择工作区（eline 恢复了常驻选择器，官方版没有） ----------
   * hero 区 button[aria-label="选择工作区"]（文本=当前工作区名），
   * 菜单项为全部工作区 + 「添加工作区…」。 */
  workspacePickerButton() {
    return this.page.getByRole('button', { name: '选择工作区' });
  }

  /** 当前选中的工作区名（选择器按钮文本） */
  async currentWorkspace() {
    const btn = this.workspacePickerButton();
    if (!(await btn.count())) return '';
    return (await btn.first().innerText()).trim();
  }

  /**
   * 清掉残留的 hover 预览浮层（Rx-Pca_hoverContent：会话行/消息卡的悬停预览卡）。
   * 2026-10-31 构建实测：该卡**只在点击其它区域时关闭**，鼠标移开/Esc 均不关
   * （见 scripts/probe-rc8b-hover-dismiss.js m1-m4）；残留时 hovering 区外控件
   * （如 hero 的 选择工作区）会被它拦截点击——手工用户先点了别处所以无感。
   * 处理：存在浮层时在主区域底部空白处点一下（click-outside 关闭），无浮层则零开销。
   */
  async dismissHoverOverlay() {
    const has = await this.page.evaluate(() => !!document.querySelector('[class*="hoverContent"]'));
    if (!has) return;
    await this.page.mouse.click(720, 860).catch(() => {});
    await this.page.waitForTimeout(500);
  }

  /** 打开选择工作区菜单，返回菜单项文本（含「添加工作区…」） */
  async openPickerMenu() {
    await this.dismissHoverOverlay();
    const btn = this.workspacePickerButton();
    await btn.click({ timeout: 8000 })
      .catch(async () => { await this.dismissHoverOverlay(); await btn.click({ force: true, timeout: 5000 }).catch(() => {}); });
    await this.page.locator('[role="menuitem"]').first().waitFor({ timeout: 10000 });
    await this.page.waitForTimeout(400);
    return this.page.locator('[role="menuitem"]').allInnerTexts();
  }

  /** 在选择工作区菜单里选中指定工作区 */
  async pickWorkspace(title) {
    await this.page.locator('[role="menuitem"]').filter({ hasText: title }).first().click();
    await this.page.waitForTimeout(800);
    return this;
  }

  closePickerMenu() {
    return this.page.keyboard.press('Escape');
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
