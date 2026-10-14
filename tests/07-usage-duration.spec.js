// @ts-check
/**
 * 模块七：用量统计 / 用时检查
 *
 * M7-01 回合尾部展示用量（tok > 0，K/M 单位换算）
 * M7-02 回合尾部展示用时（N秒，>=0）
 * M7-03 用量明细弹层（千分位精确 token 数）
 * M7-04 用时明细弹层
 * M7-05 会话统计条（X 轮 Y 步 / 缓存命中率）
 */
const { test, expect } = require('../fixtures/app.fixtures');

test.describe.configure({ mode: 'serial' });

test.describe('M7 用量统计/用时检查', () => {
  const STAMP = Date.now().toString(36);

  test.beforeEach(async ({ pages }) => {
    await pages.sidebar.openApp();
    await pages.sidebar.newSession();
  });

  async function ensureReply(pages) {
    await pages.composer.send(`自动化测试(${STAMP})，请只回复两个字：收到`);
    await pages.transcript.waitForReply(180000);
    // 等用量/用时出现（turn-tail 渲染完成）
    await pages.replyMeta.usageButton().waitFor({ timeout: 30000 });
  }

  test('M7-01 回合展示用量，tok 数可解析且 > 0 [双端]', async ({ pages }) => {
    test.setTimeout(240000);
    await ensureReply(pages);

    const text = await pages.replyMeta.usageText();
    expect(text).toMatch(/^用量\s*[\d.]+[KM]?\s*tok/);
    const tok = await pages.replyMeta.usageTok();
    expect(tok, `用量应大于 0，实际文本 "${text}"`).toBeGreaterThan(0);
    test.info().annotations.push({ type: 'note', description: `用量: ${text} → ${tok} tok` });
  });

  test('M7-02 回合展示用时，秒数 >= 0 [双端]', async ({ pages }) => {
    test.setTimeout(240000);
    await ensureReply(pages);

    const secs = await pages.replyMeta.durationSeconds();
    const text = await pages.replyMeta.durationButton().innerText();
    expect(text.trim()).toMatch(/^用时\s*\d+\s*秒/);
    expect(secs).toBeGreaterThanOrEqual(0);
    test.info().annotations.push({ type: 'note', description: `用时: ${text.trim()} → ${secs}s` });
  });

  test('M7-03 用量明细弹层展示精确 token 数 [双端]', async ({ pages }) => {
    test.setTimeout(240000);
    await ensureReply(pages);

    const body = await pages.replyMeta.openUsageBreakdown();
    // 千分位精确值，如 "9,792 tok"
    expect(body).toMatch(/\d{1,3}(,\d{3})+\s*tok|\d{3,}\s*tok/);
    await pages.replyMeta.closeBreakdown();
  });

  test('M7-04 用时明细弹层可打开 [双端]', async ({ pages }) => {
    test.setTimeout(240000);
    await ensureReply(pages);

    const before = await pages.replyMeta.durationButton().innerText();
    const body = await pages.replyMeta.openDurationBreakdown();
    expect(body).toContain(before.trim());
    await pages.replyMeta.closeBreakdown();
  });

  test('M7-05 会话统计条展示轮次与缓存命中 [双端]', async ({ pages }) => {
    test.setTimeout(240000);
    await ensureReply(pages);

    const stats = await pages.replyMeta.sessionStatsText();
    test.info().annotations.push({ type: 'note', description: `统计条: ${stats || '(未找到)'}` });
    expect(stats, '应展示 "X 轮 Y 步" 统计').toMatch(/轮.*步/);
  });
});
