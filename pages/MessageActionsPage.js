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

  /**
   * 揭示操作按钮。
   * 官方版回合操作按钮平时是隐藏的（布局中使用 data-actions-reveal），
   * **必须先 hover 该回合**才会渲染/显示——桌面端尤其明显，不 hover 时点击等于空点。
   */
  async reveal(tail = this.tail()) {
    await tail.scrollIntoViewIfNeeded().catch(() => {});
    await tail.hover().catch(() => {});
    await this.page.waitForTimeout(300);
    return this;
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

  /**
   * 点击复制并读取剪贴板内容。
   * web：走 navigator.clipboard（context 已授予 clipboard 权限）。
   * 桌面：Electron 窗口里 navigator.clipboard 往往读不到内容，回退到**主进程的 clipboard 模块**
   *      （Playwright 的 electronApp.evaluate 可拿到 Electron 内置模块）。
   */
  async copyReplyText(tail = this.tail()) {
    await this.reveal(tail);
    const btn = this.copyButton(tail);
    await btn.click({ timeout: 10000 }).catch(() => btn.click({ force: true, timeout: 5000 }));
    await this.page.waitForTimeout(800);
    const fromPage = await this.page.evaluate(() => navigator.clipboard.readText()).catch(() => '');
    if (fromPage && fromPage.trim()) return fromPage;
    if (this.electronApp) {
      const fromMain = await this.electronApp
        .evaluate(({ clipboard }) => clipboard.readText())
        .catch(() => '');
      if (fromMain && fromMain.trim()) return fromMain;
    }
    return fromPage || '';
  }

  /** turn-tail 按钮的两段点击链：普通点击 → dispatchEvent 直发。
   *  ⚠️ 不要插入 force 中间层：force 跳过可交互性检查后「成功」点在遮挡层上
   *  （_mask/hoverContent 实测），不抛错导致 dispatchEvent 兜底永远不会执行（全量轮实测）。 */
  async _clickTailButton(btn) {
    await btn.click({ timeout: 10000 }).catch(async () => btn.dispatchEvent('click'));
    return this;
  }

  /**
   * 点赞；返回是否观察到反馈。
   *
   * 官方版实测：点「好的回答」**直接弹出「提交反馈」表单**（body 出现
   * 「提交反馈 / 任务结果 / 指令理解与遵循 / 产品功能与交互 …」），
   * 不再是社区版那种「感谢你的反馈」轻提示。因此这里把「表单弹出」视为点赞反馈，
   * 同时保留对 toast 文案的兼容识别。
   */
  async like(tail = this.tail()) {
    await this.reveal(tail);
    await this._clickTailButton(this.likeButton(tail));
    const deadline = Date.now() + 12000;
    while (Date.now() < deadline) {
      const body = await this.page.evaluate(() => document.body.innerText).catch(() => '');
      if (/感谢|已记录|提交反馈/.test(body)) return true;
      await this.page.waitForTimeout(300);
    }
    return false;
  }

  /** 关闭弹出的反馈表单（点赞/点踩共用） */
  async closeFeedbackForm() {
    await this.page.keyboard.press('Escape').catch(() => {});
    await this.page.waitForTimeout(500);
  }

  /** 点踩，等待「提交反馈」表单弹出，返回 dialog locator（两段点击链，见 _clickTailButton） */
  async openDislikeForm(tail = this.tail()) {
    await this.reveal(tail);
    await this._clickTailButton(this.dislikeButton(tail));
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
