// @ts-check
/**
 * 输入区周边控件：指令/文件入口 / 模型选择器 / 模型思考程度（推理等级）/ 访问模式
 *
 * eline 实测（2026-10，eline.exe v0.2.0-rc.2 定制构建）：
 *   文件/指令入口  button[aria-label="添加文件或调用指令"]
 *                  面板选项（role=option）：文件(file) / 目标(goal) / 计划(plan) /
 *                  反馈(feedback) / 压缩(compact) / 权限(permission) / 模型(model) / 下载日志(export)
 *   模型选择器     button[aria-label^="选择模型"]（显示 "deepseek-account/deepseek-v4-flash" 等）
 *                  菜单容器 aria-label = 「模型与推理等级」，「模型」行是子菜单（模型列表）
 *   推理等级       会话态 trigger aria = 「…，推理等级 {effort}」；本部署模型目录未提供
 *                  切换行（菜单里无「推理等级」），展示断言为主
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
   * 打开模型菜单，返回弹层内的模型名行（一级菜单直接显示当前模型全名）。
   * 过滤条件：像模型标识（含 - 或 / 且含数字），排除纯中文与推理等级词。
   * 桌面端首开可能较慢，做「等菜单出现 → 读列表 → 空则重试一次」的加固。
   */
  async openModelMenu() {
    const menu = this.page.locator('[role="menu"][aria-label*="模型"]');
    const NOISE = /^(High|Medium|Low|Auto|自动|高|中|低|搜索模型|模型与推理等级|DeepSeek 账号|中转站)$/i;
    const read = async () => (await this.visibleMenuLines())
      .filter(s => /^[\w][\w./-]*$/.test(s) && /\d/.test(s) && !NOISE.test(s));

    let models = [];
    for (let attempt = 0; attempt < 2; attempt++) {
      if (!(await menu.first().isVisible().catch(() => false))) {
        await this.modelButton().click({ timeout: 5000 }).catch(() => {});
      }
      await menu.first().waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
      await this.page.waitForTimeout(700);
      models = await read();
      if (models.length) return models;
    }
    return models;
  }

  /**
   * 下钻「模型」子菜单，返回模型目录的全部可选模型（menuitemradio 行）。
   * eline 实测（2026-10）：目录显示名与 trigger 名无干净映射
   * （如 "DeepSeek-V41-Flash" ↔ "deepseek-account/deepseek-v4-flash"），仅作清单展示。
   */
  async openModelCatalog() {
    await this.modelButton().click();
    await this.page.waitForTimeout(1000);
    const sub = this.page.locator('[role="menuitem"]').filter({ hasText: /模型/ }).first();
    if (await sub.isVisible().catch(() => false)) {
      await sub.click({ timeout: 5000 }).catch(() => {});
      await this.page.waitForTimeout(1000);
    }
    const rows = await this.page.locator('[role="menuitemradio"]').allInnerTexts();
    await this.page.keyboard.press('Escape').catch(() => {});
    await this.page.waitForTimeout(300);
    return rows.map(t => t.trim()).filter(Boolean);
  }

  closeModelMenu() {
    return this.page.keyboard.press('Escape');
  }

  /** 模型名匹配：trigger 显示 "provider/model"，菜单行显示显示名（大小写/分隔符不同）。
   *  归一化后做双向 endsWith（如 deepseek-account/deepseek-v4-flash ↔ DeepSeek-V4-Flash）。 */
  static modelMatches(current, row) {
    const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const a = norm(current);
    const b = norm(row);
    return a.endsWith(b) || b.endsWith(a);
  }

  /* ---------- 模型思考程度（推理等级） ----------
   * 会话态模型按钮的 aria 为「选择模型，当前 {model}，推理等级 {effort}」，
   * 按钮文本第二行也是等级名（如 "high"）。首页 hero 态通常无等级行。
   * 模型菜单（aria-label="模型与推理等级"）在模型目录提供 efforts 时才有推理等级行；
   * 本部署（易链中转）实测目录未提供，菜单里只有「模型」行 —— 切换入口缺失属部署差异，
   * 用 currentEffort() 断言展示、openModelMenu 探测切换入口。 */

  /** 当前推理等级（读不到时返回空串） */
  async currentEffort() {
    const btn = this.modelButton();
    if (!(await btn.count())) return '';
    const aria = (await btn.first().getAttribute('aria-label')) || '';
    const m = aria.match(/推理等级\s*([^\s，,]+)$/);
    if (m) return m[1];
    const lines = (await btn.first().innerText()).trim().split(/\r?\n/);
    return lines.length > 1 ? lines[1].trim() : '';
  }

  /** 模型菜单里是否存在「推理等级」切换行 */
  async hasEffortMenuRow() {
    const row = this.page.locator('[role="menuitem"], [role="menuitemradio"], [role="option"]')
      .filter({ hasText: /推理等级/ }).first();
    return row.isVisible().catch(() => false);
  }

  /* ---------- 访问模式 ---------- */
  accessModeButton() {
    return this.page.getByRole('button', { name: /^访问模式/ });
  }

  /** 当前访问模式。
   *  优先从可见按钮的 aria-label 解析（「访问模式，当前：工作区内修改」）——
   *  DOM 里 hero/会话两个 composer 变体并存，.first() 可能命中隐藏变体，
   *  隐藏元素 innerText 恒为空（全量轮实测），aria 解析不受此影响。 */
  async currentAccessMode() {
    const visible = this.accessModeButton().locator('visible=true');
    const btn = (await visible.count()) ? visible.first() : this.accessModeButton().first();
    await btn.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
    const aria = (await btn.getAttribute('aria-label').catch(() => '')) || '';
    const m = aria.match(/当前[：:]\s*(.+)$/);
    if (m) return m[1].trim();
    return (await btn.innerText().catch(() => '')).trim();
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
