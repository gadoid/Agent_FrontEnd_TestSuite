// @ts-check
// 探测脚本5：回复消息 hover 操作条（赞/踩/复制/分享）+ 用量/用时 footer + 会话统计
const { chromium } = require('@playwright/test');

const APP_URL = process.env.DSH_URL || 'http://127.0.0.1:3080/';
const TOKEN = process.env.DSH_TOKEN || 'C79C_OJtFuNt2F7URLeM4OoWms1L3fyfFXgGsnaVtNs';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ locale: 'zh-CN', viewport: { width: 1440, height: 900 } });
  await page.goto(`${APP_URL}?token=${TOKEN}`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: '新建会话' }).last().waitFor({ timeout: 30000 });
  await page.waitForTimeout(1500);

  // 打开一个有已完成回复的会话
  await page.locator('[role="treeitem"]', { hasText: '自动化测试' }).first().click();
  await page.waitForTimeout(3000);

  // 1. 回复块 hover 前后的按钮变化
  const reply = page.locator('div[class*="hWmORq_root"]').last();
  const before = await page.evaluate(() =>
    Array.from(document.querySelectorAll('button')).map(b => (b.getAttribute('aria-label') || b.innerText || '').trim()).filter(Boolean)
  );
  await reply.hover();
  await page.waitForTimeout(1000);
  const after = await page.evaluate(() =>
    Array.from(document.querySelectorAll('button')).map(b => (b.getAttribute('aria-label') || b.innerText || '').trim()).filter(Boolean)
  );
  console.log('===== buttons appeared on hover =====');
  console.log(after.filter(x => !before.includes(x)).join('\n') || '(none)');

  // 2. 回复 footer 区域文本（用量/用时）
  const footer = await page.evaluate(() => {
    const roots = document.querySelectorAll('div[class*="hWmORq_root"]');
    const last = roots[roots.length - 1];
    return last ? last.innerText.slice(0, 300) : '(no reply root)';
  });
  console.log('\n===== reply root text (usage/duration) =====\n', footer.replace(/\n/g, ' | '));

  // 3. 会话底部统计条（轮/步/tok/缓存命中）
  const stats = await page.evaluate(() => {
    const hits = [];
    document.querySelectorAll('div,span').forEach(el => {
      if (el.children.length === 0) {
        const t = (el.innerText || '').trim();
        if (/轮|tok|缓存|用时|步/.test(t) && t.length < 100) hits.push(t);
      }
    });
    return [...new Set(hits)].slice(0, 15);
  });
  console.log('\n===== session stats texts =====\n', stats.join('\n'));

  await page.screenshot({ path: 'explore-actions.png' });
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
