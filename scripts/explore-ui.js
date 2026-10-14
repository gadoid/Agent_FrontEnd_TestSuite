// @ts-check
// 探测脚本：打开 DSH 客户端，截图并输出可交互元素结构，用于设计测试选择器
const { chromium } = require('@playwright/test');

const APP_URL = process.env.DSH_URL || 'http://127.0.0.1:3080/';
const TOKEN = process.env.DSH_TOKEN || 'C79C_OJtFuNt2F7URLeM4OoWms1L3fyfFXgGsnaVtNs';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  // 登录：带 token 访问 → 303 → 种下 auth cookie
  await page.goto(`${APP_URL}?token=${TOKEN}`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(3000);

  console.log('=== URL after login:', page.url());
  console.log('=== Cookies:', (await page.context().cookies()).map(c => c.name).join(', '));
  console.log('=== Title:', await page.title());

  await page.screenshot({ path: 'explore-home.png', fullPage: false });

  // 输出主要可交互元素
  const elements = await page.evaluate(() => {
    const out = [];
    const sel = 'button, a, input, textarea, [role="button"], [role="textbox"], [contenteditable="true"], [role="tab"], [role="menuitem"], [role="combobox"]';
    document.querySelectorAll(sel).forEach(el => {
      const text = (el.innerText || el.getAttribute('aria-label') || el.getAttribute('placeholder') || '').trim().slice(0, 60);
      if (!text) return;
      out.push({
        tag: el.tagName.toLowerCase(),
        role: el.getAttribute('role') || '',
        testid: el.getAttribute('data-testid') || '',
        aria: el.getAttribute('aria-label') || '',
        text,
      });
    });
    return out.slice(0, 80);
  });
  console.log('=== Interactive elements:', JSON.stringify(elements, null, 1));

  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
