// @ts-check
/**
 * 消息操作条组件（turn-tail）
 *
 * 实测 DOM：每个助手回合尾部有一个 [data-chat-flow-kind="turn-tail"] 容器，
 * 内含操作按钮（aria-label 唯一标识）：
 *   复制 / 好的回答(点赞) / 有问题的回答(点踩) / 在新对话中分支
 * 点踩会弹出「提交反馈」表单（role=dialog，分类选项 + 提交按钮）。
 */
const { BasePage } = require('./BasePage');

class MessageActionsPage extends BasePage {
  /** 第 nth 个回合尾部容器（默认最后一个）；nth=-1 为最后 */
  tail(nth = -1) {
    const loc = this.page.locator('[data-chat-flow-kind="turn-tail"]');
    return nth === -1 ? loc.last() : loc.nth(nth);
  }

  copyButton(tail = this.tail()) {
    return tail.getByRole('button', { name: '复制' });
  }

  likeButton(tail = this.tail()) {
    return tail.getByRole('button', { name: '好的回答' });
  }

  dislikeButton(tail = this.tail()) {
    return tail.getByRole('button', { name: '有问题的回答' });
  }

  branchButton(tail = this.tail()) {
    return tail.getByRole('button', { name: '在新对话中分支' });
  }

  /** 点击复制并读取剪贴板内容（context 需授予 clipboard 权限，config 已配） */
  async copyReplyText(tail = this.tail()) {
    await this.copyButton(tail).click();
    await this.page.waitForTimeout(600);
    return this.page.evaluate(() => navigator.clipboard.readText());
  }

  /** 点赞；返回是否出现「感谢反馈」toast */
  async like(tail = this.tail()) {
    await this.likeButton(tail).click();
    try {
      await this.waitBodyContains('感谢', { timeout: 10000, interval: 1000 });
      return true;
    } catch {
      return false;
    }
  }

  /** 点踩，等待「提交反馈」表单弹出，返回 dialog locator */
  async openDislikeForm(tail = this.tail()) {
    await this.dislikeButton(tail).click();
    const dlg = this.page.locator('[role="dialog"]').last();
    await dlg.waitFor({ timeout: 10000 });
    return dlg;
  }

  /** 在反馈表单中选择分类并提交 */
  async submitDislikeForm(dlg, category = '其他') {
    await dlg.getByText(category, { exact: true }).first().click();
    await dlg.getByRole('button', { name: '提交' }).click();
    await dlg.waitFor({ state: 'hidden', timeout: 15000 });
  }
}

module.exports = { MessageActionsPage };
