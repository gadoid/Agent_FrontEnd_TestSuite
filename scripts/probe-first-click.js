// @ts-check
/** 复核探测 #9：新鲜启动后「设置打开后的首次交互」是否有效 + 后续连续交互是否衰减。
 *  用法：node scripts/probe-first-click.js  （前提：eline 已以 --remote-debugging-port=9222 正常启动） */
const { chromium } = require('playwright');

const lumOf = (rgb) => {
  const m = (rgb || '').match(/\d+/g) || ['0', '0', '0'];
  return Math.round((+m[0] * 299 + +m[1] * 587 + +m[2] * 114) / 1000);
};

(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  try {
    const page = browser.contexts()[0].pages().find(p => p.url().startsWith('dsh-app://'));
    if (!page) throw new Error('no dsh-app page');
    await page.getByRole('button', { name: '新建会话' }).last().waitFor({ timeout: 30000 }).catch(() => {});
    const cont = page.getByRole('button', { name: '继续', exact: true }).first();
    if (await cont.isVisible().catch(() => false)) await cont.click({ timeout: 5000 }).catch(() => {});

    const read = () => page.evaluate(() => {
      const d = [...document.querySelectorAll('[role="dialog"]')].find(d => d.getBoundingClientRect().height > 200);
      const btn = d && [...d.querySelectorAll('button')].find(b => /^(浅色|深色|跟随系统)$/.test((b.innerText || '').trim()) && /selected/.test(String(b.className)));
      const rgb = getComputedStyle(document.body).backgroundColor.match(/\d+/g) || ['0', '0', '0'];
      return { sel: btn ? btn.innerText.trim() : '(none)', lum: Math.round((+rgb[0] * 299 + +rgb[1] * 587 + +rgb[2] * 114) / 1000) };
    });
    const clickTheme = async (name) => {
      const b = page.locator('[role="dialog"] button').filter({ hasText: new RegExp(`^\\s*${name}\\s*$`) }).filter({ visible: true }).first();
      await b.click({ timeout: 8000 });
      await page.waitForTimeout(1500);
    };

    // 打开设置 → 切通用设置 → 立即点主题（模拟用户最短路径）
    await page.getByRole('button', { name: /^(设置|账号菜单)$/ }).first().click({ timeout: 10000 }).catch(() => {});
    const mi = page.getByRole('menuitem', { name: '设置' });
    if (await mi.count().catch(() => 0)) await mi.first().click({ timeout: 5000 }).catch(() => {});
    await page.locator('[class*="navList"] button').first().waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
    await page.locator('[class*="navList"] button').filter({ hasText: '通用设置' }).first().click();
    await page.waitForTimeout(600);
    console.log('切到通用设置后:', JSON.stringify(await read()));

    await clickTheme('浅色');
    console.log('① 首次点击 浅色:', JSON.stringify(await read()));
    await clickTheme('深色');
    console.log('② 连续点击 深色:', JSON.stringify(await read()));
    await clickTheme('跟随系统');
    console.log('③ 连续点击 跟随系统:', JSON.stringify(await read()));
    await page.waitForTimeout(30000);
    await clickTheme('浅色');
    console.log('④ 等30s后点击 浅色:', JSON.stringify(await read()));
  } finally {
    await browser.close().catch(() => {});
  }
})().catch(e => { console.error('[probe9] FAIL:', e.message); process.exit(1); });
