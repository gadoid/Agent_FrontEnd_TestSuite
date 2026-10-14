// @ts-check
/**
 * 对话输入组件（composer）
 *
 * 重要发现：发送前后输入框的 aria-label 不同 ——
 *   首页 hero:  "描述你想要构建的内容, / 调用指令, @ 文件或对话"
 *   会话内:     "发消息或创建任务, / 调用指令, @ 文件或对话"
 * 因此统一用共同子串 "调用指令" 定位。
 */
const { BasePage } = require('./BasePage');

class ChatComposerPage extends BasePage {
  /** 输入框（发送前后两种 aria-label 通吃） */
  input() {
    return this.page.locator('div[role="textbox"][aria-label*="调用指令"]');
  }

  sendButton() {
    return this.page.getByRole('button', { name: '发送消息' });
  }

  attachButton() {
    return this.page.getByRole('button', { name: '添加附件' });
  }

  async fill(text) {
    const input = this.input();
    await input.click();
    await input.fill(text);
    return this;
  }

  /** 填写并发送 */
  async send(text) {
    await this.fill(text);
    await this.sendButton().click();
    return this;
  }

  /** 通过「添加附件」上传文件（知识库/工作区文件入口），返回是否触发了文件选择 */
  async attachFile(filePath) {
    const chooserP = this.page.waitForEvent('filechooser', { timeout: 10000 });
    await this.attachButton().click();
    const chooser = await chooserP;
    await chooser.setFiles(filePath);
    await this.page.waitForTimeout(1000);
    return this;
  }

  async text() {
    return this.input().innerText();
  }
}

module.exports = { ChatComposerPage };
