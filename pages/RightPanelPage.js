// @ts-check
/**
 * 右侧栏组件（eline 实测 2026-10）
 *
 * 结构：
 *   展开按钮    button[aria-label="打开右侧边栏"]（折叠态显示）
 *   页签条      [role="tab"]（会话视图常驻 对话/轨迹；右栏自己的 dock 页签也是 role=tab：
 *               开始 / 文件 / cmd.exe 等终端页 / 浏览器）
 *   布局按钮    新标签页（开出 ≥1 个 dock 页签后才渲染）/ 分栏 / 全屏（点击后变「退出全屏」）/
 *               收起右侧边栏（点击后回到「打开右侧边栏」）
 *   「开始」落地页（= 新标签页视图）的入口卡片：
 *               工作区文件（Ctrl+Alt+P）/ 新建终端（Ctrl+`）/ 浏览器（依赖 Electron webview，
 *               web(chromium) 形态不渲染该入口 —— 实测 2026-10）
 *   工作区文件面板：[role="tab"] 文件 + 重新读取 / 用 文件资源管理器 打开 / 更多打开方式
 *   终端面板：  以 shell 名命名的页签（如 cmd.exe）+ .xterm 容器
 */
const { BasePage } = require('./BasePage');

/** 会话视图常驻页签；第三个页签是上下文相关的（系统提示词 / 文件 等），不做硬性断言 */
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

  /**
   * 关闭所有「已恢复」的 dock 页签（页签行内有「关闭」钮的终端/文件等）。
   * rc.7 起 dock 页签状态持久化到 ~/.dsh 并跨应用重启恢复：先前用例开的终端/文件
   * 页签会在新一轮启动时恢复，遮住「开始」落地页与会话的 对话/轨迹 页签。
   * 断言前先清理，保证用例间不因共享 ~/.dsh 而相互耦合。有界循环，绝不让它挂住。
   */
  async closeRestoredTabs({ max = 8 } = {}) {
    for (let i = 0; i < max; i++) {
      const closeBtn = this.page.locator('[role="tab"] button')
        .filter({ hasText: /^关闭$/ })
        .first();
      if (!(await closeBtn.isVisible().catch(() => false))) break;
      await closeBtn.click({ timeout: 5000 }).catch(() => {});
      await this.page.waitForTimeout(600);
    }
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

  exitFullscreenButton() {
    return this.page.getByRole('button', { name: '退出全屏', exact: true });
  }

  toggleSidebarButton() {
    return this.page.getByRole('button', { name: /^收起右侧边栏/ });
  }

  /**
   * 分栏：把右侧栏拆成双栏。实测分栏后 dock 控件成对出现（每栏一套），
   * 以「分栏按钮数量 ≥ 2」为分栏成立的信号。
   */
  async split() {
    await this.splitButton().first().click();
    await this.page.waitForTimeout(1000);
    return this.splitButton().count();
  }

  /** 最大化（全屏）：点击后按钮文本变为「退出全屏」 */
  async maximize() {
    await this.fullscreenButton().first().click();
    await this.exitFullscreenButton().waitFor({ timeout: 10000 }).catch(() => {});
    await this.page.waitForTimeout(600);
    return this.exitFullscreenButton().isVisible().catch(() => false);
  }

  async exitMaximize() {
    const btn = this.exitFullscreenButton();
    if (await btn.count()) {
      await btn.first().click({ timeout: 5000 }).catch(() => {});
      await this.page.waitForTimeout(600);
    }
    return this;
  }

  /** 收起右侧栏，返回折叠后「打开右侧边栏」按钮是否回归 */
  async collapse() {
    await this.toggleSidebarButton().first().click();
    await this.page.waitForTimeout(800);
    return this.page.getByRole('button', { name: '打开右侧边栏' }).isVisible().catch(() => false);
  }

  /* ---------- 「开始」落地页的功能入口（打开工作区文件 / 新建终端 / 浏览器） ---------- */

  /** 「工作区文件」入口卡片（打开工作区文件） */
  workspaceFilesEntry() {
    return this.page.getByRole('button', { name: /工作区文件/ }).first();
  }

  /** 「新建终端」入口卡片（打开新建终端） */
  newTerminalEntry() {
    return this.page.getByRole('button', { name: /新建终端/ }).first();
  }

  /** 「浏览器」入口卡片（Electron webview；web 形态不渲染该入口） */
  browserEntry() {
    return this.page.getByRole('button', { name: /浏览器/ }).first();
  }

  /**
   * 点「新标签页」重新打开「开始」落地页。
   * 实测：开出 ≥1 个页签后落地页关闭、新标签页按钮才出现；且终端（xterm）打开后
   * 普通点击可能因指针捕获被拦截，必须有界重试 + force 兜底。
   * @returns {Promise<boolean>} 落地页是否成功打开（工作区文件入口可见）
   */
  async openLanding() {
    const btn = this.newTabButton();
    if (!(await btn.isVisible().catch(() => false))) return false;
    await btn.click({ timeout: 8000 }).catch(async () => btn.click({ force: true, timeout: 8000 }).catch(() => {}));
    await this.workspaceFilesEntry().waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
    return this.workspaceFilesEntry().isVisible().catch(() => false);
  }

  /** dock「文件」页签：行内有「关闭」钮（会话视图的 文件 页签没有，避免误命中） */
  fileTab() {
    return this.page.locator('[role="tab"]')
      .filter({ hasText: /^\s*文件\s*$/ })
      .filter({ has: this.page.locator('button', { hasText: /^关闭$/ }) })
      .first();
  }

  /** 工作区文件面板的「重新读取」按钮（面板内容渲染后才出现） */
  rereadButton() {
    return this.page.getByRole('button', { name: '重新读取' });
  }

  /**
   * 打开工作区文件面板，返回面板内容是否真正渲染。
   * rc.8 桌面端实测：点「工作区文件」入口只**创建**「文件」页签，不激活
   * （终端等既有页签保持选中，rc.7 会自动激活）——补点页签本身确保面板显示。
   * 成功信号 = 「重新读取」按钮可见（它在面板内容里，页签未激活时不存在）；
   * 不能用「文件页签可见」当信号：页签在页签条上可见 ≠ 面板已显示。
   */
  async openWorkspaceFiles() {
    if (!(await this.workspaceFilesEntry().isVisible().catch(() => false))) {
      if (!(await this.openLanding())) return false;
    }
    await this.workspaceFilesEntry().click({ timeout: 8000 })
      .catch(async () => this.workspaceFilesEntry().click({ force: true, timeout: 8000 }).catch(() => {}));
    await this.fileTab().click({ timeout: 5000 }).catch(() => {});
    await this.page.waitForTimeout(800);
    await this.rereadButton().waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
    return this.rereadButton().isVisible().catch(() => false);
  }

  /** 工作区文件面板的工具按钮（重新读取 / 用 文件资源管理器 打开 / 更多打开方式） */
  filesPanelButtons() {
    return this.page.evaluate(() => [...document.querySelectorAll('button')]
      .filter(b => b.getBoundingClientRect().width > 0)
      .map(b => b.getAttribute('aria-label') || '')
      .filter(a => /重新读取|文件资源管理器|更多打开方式/.test(a)));
  }

  /**
   * 打开新建终端，返回终端页签信息。
   * 实测 web 形态也会真正开终端：页签名是 shell 名（如 cmd.exe），面板内是 .xterm。
   */
  async openTerminal() {
    await this.newTerminalEntry().click({ timeout: 8000 })
      .catch(async () => this.newTerminalEntry().click({ force: true, timeout: 8000 }).catch(() => {}));
    await this.page.waitForTimeout(2500);
    return this.page.evaluate(() => {
      const tabs = [...document.querySelectorAll('[role="tab"]')]
        .filter(t => t.getBoundingClientRect().width > 0)
        .map(t => (t.innerText || '').trim())
        .filter(Boolean);
      const xterm = document.querySelectorAll('.xterm, .xterm-screen, [class*="terminal"]').length;
      return { tabs, xtermLike: xterm };
    });
  }

  /**
   * 尝试打开浏览器页签（依赖 Electron webview）。
   * @returns {Promise<{available:boolean, tabs:string[], address:string|null}>}
   *          available=false 表示当前形态未提供浏览器入口（web 形态实测如此）
   */
  async openBrowser() {
    const entry = this.browserEntry();
    if (!(await entry.isVisible().catch(() => false))) {
      return { available: false, tabs: [], address: null };
    }
    await entry.click({ timeout: 8000 }).catch(() => {});
    await this.page.waitForTimeout(2500);
    return this.page.evaluate(() => {
      const tabs = [...document.querySelectorAll('[role="tab"]')]
        .filter(t => t.getBoundingClientRect().width > 0)
        .map(t => (t.innerText || '').trim())
        .filter(Boolean);
      const addr = document.querySelector('input[class*="address"], input[aria-label*="地址"], input[placeholder*="http"]');
      return { available: true, tabs, address: addr ? 'found' : null };
    });
  }

  /* ---------- 终端输入 / 文件面板内容（M10 探索补盲） ---------- */

  /** 向当前终端（xterm）键入一行命令并回车 */
  async terminalType(line) {
    const term = this.page.locator('.xterm, textarea[data-testid="xterm-helper-textarea"]').first();
    await term.click({ timeout: 8000 }).catch(() => {});
    await this.page.keyboard.type(line, { delay: 20 }).catch(() => {});
    await this.page.keyboard.press('Enter').catch(() => {});
    await this.page.waitForTimeout(1200);
    return this;
  }

  /** 读终端面板可见文本（.xterm-rows；桌面端终端为独立实现无该容器，返回空串） */
  async terminalText() {
    return this.page.evaluate(() => {
      const el = document.querySelector('.xterm-rows') || document.querySelector('.xterm-screen');
      return el ? (el.innerText || '') : '';
    });
  }

  /**
   * 工作区文件面板中是否可见指定文件名（需已打开「文件」面板）。
   * 目录清单非实时 watch（面板有「重新读取」钮）：先点一次刷新再读；
   * 读可见文本而非 DOM 全文——终端页签未激活时其内容不在可见文本里，
   * 避免把终端回显的命令行误当文件名信号。
   */
  async filePanelContains(name) {
    const reread = this.rereadButton();
    if (await reread.isVisible().catch(() => false)) {
      await reread.click({ timeout: 5000 }).catch(() => {});
      await this.page.waitForTimeout(800);
    }
    return this.page.evaluate((n) => document.body.innerText.includes(n), name);
  }
}

module.exports = { RightPanelPage, REQUIRED_TABS, OPTIONAL_TABS };
