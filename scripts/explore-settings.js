// @ts-check
// 探测脚本2：设置页 / 易链市场（插件）/ 知识库相关 UI
const { chromium } = require('@playwright/test');

const APP_URL = process.env.DSH_URL || 'http://127.0.0.1:3080/';
const TOKEN = process.env.DSH_TOKEN || 'C79C_OJtFuNt2F7URLeM4OoWms1L3fyfFXgGsnaVtNs';

async function dump(page, label, limit = 60) {
  const elements = await page.evaluate((lim) => {
    const out = [];
    const sel = 'button, a, input, textarea, [role="button"], [role="textbox"], [role="tab"], [role="menuitem"], [role="combobox"], [role="switch"], [role="option"], h1, h2, h3';
    document.querySelectorAll(sel).forEach(el => {
      const text = (el.innerText || el.getAttribute('aria-label') || el.getAttribute('placeholder') || '').trim().slice(0, 50);
      if (!text) return;
      out.push(`<${el.tagName.toLowerCase()}${el.getAttribute('role') ? ' role=' + el.getAttribute('role') : ''}> ${text.replace(/\n/g, ' | ')}`);
    });
    return out.slice(0, lim);
  }, limit);
  console.log(`\n===== ${label} =====`);
  console.log(elements.join('\n'));
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${APP_URL}?token=${TOKEN}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);

  // 1. 设置页
  await page.getByRole('button', { name: '设置' }).click();
  await page.waitForTimeout(1500);
  await dump(page, 'SETTINGS');
  await page.screenshot({ path: 'explore-settings.png' });

  // 设置里的 tab 逐个看
  const tabs = await page.$$('[role="tab"]');
  for (const t of tabs.slice(0, 8)) {
    const name = (await t.innerText()).trim();
    if (!name) continue;
    await t.click();
    await page.waitForTimeout(800);
    await dump(page, `SETTINGS TAB: ${name}`, 40);
  }

  // 2. 易链市场
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  const market = page.getByRole('button', { name: '易链市场' });
  if (await market.count()) {
    await market.click();
    await page.waitForTimeout(2500);
    await dump(page, 'YILIAN MARKET (plugins)', 70);
    await page.screenshot({ path: 'explore-market.png' });
  }

  // 3. 找知识库相关元素（全局搜索 DOM 文本）
  const kb = await page.evaluate(() => {
    const hits = [];
    document.querySelectorAll('button, [role="tab"], [role="menuitem"], a, h1, h2, h3').forEach(el => {
      const t = (el.innerText || el.getAttribute('aria-label') || '').trim();
      if (/知识|knowledge|文档|rag|文件/i.test(t) && t.length < 50) hits.push(t.replace(/\n/g, ' | '));
    });
    return [...new Set(hits)].slice(0, 30);
  });
  console.log('\n===== KNOWLEDGE-BASE-related texts =====');
  console.log(kb.join('\n'));

  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
