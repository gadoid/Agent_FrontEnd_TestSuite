// @ts-check
/** 复核探测 #10：写入时机判定 —— 点击后正常关弹窗/重启，写入是否落盘、UI 何时反映。
 *  用法：node scripts/probe-write-flush.js  （会优雅退出应用再重启一次） */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { chromium } = require('playwright');
const { spawn, execSync } = require('child_process');

const PATCH = path.join(os.homedir(), '.eline', 'profiles', 'desktop', 'cordis.patch.yml');
const patchInfo = () => {
  try {
    const s = fs.statSync(PATCH);
    const m = fs.readFileSync(PATCH, 'utf8').match(/preference:\s*(\S+)|fontSize:\s*(\d+)/g);
    return { mtime: s.mtime.toLocaleTimeString('zh-CN'), keys: m };
  } catch (e) { return { err: e.message }; }
};

(async () => {
  const launch = () => new Promise((resolve) => {
    spawn('cmd', ['/c', 'start', '', 'D:\\ElineAI\\eline.exe', '--remote-debugging-port=9222'], { shell: false, detached: true, stdio: 'ignore' }).unref();
    setTimeout(resolve, 15000);
  });
  const connect = async () => {
    const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
    const page = browser.contexts()[0].pages().find(p => p.url().startsWith('dsh-app://'));
    return { browser, page };
  };
  const openSettings = async (page) => {
    await page.getByRole('button', { name: /^(设置|账号菜单)$/ }).first().click({ timeout: 10000 }).catch(() => {});
    const mi = page.getByRole('menuitem', { name: '设置' });
    if (await mi.count().catch(() => 0)) await mi.first().click({ timeout: 5000 }).catch(() => {});
    await page.locator('[class*="navList"] button').first().waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
    await page.locator('[class*="navList"] button').filter({ hasText: '通用设置' }).first().click();
    await page.waitForTimeout(800);
  };
  const read = (page) => page.evaluate(() => {
    const d = [...document.querySelectorAll('[role="dialog"]')].find(d => d.getBoundingClientRect().height > 200);
    const btn = d && [...d.querySelectorAll('button')].find(b => /^(浅色|深色|跟随系统)$/.test((b.innerText || '').trim()) && /selected/.test(String(b.className)));
    const rgb = getComputedStyle(document.body).backgroundColor.match(/\d+/g) || ['0', '0', '0'];
    return { sel: btn ? btn.innerText.trim() : '(none)', lum: Math.round((+rgb[0] * 299 + +rgb[1] * 587 + +rgb[2] * 114) / 1000) };
  });

  console.log('启动前 patch.yml:', JSON.stringify(patchInfo()));
  await launch();
  const { browser, page } = await connect();
  try {
    await page.getByRole('button', { name: '新建会话' }).last().waitFor({ timeout: 30000 }).catch(() => {});
    const cont = page.getByRole('button', { name: '继续', exact: true }).first();
    if (await cont.isVisible().catch(() => false)) await cont.click({ timeout: 5000 }).catch(() => {});
    await openSettings(page);
    console.log('打开后:', JSON.stringify(await read(page)));

    await page.locator('[role="dialog"] button').filter({ hasText: /^\s*浅色\s*$/ }).filter({ visible: true }).first().click({ timeout: 8000 });
    await page.waitForTimeout(1500);
    console.log('点浅色后(UI):', JSON.stringify(await read(page)), ' patch.yml:', JSON.stringify(patchInfo()));

    // 正常关闭设置弹窗（可能触发落盘）
    await page.locator('[data-slot="settings.close"]').or(page.getByRole('button', { name: '关闭' })).first()
      .click({ timeout: 5000 }).catch(() => page.keyboard.press('Escape'));
    await page.waitForTimeout(2500);
    console.log('关闭弹窗后 patch.yml:', JSON.stringify(patchInfo()));

    // 重开设置看选中态
    await openSettings(page);
    console.log('重开弹窗后(UI):', JSON.stringify(await read(page)));
  } finally {
    // 优雅退出：CDP Browser.close 断开；再用 taskkill（无 /F）发 WM_CLOSE
    await browser.close().catch(() => {});
  }
  execSync('taskkill /IM eline.exe', { stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 4000));
  console.log('退出后 patch.yml:', JSON.stringify(patchInfo()));

  // 重启读初始主题
  await launch();
  const b2 = await connect();
  try {
    await b2.page.getByRole('button', { name: '新建会话' }).last().waitFor({ timeout: 30000 }).catch(() => {});
    const cont = b2.page.getByRole('button', { name: '继续', exact: true }).first();
    if (await cont.isVisible().catch(() => false)) await cont.click({ timeout: 5000 }).catch(() => {});
    const lum = await b2.page.evaluate(() => {
      const rgb = getComputedStyle(document.body).backgroundColor.match(/\d+/g) || ['0', '0', '0'];
      return Math.round((+rgb[0] * 299 + +rgb[1] * 587 + +rgb[2] * 114) / 1000);
    });
    console.log('重启后启动亮度:', lum, '(21≈深色, 255≈浅色)', ' patch.yml:', JSON.stringify(patchInfo()));
  } finally {
    await b2.browser.close().catch(() => {});
  }
})().catch(e => { console.error('[probe10] FAIL:', e.message); process.exit(1); });
