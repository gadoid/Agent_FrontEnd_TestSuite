// @ts-check
/**
 * 对话消息区组件（transcript）
 *
 * 实测 DOM（v0.1.5-rc.1）：
 *   用户消息：  div[class*="userRow"] > div[class*="userStack"] > div[class*="bubble"]
 *   助手回复：  div[class*="hWmORq_root"] > div[class*="hWmORq_body"] > markdown
 *   滚动容器：  div[class*="EvIC1a_scroll"]
 *
 * 注意：不要用 .lcKema_summaryText —— 那是会话列表的摘要，会话重载后为空。
 */
const { BasePage } = require('./BasePage');

class ChatTranscriptPage extends BasePage {
  /** 所有助手回复正文块（限定主消息滚动容器内——右侧栏「轨迹」面板会复用同类名） */
  replyBodies() {
    const scoped = this.page.locator('div[class*="EvIC1a_scroll"] div[class*="hWmORq_body"]');
    return scoped;
  }

  /** 最后一条助手回复 */
  lastReply() {
    return this.replyBodies().last();
  }

  /** 用户消息气泡 */
  userBubble(text) {
    return this.page.locator('div[class*="userRow"]').filter({ hasText: text });
  }

  /** 等待出现至少一条非空回复 */
  async waitForReply(timeout = 180000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const count = await this.replyBodies().count();
      if (count > 0) {
        const text = await this.lastReply().innerText().catch(() => '');
        if (text.trim()) return this.lastReply();
      }
      await this.page.waitForTimeout(2000);
    }
    throw new Error(`等待助手回复超时（${timeout}ms）`);
  }

  /** 最后一条回复文本 */
  async lastReplyText() {
    return (await this.waitForReply()).innerText();
  }

  /** 用户消息是否上屏（按文本） */
  async hasUserMessage(text) {
    return (await this.userBubble(text).count()) > 0;
  }

  /**
   * 轮询等待最后一条回复包含指定文本（流式 + 思考阶段都会经过，直到超时才失败）。
   * 注意：不能只看"稳定 5s"——思考/工具调用阶段文本也会停顿较久。
   */
  async waitForReplyContaining(text, { timeout = 360000, baselineCount = 0 } = {}) {
    const deadline = Date.now() + timeout;
    let lastText = '';
    while (Date.now() < deadline) {
      const count = await this.replyBodies().count();
      if (count > baselineCount) {
        lastText = await this.replyBodies().nth(count - 1).innerText().catch(() => '');
        if (lastText.includes(text)) return lastText;
      }
      await this.page.waitForTimeout(3000);
    }
    throw new Error(`等待回复包含 "${text}" 超时（${timeout}ms）。最后回复: ${lastText.slice(0, 300)}`);
  }

  /** 等待流式输出结束：第 baselineCount+1 条及之后的非空回复文本在 stableWindow 内不再增长 */
  async waitForStreamSettled(baselineCount = 0, timeout = 240000, stableWindow = 5000) {
    const deadline = Date.now() + timeout;
    let prev = '';
    let prevAt = 0;
    while (Date.now() < deadline) {
      const count = await this.replyBodies().count();
      const cur = count > baselineCount
        ? await this.replyBodies().nth(count - 1).innerText().catch(() => '')
        : '';
      if (cur.trim() && cur === prev) {
        if (Date.now() - prevAt >= stableWindow) return cur;
      } else {
        prev = cur;
        prevAt = Date.now();
      }
      await this.page.waitForTimeout(1000);
    }
    return prev;
  }

  /** 当前回复条数（发送前取基线用） */
  async replyCount() {
    return this.replyBodies().count();
  }
}

module.exports = { ChatTranscriptPage };
