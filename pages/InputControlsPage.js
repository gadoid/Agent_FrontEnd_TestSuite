// @ts-check
/**
 * 输入区周边控件：指令/文件入口 / 模型选择器 / 访问模式
 *
 * 官方版实测（2026-10 真机探测）：
 *   文件/指令入口  button[aria-label="添加文件或调用指令"][aria-haspopup="listbox"]
 *                  —— 社区版独立的「指令」按钮已不存在，指令改由该入口的
 *                  listbox 承载，另可用 `/` 快捷键唤起
 *   模型选择器     button[aria-label^="选择模型"]（显示 "eline-relay/deepseek-v4-pro" 等）
 *                  菜单容器 aria-label = 「模型与推理等级」（含推理等级行，解析需排除）
 *   访问模式       button[aria-label^="访问模式"]（显示 "工作区内修改" 等）
 */
const { BasePage } = require('./BasePage');

class InputControlsPage extends BasePage {
  /* ---------- 指令 / 文件入口 ---------- */
  commandsButton() {
    return this.page.getByRole('button', { name: '添加文件或调用指令' });
  }

  /** 打开指令/文件面板，返回面板内的选项 locator */
  async openCommandPalette() {
    await this.commandsButton().click();
    await this.page.waitForTimeout(1000);
    return this.page.locator('[role="option"], [role="menuitem"], [role="listbox"] [role="option"]');
  }

  /** 面板中可见的指令项文本 */
  async commandItems() {
    return this.page.evaluate(() => {
      const hits = [];
      document.querySelectorAll('[role="option"], [role="menuitem"]').forEach(el => {
        const t = (el.innerText || '').trim();
        if (t && t.length > 1 && t.length < 60) hits.push(t.replace(/\n/g, ' '));
      });
      return [...new Set(hits)].slice(0, 20);
    });
  }

  closeCommandPalette() {
    return this.page.keyboard.press('Escape');
  }

  /* ---------- 模型选择器 ---------- */
  modelButton() {
    return this.page.getByRole('button', { name: /^选择模型/ });
  }

  /** 当前模型名。
   *  实测按钮文本是两行：「模型名 / 推理等级」（如 "DeepSeek-V41-Flash" + "High"），只取首行，
   *  否则与菜单里的模型名比对会因多出的推理等级而对不上。 */
  async currentModel() {
    const raw = await this.modelButton().innerText();
    return raw.trim().split(/\r?\n/)[0].trim();
  }

  /** 所有可见弹层的文本行（只用 role 锚定；社区版依赖的 *_menu hash 类名已失效） */
  async visibleMenuLines() {
    return this.page.evaluate(() => {
      const lines = [];
      document.querySelectorAll('[role="menu"], [role="listbox"], [role="dialog"]').forEach(el => {
        if (!(el.offsetWidth || el.offsetHeight)) return; // 不可见
        (el.innerText || '').split('\n').forEach(l => lines.push(l.trim()));
      });
      return [...new Set(lines)];
    });
  }

  /**
   * 打开模型菜单，返回弹层内的模型名行。
   * 官方版菜单是「模型与推理等级」，含推理等级行（如 High / Medium / Low）与搜索框，
   * 因此过滤条件同时要求：像模型标识（含 - 或 / 且含数字），排除纯中文与推理等级词。
   */
  async openModelMenu() {
    await this.modelButton().click();
    await this.page.waitForTimeout(1200);
    const lines = await this.visibleMenuLines();
    const NOISE = /^(High|Medium|Low|Auto|自动|高|中|低|搜索模型|模型与推理等级|DeepSeek 账号)$/i;
    return lines.filter(s =>
      /^[\w][\w./-]*$/.test(s) && /\d/.test(s) && !NOISE.test(s));
  }

  closeModelMenu() {
    return this.page.keyboard.press('Escape');
  }

  /* ---------- 访问模式 ---------- */
  accessModeButton() {
    return this.page.getByRole('button', { name: /^访问模式/ });
  }

  async currentAccessMode() {
    return (await this.accessModeButton().innerText()).trim();
  }

  /** 打开访问模式菜单，返回选项行（实测：仅可查看/工作区内修改/完全权限） */
  async openAccessModeMenu() {
    await this.accessModeButton().click();
    await this.page.waitForTimeout(1200);
    const lines = await this.visibleMenuLines();
    return lines.filter(s => s.length > 1 && s.length < 20);
  }

  closeAccessModeMenu() {
    return this.page.keyboard.press('Escape');
  }
}

module.exports = { InputControlsPage };
