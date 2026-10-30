// @ts-check
// 探测脚本：连接 sparkseed 的 dsh web（默认 127.0.0.1:3080），
// token 登录后输出各区域可交互元素结构（选择器考古用）。
// 用法: node scripts/explore-eline.js [token]
const { chromium } = require('@playwright/test');
const fs = require('fs');

const APP_URL = process.env.E2E_URL || 'http://127.0.0.1:3080/';
const TOKEN = process.argv[2] || (fs.existsSync('.runtime/web-server.json')
  ? JSON.parse(fs.readFileSync('.runtime/web-server.json', 'utf8')).token : '');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' });
  const page = await context.newPage();
  await page.goto(`${APP_URL}?token=${TOKEN}`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(5000);

  console.log('=== URL:', page.url());
  console.log('=== Cookies:', (await context.cookies()).map(c => c.name).join(', '));
  console.log('=== Title:', await page.title());

  const dump = async (label) => {
    const elements = await page.evaluate(() => {
      const out = [];
      const sel = 'button, a, input, textarea, [role="button"], [role="textbox"], [contenteditable="true"], [role="tab"], [role="menuitem"], [role="combobox"], [role="option"], [role="menuitemradio"], [role="switch"], [role="treeitem"], [role="searchbox"]';
      document.querySelectorAll(sel).forEach((el) => {
        const text = (el.innerText || el.getAttribute('aria-label') || el.getAttribute('placeholder') || '').trim().slice(0, 70);
        if (!text) return;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return;
        out.push({
          tag: el.tagName.toLowerCase(),
          role: el.getAttribute('role') || '',
          slot: el.getAttribute('data-slot') || '',
          rowkey: (el.getAttribute('data-row-key') || '').slice(0, 44),
          aria: el.getAttribute('aria-label') || '',
          title: el.getAttribute('title') || '',
          text,
        });
      });
      return out.slice(0, 250);
    });
    console.log(`\n########## ${label} ##########`);
    for (const e of elements) console.log(JSON.stringify(e));
  };

  await page.screenshot({ path: 'explore-eline-home.png' });
  await dump('首页/主对话页');

  // 关闭可能的欢迎/onboarding 弹层
  for (const name of ['开始使用', '知道了', '知道了', '关闭', '确定']) {
    const b = page.getByRole('button', { name }).first();
    if (await b.isVisible().catch(() => false)) { await b.click().catch(() => {}); await page.waitForTimeout(500); }
  }

  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
