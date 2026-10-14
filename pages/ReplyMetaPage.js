// @ts-check
/**
 * 回合元信息组件：用量 / 用时（位于 turn-tail 内）
 *
 * 实测：两个按钮无 aria-label，按文本前缀定位（"用量 9.8K tok" / "用时 3秒"）；
 * 点击分别弹出明细（用量弹层含千分位精确 token 数，如 "9,792 tok"）。
 */
const { BasePage } = require('./BasePage');

class ReplyMetaPage extends BasePage {
  usageButton(tail) {
    return (tail || this.page.locator('[data-chat-flow-kind="turn-tail"]').last())
      .locator('button')
      .filter({ hasText: /^用量\s/ });
  }

  durationButton(tail) {
    return (tail || this.page.locator('[data-chat-flow-kind="turn-tail"]').last())
      .locator('button')
      .filter({ hasText: /^用时\s/ });
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
    await this.durationButton(tail).click();
    await this.page.waitForTimeout(1200);
    return this.page.evaluate(() => document.body.innerText);
  }

  closeBreakdown() {
    return this.page.keyboard.press('Escape');
  }

  /** 会话底部统计条文本（"X 轮 Y 步 · N tok/s / 总 tok·缓存命中 %"），无则返回空串 */
  async sessionStatsText() {
    const body = await this.page.evaluate(() => document.body.innerText);
    const m = body.match(/[^\n]*\d+\s*轮[^\n]*/);
    return m ? m[0].trim() : '';
  }
}

module.exports = { ReplyMetaPage };
