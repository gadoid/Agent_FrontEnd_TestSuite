// @ts-check
/**
 * 模块三：对话
 * M3-01 发送消息并收到回复   M3-02 会话内追问，上下文保持   M3-03 会话留存侧边栏
 */
const { test, expect } = require('../fixtures/app.fixtures');

test.describe.configure({ mode: 'serial' }); // 共享真实会话，串行执行

test.describe('M3 对话', () => {
  const STAMP = Date.now().toString(36);
  const MSG1 = `你好，这是一条自动化测试消息(${STAMP})，请只回复两个字：收到`;
  // 明确指向「本会话第一条用户消息」，避免模型误解为助手上一次回复
  const MSG2 = `请查看本会话中第一条用户消息（不是你自己的回复），把那条消息末尾圆括号里的字符串原样告诉我，只回答该字符串`;

  test.beforeEach(async ({ pages }) => {
    await pages.sidebar.openApp();
    await pages.sidebar.newSession();
  });

  test('M3-01 发送消息并收到回复 [双端]', async ({ pages }) => {
    test.setTimeout(240000);

    await pages.composer.send(MSG1);

    // 用户消息上屏（轮询断言，避免渲染竞态）
    await expect(pages.transcript.userBubble(MSG1)).toBeVisible({ timeout: 15000 });

    // 助手回复非空
    const reply = await pages.transcript.waitForReply(180000);
    await expect(reply).not.toBeEmpty();
    const text = await pages.transcript.lastReplyText();
    test.info().annotations.push({ type: 'note', description: `回复: ${text.slice(0, 120)}` });
  });

  test('M3-02 会话内追问，上下文保持 [双端]', async ({ pages }) => {
    test.setTimeout(300000);

    await pages.composer.send(MSG1);
    await pages.transcript.waitForReply(180000);
    const baseline = await pages.transcript.replyCount();

    await pages.composer.send(MSG2);
    const reply = await pages.transcript.waitForReplyContaining(STAMP, { timeout: 240000, baselineCount: baseline });
    test.info().annotations.push({ type: 'note', description: `第二轮回复: ${reply.slice(0, 80)}` });
  });

  test('M3-03 会话留存于侧边栏 [双端]', async ({ page, pages }) => {
    test.setTimeout(120000);

    await pages.composer.send(MSG1);
    await pages.transcript.waitForReply(180000);

    const count = await page.locator('[role="treeitem"]').count();
    expect(count).toBeGreaterThan(0);
  });
});
