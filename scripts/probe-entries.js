// @ts-check
// 定位 归档会话/重命名会话 入口：右键菜单 + 快捷键绑定读取。
const { chromium } = require('@playwright/test');

(async () => {
  const TOKEN = process.argv[2];
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' })).newPage();
  await page.goto(`http://127.0.0.1:3080/?token=${TOKEN}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  const cont = page.getByRole('button', { name: '继续', exact: true }).first();
  if (await cont.isVisible().catch(() => false)) await cont.click();
  await page.waitForTimeout(500);

  // 进入一条非空会话
  const rows = page.locator('div[role="treeitem"][data-row-key^="session:"]');
  const n = await rows.count();
  for (let i = 0; i < n; i++) {
    const t = (await rows.nth(i).innerText()).trim();
    if (!t.includes('新会话')) { await rows.nth(i).click(); break; }
  }
  await page.waitForTimeout(1200);

  // 1) 右键会话行 → 上下文菜单？
  console.log('== 右键会话行 ==');
  const row = rows.first();
  await row.click({ button: 'right' }).catch(() => {});
  await page.waitForTimeout(700);
  let menuItems = await page.evaluate(() => [...document.querySelectorAll('[role="menuitem"]')]
    .filter(e => e.getBoundingClientRect().width > 0).map(e => (e.innerText || '').trim().replace(/\n/g, ' ')));
  console.log('右键菜单:', JSON.stringify(menuItems));
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(400);

  // 2) 会话头部的会话名按钮（点击标题可能弹菜单）
  console.log('== 会话标题点击 ==');
  const titleBtn = page.locator('header button, [class*="header"] button').filter({ hasText: /.+/ }).first();
  const headerBtns = await page.evaluate(() => [...document.querySelectorAll('button')]
    .filter(b => { const r = b.getBoundingClientRect(); return r.width > 0 && r.top < 120; })
    .map(b => ({ aria: b.getAttribute('aria-label') || '', text: (b.innerText || '').trim().slice(0, 30) })));
  console.log('头部按钮:', JSON.stringify(headerBtns));
  const titleLike = page.locator('button[aria-label*="会话"], button[aria-label*="重命名"]').first();
  if (await titleLike.count()) {
    await titleLike.click().catch(() => {});
    await page.waitForTimeout(600);
    menuItems = await page.evaluate(() => [...document.querySelectorAll('[role="menuitem"]')]
      .filter(e => e.getBoundingClientRect().width > 0).map(e => (e.innerText || '').trim().replace(/\n/g, ' ')));
    console.log('标题点击菜单:', JSON.stringify(menuItems));
    await page.keyboard.press('Escape').catch(() => {});
  }

  // 3) 快捷键编辑器读「归档会话」「重命名会话」当前绑定
  console.log('== 快捷键绑定 ==');
  await page.getByRole('button', { name: '设置', exact: true }).first().click().catch(() => {});
  await page.waitForTimeout(900);
  await page.getByRole('button', { name: '编辑快捷键' }).first().click().catch(() => {});
  await page.waitForTimeout(900);
  const kbRows = await page.evaluate(() => [...document.querySelectorAll('button, [role="row"], tr, li, div')]
    .filter(e => /归档会话|重命名会话|分叉会话/.test((e.getAttribute('aria-label') || '') + (e.innerText || '')) && e.getBoundingClientRect().height > 0 && e.getBoundingClientRect().height < 80)
    .map(e => ({ aria: e.getAttribute('aria-label') || '', text: (e.innerText || '').trim().replace(/\n/g, ' | ').slice(0, 80) })));
  console.log('归档/重命名/分叉 相关行:', JSON.stringify(kbRows, null, 1));
  await page.screenshot({ path: 'probe-kb.png' });

  await browser.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
