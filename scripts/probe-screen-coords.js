// @ts-check
/** 取「深色」按钮的屏幕坐标（供 OS 级真实点击）+ 每次调用读取主题状态。
 *  用法：node scripts/probe-screen-coords.js [click=x,y] */
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  try {
    const page = browser.contexts()[0].pages().find(p => p.url().startsWith('dsh-app://'));
    if (!page) throw new Error('no page');

    // 恢复窗口（若最小化）
    const session = await page.context().newCDPSession(page);
    try {
      const { windowId } = await session.send('Browser.getWindowForTarget');
      await session.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal' } });
      await page.waitForTimeout(800);
    } catch (e) { console.log('[coords] 恢复窗口失败(忽略):', e.message.split('\n')[0]); }

    // 确保设置打开在通用设置
    const isOpen = await page.locator('[class*="navList"] button').first().isVisible().catch(() => false);
    if (!isOpen) {
      await page.getByRole('button', { name: /^(设置|账号菜单)$/ }).first().click({ timeout: 10000 }).catch(() => {});
      const mi = page.getByRole('menuitem', { name: '设置' });
      if (await mi.count().catch(() => 0)) await mi.first().click({ timeout: 5000 }).catch(() => {});
      await page.locator('[class*="navList"] button').first().waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
    }
    const generalActive = await page.locator('[class*="navList"] button', { hasText: '通用设置' }).first()
      .evaluate(el => /selected|active/.test(String(el.className))).catch(() => false);
    if (!generalActive) {
      await page.locator('[class*="navList"] button').filter({ hasText: '通用设置' }).first().click();
      await page.waitForTimeout(800);
    }

    const info = await page.evaluate(() => {
      const d = [...document.querySelectorAll('[role="dialog"]')].find(d => d.getBoundingClientRect().height > 200);
      const names = ['浅色', '深色', '跟随系统'];
      const out = { dpr: window.devicePixelRatio, screenX: window.screenX, screenY: window.screenY, outerH: window.outerHeight, innerH: window.innerHeight, btns: {} };
      for (const n of names) {
        const b = d && [...d.querySelectorAll('button')].find(x => new RegExp(`^\\s*${n}\\s*$`).test((x.innerText || '').trim()));
        if (!b) continue;
        const r = b.getBoundingClientRect();
        out.btns[n] = {
          selected: /selected/.test(String(b.className)),
          x: Math.round(window.screenX + r.x + r.width / 2),
          y: Math.round(window.screenY + (window.outerHeight - window.innerHeight) + r.y + r.height / 2),
        };
      }
      const rgb = getComputedStyle(document.body).backgroundColor.match(/\d+/g) || ['0', '0', '0'];
      out.lum = Math.round((+rgb[0] * 299 + +rgb[1] * 587 + +rgb[2] * 114) / 1000);
      return out;
    });
    console.log(JSON.stringify(info, null, 1));
  } finally {
    await browser.close().catch(() => {});
  }
})().catch(e => { console.error('[coords] FAIL:', e.message); process.exit(1); });
