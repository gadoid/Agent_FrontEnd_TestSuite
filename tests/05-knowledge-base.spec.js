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

test.describe.configure({ mode: 'serial' });

test.describe('M5 知识库命中', () => {

  test.beforeEach(async ({ pages }) => {
    await pages.sidebar.openApp();
    await pages.sidebar.newSession();
  });

  test('M5-01 上传知识文件 [双端]', async ({ page, pages }) => {
    test.setTimeout(120000);

    await pages.composer.attachFile(KB_FILE);

    // 附件 chip 应出现在输入区附近（文件名可见）
    await expect(page.locator('text=kb-sample.md').first()).toBeVisible({ timeout: 20000 });
  });

  test('M5-02 提问命中知识文件内容 [双端]', async ({ page, pages }) => {
    test.setTimeout(420000); // 上传索引 + 双轮 LLM，给足时间

    await pages.composer.attachFile(KB_FILE);
    await expect(page.locator('text=kb-sample.md').first()).toBeVisible({ timeout: 20000 });

    // 提问只有命中文件才能答对的问题
    const baseline = await pages.transcript.replyCount();
    await pages.composer.send('我刚上传的文件里写着"机密代号"，请原样输出这个代号本身，不要任何其他内容。');

    // 回复应包含文件中的随机标记 → 知识库命中（轮询等待，思考/工具调用阶段文本会停顿）
    const reply = await pages.transcript.waitForReplyContaining(MARKER, { timeout: 360000, baselineCount: baseline });
    test.info().annotations.push({ type: 'note', description: `回复: ${reply.slice(0, 200)}` });
  });
});
