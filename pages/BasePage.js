// @ts-check
/**
 * BasePage —— 所有页面组件的基类
 *
 * 沉淀官方版 DeepSeek Harness（v0.2.0-rc.2 前端）确认稳定的选择器。
 * 约定：
 *   1. 优先官方版自带的 `data-slot` 语义钩子（如 [data-slot="conversation.composer"]）
 *   2. 其次 aria-label / role（可访问名）
 *   3. 绝不用构建产物 hash 类名（_2H3hWW_root / hIlkoa_projectRow 之类，重建即失效）
 */
class BasePage {
  /**
   * @param {import('@playwright/test').Page} page
   * @param {object} [opts]
   * @param {'web'|'electron'} [opts.mode]  运行模式：web 需要显式导航；electron 由 fixture 提供已加载的窗口
   */
  constructor(page, opts = {}) {
    this.page = page;
    this.mode = opts.mode || 'web';
    /** electron 模式下的 ElectronApplication（web 模式为 undefined） */
    this.electronApp = opts.electronApp;
  }

  /** 应用根地址（web 模式使用 baseURL；electron 模式返回窗口当前地址） */
  appUrl(path = '/') {
    return path;
  }

  /** 打开应用（electron 下为 no-op，窗口已由 fixture 启动） */
  async openApp() {
    if (this.mode === 'web') {
      await this.page.goto('/', { waitUntil: 'domcontentloaded' });
    }
    await this.waitForReady();
    await this.dismissOnboarding();
    return this;
  }

  /**
   * 消解首载的「预览版说明」模态。
   *
   * 官方版首次载入（尤其新 profile / 新 DSH_HOME）会弹一个预览版说明对话框，
   * 带 `aria-hidden` 遮罩拦截所有点击——不关掉的话后续任何 click 都会超时。
   * 已消解过或本就不弹时静默跳过。
   */
  async dismissOnboarding() {
    const cont = this.page.getByRole('button', { name: '继续', exact: true });
    if (await cont.count().catch(() => 0)) {
      await cont.first().click({ timeout: 5000 }).catch(() => {});
      await this.page.waitForTimeout(500);
    }
    // 兜底：遮罩还在就按 Esc
    if (await this.page.locator('[aria-hidden="true"][class*="mask"]').count().catch(() => 0)) {
      await this.page.keyboard.press('Escape').catch(() => {});
      await this.page.waitForTimeout(300);
    }
    return this;
  }

  /** 等待应用关键 UI 就绪。
   *  第一层：侧边栏「新建会话」按钮出现（官方版保留「品牌位 + 真按钮」两个同名按钮，取 last()）。
   *  第二层：工作区树或 composer 渲染出来——实测「新建会话」按钮出现后应用状态流仍可能未到位，
   *  此时点击设置/侧栏控件会静默失效（面板开了随即被关），后续断言连锁失败。 */
  async waitForReady(timeout = 30000) {
    await this.page.getByRole('button', { name: '新建会话' }).last().waitFor({ timeout });
    await this.page
      .locator('[role="treeitem"], [data-slot="conversation.composer"]')
      .first()
      .waitFor({ timeout: 15000 })
      .catch(() => {});
    await this.page.waitForTimeout(500);
    return this;
  }

  /** 按 data-slot 定位（官方版自带的语义钩子，最稳定的一类选择器） */
  slot(name) {
    return this.page.locator(`[data-slot="${name}"]`);
  }

  /** 整页可见文本（断言回复/知识库命中时用） */
  async bodyText() {
    return this.page.evaluate(() => document.body.innerText);
  }

  /** 轮询等待整页文本包含指定内容（流式回复场景） */
  async waitBodyContains(text, { timeout = 120000, interval = 3000 } = {}) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const body = await this.bodyText();
      if (body.includes(text)) return true;
      await this.page.waitForTimeout(interval);
    }
    throw new Error(`等待正文包含 "${text}" 超时（${timeout}ms）`);
  }
}

module.exports = { BasePage };
