// @ts-check
/**
 * 会话级操作组件（M10 探索补盲新增）
 *
 * eline 实测（2026-10-17 探测）：
 *   会话行 hover 显示「会话“<标题>”的操作」按钮，菜单项：
 *     置顶会话 / 重命名 Ctrl+Alt+G / 分叉会话 Ctrl+Shift+F / 归档会话 Ctrl+Alt+A
 *   （同名快捷键可独立触发，但有 region 门控：焦点在输入区时不生效；
 *     菜单驱动无此限制，为用例首选路径。）
 *   归档会话在「仅显示已归档」视图选中后，出现「取消归档」按钮。
 *   重命名弹窗为 [role=dialog] 内 input[aria-label="会话名称"]（预填当前标题）。
 *   注意：未落库的空「新会话」无法重命名/归档（无会话对象）。
 */
const { BasePage } = require('./BasePage');

const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

class SessionOpsPage extends BasePage {
  /** 会话行 hover 后的操作按钮（aria: 会话“<标题>”的操作） */
  opsButton(title) {
    return this.page.locator(`button[aria-label*="的操作"]:visible`)
      .filter({ hasText: /.*/ })
      .first();
  }

  /** 打开指定会话行的操作菜单，返回可见菜单项文本。
   *  不要求 data-row-key：搜索结果行同样可走菜单（搜索态行无 data-row-key）。 */
  async openOpsMenu(title) {
    const row = this.page.locator('[role="treeitem"]')
      .filter({ hasText: title }).first();
    await row.waitFor({ state: 'visible', timeout: 15000 });
    await row.hover().catch(() => {});
    await this.page.waitForTimeout(400);
    const btn = this.page.locator(`button[aria-label*="的操作"]`).locator('visible=true').first();
    await btn.click({ timeout: 8000 }).catch(() => btn.click({ force: true, timeout: 5000 }));
    await this.page.locator('[role="menuitem"]').first().waitFor({ timeout: 8000 });
    await this.page.waitForTimeout(300);
    return (await this.page.locator('[role="menuitem"]').allInnerTexts()).map(t => t.trim().replace(/\n/g, ' '));
  }

  async closeMenu() {
    await this.page.keyboard.press('Escape').catch(() => {});
    await this.page.waitForTimeout(350);
    return this;
  }

  /** 通过操作菜单重命名会话 */
  async renameViaMenu(title, newTitle) {
    await this.openOpsMenu(title);
    await this.page.locator('[role="menuitem"]').filter({ hasText: /重命名/ }).first().click();
    const input = this.page.locator('[role="dialog"] input[aria-label="会话名称"]').first();
    await input.waitFor({ state: 'visible', timeout: 10000 });
    await input.fill(newTitle);
    await this.page.keyboard.press('Enter').catch(() => {});
    await this.page.waitForTimeout(1000);
    return this;
  }

  /** 通过操作菜单归档会话 */
  async archiveViaMenu(title) {
    await this.openOpsMenu(title);
    await this.page.locator('[role="menuitem"]').filter({ hasText: /归档会话/ }).first().click();
    await this.page.waitForTimeout(1200);
    return this;
  }

  /** 通过操作菜单分叉会话 */
  async forkViaMenu(title) {
    await this.openOpsMenu(title);
    await this.page.locator('[role="menuitem"]').filter({ hasText: /分叉会话/ }).first().click();
    await this.page.waitForTimeout(1500);
    return this;
  }

  /** 「取消归档」按钮（归档视图中选中归档会话后出现） */
  unarchiveButton() {
    return this.page.getByRole('button', { name: '取消归档' }).first();
  }

  async unarchiveViaButton() {
    await this.unarchiveButton().click({ timeout: 8000 });
    await this.page.waitForTimeout(1200);
    return this;
  }

  /* ---------- 快捷键绑定读取（设置→编辑快捷键） ---------- */
  /** 从快捷键编辑器读某功能的当前绑定（如「归档会话」→ "Ctrl + Alt + A"）。
   *  行文本为多行（名称\nCtrl\n+\nAlt\n+\nA），取含该功能的最小可见元素解析。 */
  async shortcutOf(feature) {
    return this.page.evaluate((feat) => {
      const els = [...document.querySelectorAll('li, [role="row"], div, button')]
        .filter((e) => {
          const r = e.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && r.height < 80
            && (e.innerText || '').replace(/\n/g, ' ').includes(feat);
        });
      els.sort((a, b) => a.getBoundingClientRect().height - b.getBoundingClientRect().height);
      for (const e of els) {
        const t = (e.innerText || '').replace(/\n/g, ' ');
        const m = t.match(/((?:Ctrl|Alt|Shift|Mod)(?:\s*\+\s*(?:Ctrl|Alt|Shift|Mod|\S+))+)/);
        if (m) return m[1];
      }
      return '';
    }, feature);
  }

  /* ---------- 会话头部菜单 ---------- */
  moreActionsButton() {
    return this.page.getByRole('button', { name: '更多操作' }).first();
  }

  openWithButton() {
    return this.page.getByRole('button', { name: '更多打开方式' }).first();
  }

  /** 打开头部菜单并返回可见菜单项文本 */
  async openMenu(buttonLoc) {
    await buttonLoc.click({ timeout: 5000 }).catch(() => {});
    await this.page.locator('[role="menuitem"]').first().waitFor({ timeout: 8000 }).catch(() => {});
    await this.page.waitForTimeout(400);
    return (await this.page.locator('[role="menuitem"]').allInnerTexts()).map(t => t.trim().replace(/\n/g, ' '));
  }

  async closeMenu() {
    await this.page.keyboard.press('Escape').catch(() => {});
    await this.page.waitForTimeout(350);
    return this;
  }

  /**
   * 会话「更多操作」→「下载 Session 日志」（指令面板「下载日志」走同一导出链路）。
   * web 形态：断言 renderer download 事件；
   * electron 形态：导出走主进程保存对话框——桩掉 showSaveDialog 落到临时目录后轮询文件生成。
   * @returns {Promise<{filename: string}>}
   */
  async downloadSessionLog() {
    if (this.electronApp) {
      const path = require('path');
      const fs = require('fs');
      const savePath = path.join(require('os').tmpdir(), `m10-session-export-${Date.now()}.zip`);
      // 桌面导出走主进程下载流（非 renderer download 事件、非 showSaveDialog）：
      // 拦截所有 session 的 will-download 强制落到临时路径
      await this.electronApp.evaluate(({ session }, p) => {
        const hook = (s) => {
          if (!s) return;
          s.removeAllListeners('will-download');
          s.on('will-download', (event, item) => { item.setSavePath(p); });
        };
        hook(session.defaultSession);
        if (typeof session.getAllSessions === 'function') {
          for (const s of session.getAllSessions()) hook(s);
        }
      }, savePath);

      await this.moreActionsButton().click({ timeout: 5000 }).catch(() => {});
      const item = this.page.locator('[role="menuitem"]').filter({ hasText: /下载 Session 日志/ }).first();
      await item.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});
      await item.click({ timeout: 5000 }).catch(() => {});

      const deadline = Date.now() + 30000;
      while (Date.now() < deadline) {
        if (fs.existsSync(savePath)) {
          return { filename: path.basename(savePath) };
        }
        await new Promise(r => setTimeout(r, 500));
      }
      throw new Error(`桌面端导出未生成文件: ${savePath}（will-download 拦截未命中，可能走自定义保存流）`);
    }

    const downloadPromise = this.page.waitForEvent('download', { timeout: 30000 });
    await this.moreActionsButton().click({ timeout: 5000 }).catch(() => {});
    const item = this.page.locator('[role="menuitem"]').filter({ hasText: /下载 Session 日志/ }).first();
    await item.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});
    await item.click({ timeout: 5000 }).catch(() => {});
    const download = await downloadPromise;
    return { filename: download.suggestedFilename() };
  }
}

module.exports = { SessionOpsPage };
