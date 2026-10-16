// @ts-check
/**
 * 回合元信息组件：用量 / 用时（位于 turn-tail 内）
 *
 * 官方版实测（2026-10 真机探测）：
 *   用量按钮  turn-tail 内文本形如「用量 9.8K tok」，无 aria-label
 *   用时元素  同一回合内的过程节点文本形如 **「已完成，用时 2秒」**
 *             —— 注意不是旧版的「用时 3秒」起头，前缀匹配必须放宽
 *   统计条    composer 区三个按钮，带 aria-label：
 *             「1 轮 1 步 · 34 tok/s」「9.8K tok · 缓存命中 94%」「上下文已用 4%」
 */
const { BasePage } = require('./BasePage');

class ReplyMetaPage extends BasePage {
  /** 最后一个回合尾部容器 */
  lastTail() {
    return this.page.locator('[data-chat-flow-kind="turn-tail"]').last();
  }

  usageButton(tail) {
    return (tail || this.lastTail())
      .locator('button')
      .filter({ hasText: /^用量\s/ });
  }

  /**
   * 用时元素。实测它渲染在**同一回合的 turn-process 节点**里（文本「已完成，用时 N秒」），
   * 而不是 turn-tail —— 旧版把两者都放在 turn-tail，迁移时按新结构改到 turn-process。
   */
  durationButton(tail) {
    const scope = tail
      ? tail.locator('xpath=preceding-sibling::*[@data-chat-flow-kind="turn-process"][1]')
      : this.page.locator('[data-chat-flow-kind="turn-process"]').last();
    return scope.locator('button').filter({ hasText: /用时\s*\d+\s*秒/ }).last();
  }

  /** 该回合是否已出现用时信息 */
  async hasDuration(tail) {
    return (await this.durationButton(tail).count()) > 0;
  }

  /** 解析用量文本为 tok 数（"9.8K"→9800，"1.2M"→1200000，"512"→512） */
  static parseTok(text) {
    const m = (text || '').match(/([\d.]+)\s*([KM]?)\s*tok/i);
    if (!m) return 0;
    const n = parseFloat(m[1]);
    return Math.round(n * (m[2].toUpperCase() === 'K' ? 1000 : m[2].toUpperCase() === 'M' ? 1e6 : 1));
  }

  static parseSeconds(text) {
    const m = (text || '').match(/用时\s*(\d+)\s*秒/);
    return m ? parseInt(m[1], 10) : -1;
  }

  async usageTok(tail) {
    return ReplyMetaPage.parseTok(await this.usageButton(tail).innerText());
  }

  async usageText(tail) {
    return (await this.usageButton(tail).innerText()).trim();
  }

  async durationSeconds(tail) {
    return ReplyMetaPage.parseSeconds(await this.durationButton(tail).innerText());
  }

  /** 打开用量明细弹层，返回弹层内文本 */
  async openUsageBreakdown(tail) {
    await this.usageButton(tail).click();
    await this.page.waitForTimeout(1200);
    return this.page.evaluate(() => document.body.innerText);
  }

  /** 打开用时明细弹层，返回弹层内文本 */
  async openDurationBreakdown(tail) {
    const btn = this.durationButton(tail);
    await btn.scrollIntoViewIfNeeded().catch(() => {});
    await this.page.waitForTimeout(300);
    // 该按钮实测偶发处于不可见/不稳定态（折叠的过程节点内），故带 force 兜底
    await btn.click({ timeout: 10000 }).catch(() => btn.click({ force: true, timeout: 5000 }));
    await this.page.waitForTimeout(1200);
    return this.page.evaluate(() => document.body.innerText);
  }

  closeBreakdown() {
    return this.page.keyboard.press('Escape');
  }

  /**
   * 会话底部统计条文本。
   * 官方版把它拆成 composer 区的三个带 aria-label 的按钮，按 aria-label 拼回原来的形态，
   * 便于既有断言（如 /X 轮 Y 步/、/缓存命中/）继续成立。
   */
  async sessionStatsText() {
    const parts = await this.page.evaluate(() => {
      const out = [];
      document.querySelectorAll('[data-slot="conversation.composer"] button[aria-label]').forEach(b => {
        const t = b.getAttribute('aria-label') || '';
        if (/\d+\s*轮|\btok\b|缓存命中|上下文已用/.test(t)) out.push(t.trim());
      });
      return out;
    });
    if (parts.length) return parts.join(' | ');
    // 兜底：整页文本里找「N 轮 M 步」
    const body = await this.page.evaluate(() => document.body.innerText);
    const m = body.match(/[^\n]*\d+\s*轮[^\n]*/);
    return m ? m[0].trim() : '';
  }
}

module.exports = { ReplyMetaPage };
