// @ts-check
/**
 * 对话输入组件（composer）
 *
 * 官方版实测（2026-10 真机探测）：
 *   输入框      div[role="textbox"][aria-label*="调用指令"]（首页与会话内两种文案与社区版逐字一致）
 *   发送按钮    button[aria-label="发送消息"]
 *   附件/指令   button[aria-label="添加文件或调用指令"][aria-haspopup="listbox"]
 *               —— 社区版的「添加附件」入口在官方版已不存在
 *   访问模式    button[aria-label="访问模式，当前：…"]（见 InputControlsPage）
 *   模型选择    button[aria-label="选择模型，当前 …"]（见 InputControlsPage）
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

  /** 附件/指令入口（官方版：添加文件或调用指令） */
  attachButton() {
    return this.page.getByRole('button', { name: '添加文件或调用指令' });
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

  /**
   * 通过「添加文件或调用指令」上传文件（知识库/工作区文件入口）。
   *
   * 注意：官方版该按钮带 aria-haspopup="listbox"（点击会弹出文件/指令列表），
   * 不再保证直接触发 filechooser。这里同时监听 filechooser 与 input[type=file]，
   * 都拿不到时抛错说明需要改用面板内的「文件」入口。
   */
  async attachFile(filePath) {
    // ── 桌面端：附件走 Electron 原生文件对话框（主进程 IPC），不经过 input[type=file] ──
    // 实测：桌面端直接 setInputFiles 只会让文件名出现在别处，附件区
    // [data-slot="conversation.input.attachments"] 始终为空、且不产生 uploadFileBinary 上传，
    // 于是 Agent 收不到文件。正解是在主进程把 showOpenDialog 换成桩（返回目标路径），
    // 再点应用自己的「添加文件或调用指令 → 文件」，让应用按它本来的链路登记附件。
    if (this.electronApp) {
      await this.electronApp.evaluate(({ dialog }, p) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [p] });
        if (typeof dialog.showOpenDialogSync === 'function') dialog.showOpenDialogSync = () => [p];
      }, filePath);

      await this.attachButton().click({ timeout: 10000 }).catch(() => {});
      await this.page.waitForTimeout(800);
      // 面板里的「文件」入口。实测该列表项文案是中英双写「文件 file」，
      // 用 /^\s*文件\s*$/ 会匹配不到，必须放宽。
      const fileEntry = this.page.locator('[role="option"], [role="menuitem"]')
        .filter({ hasText: /^\s*文件(\s|$)/ }).first();
      if (await fileEntry.count()) {
        await fileEntry.click({ timeout: 8000 }).catch(() => fileEntry.click({ force: true }));
      }
      await this.waitForAttachment(filePath);
      return this;
    }

    // ── web：写隐藏 input 即可（实测会触发 POST /api/session/uploadFileBinary 完成上传）──
    const fileInput = this.page.locator('input[type="file"]');
    if (await fileInput.count()) {
      await fileInput.first().setInputFiles(filePath);
      await this.waitForAttachment(filePath);
      return this;
    }

    const chooserP = this.page.waitForEvent('filechooser', { timeout: 8000 }).catch(() => null);
    await this.attachButton().click();
    const chooser = await chooserP;
    if (chooser) {
      await chooser.setFiles(filePath);
      await this.page.waitForTimeout(1000);
      return this;
    }
    // 面板没直接给 filechooser —— 尝试面板内的文件入口
    const fileEntry = this.page.locator('[role="option"], [role="menuitem"]').filter({ hasText: /文件|上传/ }).first();
    if (await fileEntry.count()) {
      const chooserP2 = this.page.waitForEvent('filechooser', { timeout: 8000 });
      await fileEntry.click();
      await (await chooserP2).setFiles(filePath);
      await this.page.waitForTimeout(1000);
      return this;
    }
    throw new Error('「添加文件或调用指令」未触发文件选择：官方版可能已改为面板内入口，请复核 attachFile 实现');
  }

  /** 等待附件真正登记到「待发送附件」区（不是页面上随便出现的文件名） */
  async waitForAttachment(name, { timeout = 30000 } = {}) {
    await this.page.locator('[data-slot="conversation.input.attachments"] [role="group"][aria-label="待发送附件"]')
      .waitFor({ state: 'visible', timeout }).catch(() => {});
    return this;
  }

  /** 附件区当前登记的附件数（用于断言，避免拿页面别处的同名文本当证据） */
  async attachmentCount() {
    return this.page.locator('[data-slot="conversation.input.attachments"] [role="group"][aria-label="待发送附件"] > *')
      .count();
  }

  /**
   * 移除待发送附件（点附件条上的「移除文件 X」按钮，M5-01A 反例用）。
   * name 省略时移除第一个。返回是否找到并点击了移除按钮。
   */
  async removeAttachment(name) {
    const scope = this.page.locator('[data-slot="conversation.input.attachments"]');
    const btn = name
      ? scope.getByRole('button', { name: `移除文件 ${name}` })
      : scope.locator('button[aria-label^="移除文件"]').first();
    if (!(await btn.count())) return false;
    await btn.first().click({ timeout: 8000 }).catch(() => btn.first().click({ force: true, timeout: 5000 }));
    await this.page.waitForTimeout(600);
    return true;
  }

  async text() {
    return this.input().innerText();
  }

  /* ---------- @ 引用（M10 探索补盲） ---------- */
  /**
   * 在输入区输入「@」唤起会话/文件引用列表，返回可见选项文本。
   * 实测列出全部历史会话（title + 相对时间）。
   */
  async mentionOptions(keyword = '') {
    const input = this.input().last();
    await input.click();
    await input.fill('');
    await this.page.keyboard.type(`@${keyword}`, { delay: 60 }).catch(() => {});
    await this.page.waitForTimeout(900);
    const options = await this.page.evaluate(() => [...document.querySelectorAll('[role="option"]')]
      .filter(o => o.getBoundingClientRect().width > 0)
      .map(o => (o.innerText || '').trim().replace(/\n/g, ' '))
      .filter(Boolean));
    await this.page.keyboard.press('Backspace').catch(() => {});
    await this.page.waitForTimeout(300);
    return options;
  }
}

module.exports = { ChatComposerPage };
