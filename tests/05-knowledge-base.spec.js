// @ts-check
/**
 * 模块五：知识库命中
 *
 * DSH 客户端的知识库载体是工作区文件：通过「添加附件」上传文档后，
 * 对话提问只有命中文件内容才能答出。测试使用一次性随机标记验证命中，
 * 杜绝模型靠常识猜中。
 *
 * M5-01 上传知识文件到会话（附件可见）
 * M5-02 提问命中文件内容（回答包含机密标记）→ 真正的"知识库命中"
 */
const { test, expect } = require('../fixtures/app.fixtures');
const path = require('path');

const KB_FILE = path.join(__dirname, '..', 'fixtures', 'test-data', 'kb-sample.md');
const MARKER = process.env.KB_MARKER || 'ZKB-MARKER-7F3A9C';

/** 「待发送附件」区——断言附件是否真的登记，而不是页面上恰好出现了文件名 */
const ATTACH_RAIL = `[data-slot="conversation.input.attachments"] [role="group"][aria-label="待发送附件"]`;

test.describe.configure({ mode: 'serial' });

test.describe('M5 知识库命中', () => {

  test.beforeEach(async ({ pages }) => {
    await pages.sidebar.openApp();
    await pages.sidebar.newSession();
  });

  test('M5-01 上传知识文件 [双端]', async ({ page, pages, mode }) => {
    test.setTimeout(120000);
    test.skip(mode === 'electron', '桌面端附件选择走的是**非 Electron dialog 的原生链路**：实测（2026-10-16）① 桌面端无可用 input[type=file] 通路（setInputFiles 不触发 uploadFileBinary）；② 点「添加文件或调用指令 → 文件 file」也不会调用主进程 dialog.showOpenDialog(Sync) 桩。Playwright 只能 patch Electron 主进程模块，够不到该链路，故桌面端无法自动化；web 端覆盖正常');

    await pages.composer.attachFile(KB_FILE);

    // 断言附件**真正登记进「待发送附件」区**。
    // 注意：不能断言页面上出现文件名文本——实测桌面端未真正登记时，文件名也会出现在别处，
    // 那种写法是「假通过」（附件区其实是空的，Agent 也收不到）。
    await expect(page.locator(ATTACH_RAIL)).toBeVisible({ timeout: 30000 });
    expect(await pages.composer.attachmentCount(), '待发送附件区应有条目').toBeGreaterThan(0);
  });

  test('M5-02 提问命中知识文件内容 [双端]', async ({ page, pages, mode }) => {
    test.setTimeout(420000); // 上传索引 + 双轮 LLM，给足时间
    test.skip(mode === 'electron', '同 M5-01：桌面端附件链路无法被 Playwright 驱动（见 M5-01 的完整说明）');

    await pages.composer.attachFile(KB_FILE);
    await expect(page.locator(ATTACH_RAIL)).toBeVisible({ timeout: 30000 });
    expect(await pages.composer.attachmentCount(), '待发送附件区应有条目').toBeGreaterThan(0);

    // 提问只有命中文件才能答对的问题
    const baseline = await pages.transcript.replyCount();
    await pages.composer.send('我刚上传的文件里写着"机密代号"，请原样输出这个代号本身，不要任何其他内容。');

    // 回复应包含文件中的随机标记 → 知识库命中（轮询等待，思考/工具调用阶段文本会停顿）
    const reply = await pages.transcript.waitForReplyContaining(MARKER, { timeout: 360000, baselineCount: baseline });
    test.info().annotations.push({ type: 'note', description: `回复: ${reply.slice(0, 200)}` });
  });
});
