// @ts-check
// 探测脚本3：易链市场插件列表 + 插件详情 + 工作区文件（知识库载体）
const { chromium } = require('@playwright/test');

const APP_URL = process.env.DSH_URL || 'http://127.0.0.1:3080/';
const TOKEN = process.env.DSH_TOKEN || 'C79C_OJtFuNt2F7URLeM4OoWms1L3fyfFXgGsnaVtNs';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${APP_URL}?token=${TOKEN}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);

  // 打开易链市场
  await page.getByRole('button', { name: '易链市场' }).click();
  await page.waitForTimeout(2500);

  // 插件目录列表
  const cards = await page.evaluate(() => {
    const out = [];
    // 找所有看起来像插件卡片的元素
    document.querySelectorAll('button, [role="listitem"], [class*="card"], [class*="plugin"], [class*="item"]').forEach(el => {
      const t = (el.innerText || '').trim().replace(/\n/g, ' | ').slice(0, 120);
      if (t && t.length > 5 && !out.includes(t)) out.push(t);
    });
    return out.slice(0, 40);
  });
  console.log('===== MARKET items =====');
  console.log(cards.join('\n---\n'));

  await page.screenshot({ path: 'explore-market-list.png' });

  // 点击第一个非"已安装"的安装类按钮或插件卡片
  const installBtns = await page.$$('button:has-text("安装")');
  console.log('\n===== install buttons count:', installBtns.length);
  if (installBtns.length) {
    await installBtns[0].click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'explore-plugin-detail.png' });
    const detail = await page.evaluate(() => document.body.innerText.slice(0, 1500));
    console.log('\n===== PLUGIN DETAIL =====\n', detail);
  }

  // 已安装 tab
  const installed = page.getByRole('button', { name: '已安装' });
  if (await installed.count()) {
    await installed.click();
    await page.waitForTimeout(1500);
    const txt = await page.evaluate(() => document.body.innerText.slice(0, 1200));
    console.log('\n===== INSTALLED =====\n', txt);
    await page.screenshot({ path: 'explore-installed.png' });
  }

  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
