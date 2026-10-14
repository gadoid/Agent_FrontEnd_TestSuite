// @ts-check
/**
 * BasePage —— 所有页面组件的基类
 *
 * 沉淀了探测阶段确认的 DSH 客户端（DeepSeek Harness / 外贸赋能中心）稳定选择器。
 * 约定：优先 aria-label / role（可访问名），其次 placeholder / 文本，最后才用 class。
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
    return this.waitForReady();
  }

  /** 等待应用关键 UI 就绪：侧边栏「新建会话」按钮出现 */
  async waitForReady(timeout = 30000) {
    // 注意：有两个 aria-label="新建会话" 的按钮（品牌位 + 真按钮），取 last()
    await this.page.getByRole('button', { name: '新建会话' }).last().waitFor({ timeout });
    return this;
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
