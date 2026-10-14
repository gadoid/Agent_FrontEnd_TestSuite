// @ts-check
/**
 * 输入区周边控件：指令面板 / 模型选择器 / 访问模式
 *
 * 实测 DOM：
 *   指令按钮     button[aria-label="指令"]（composer 左下）
 *   模型选择器   button[aria-label^="选择模型"]（显示当前模型名，如 deepseek-v4-pro）
 *   访问模式     button[aria-label^="访问模式"]（显示当前模式，如 工作区内修改）
 *   输入 "/" 也会唤起指令面板
 */
const { BasePage } = require('./BasePage');

class InputControlsPage extends BasePage {
  /* ---------- 指令面板 ---------- */
  commandsButton() {
    return this.page.getByRole('button', { name: '指令' });
  }

  /** 打开指令面板（点「指令」按钮），等待弹出选项 */
  async openCommandPalette() {
    await this.commandsButton().click();
    await this.page.waitForTimeout(1000);
    return this.page.locator('[role="option"], [role="menuitem"]').filter({
      has: this.page.locator(':scope'),
    });
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

  /** 当前模型名（按钮可见文本） */
  async currentModel() {
    return (await this.modelButton().innerText()).trim();
  }

  /** 所有可见菜单弹层的文本行（排除 menuAnchor 锚点容器） */
  async visibleMenuLines() {
    return this.page.evaluate(() => {
      const lines = [];
      document.querySelectorAll('[role="menu"], [role="listbox"], [class*="_menu"], [class*="popover"]').forEach(el => {
        const cls = (el.className || '').toString();
        if (cls.includes('menuAnchor')) return; // 锚点容器（如「标准模式」按钮包装），非弹层
        if (!(el.offsetWidth || el.offsetHeight)) return; // 不可见
        (el.innerText || '').split('\n').forEach(l => lines.push(l.trim()));
      });
      return [...new Set(lines)];
    });
  }

  /** 打开模型菜单，返回弹层内的模型名行（实测弹层文本：模型\ndeepseek-v4-pro） */
  async openModelMenu() {
    await this.modelButton().click();
    await this.page.waitForTimeout(1200);
    const lines = await this.visibleMenuLines();
    // 模型名行：纯 [\w.-] 计符且含数字（如 deepseek-v4-pro / glm-4.7）；
    // 排除表头「模型」等纯中文行。注意不能用 `-\d`（deepseek-v4 的横杠后是字母）
    return lines.filter(s => /^[\w][\w.-]*$/.test(s) && /\d/.test(s));
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
