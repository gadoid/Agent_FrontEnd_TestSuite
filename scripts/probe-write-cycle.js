// @ts-check
/** 复核探测 #11：循环假设 —— patch 文件为空时首写成功、非空后再写失败。
 *  前提：cordis.patch.yml 已重置为 []，eline 已关闭。结束后由外部恢复备份。
 *  用法：node scripts/probe-write-cycle.js */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { chromium } = require('playwright');
const { spawn } = require('child_process');

const PATCH = path.join(os.homedir(), '.eline', 'profiles', 'desktop', 'cordis.patch.yml');
const patchState = () => {
  try {
    const m = fs.readFileSync(PATCH, 'utf8').match(/preference:\s*(\S+)|fontSize:\s*(\d+)/g);
    return { mtime: fs.statSync(PATCH).mtime.toLocaleTimeString('zh-CN'), keys: m || '(空)' };
  } catch (e) { return { err: e.message }; }
};

(async () => {
  const launch = () => new Promise((resolve) => {
    spawn('cmd', ['/c', 'start', '', 'D:\\sparkseed\\sparkseed.exe', '--remote-debugging-port=9222'], { shell: false, detached: true, stdio: 'ignore' }).unref();
    setTimeout(resolve, 15000);
  });
  spawn('cmd', ['/c', 'start', '', 'D:\\sparkseed\\sparkseed.exe', '--remote-debugging-port=9222'], { shell: false, detached: true, stdio: 'ignore' }).unref();
  await new Promise(r => setTimeout(r, 15000));

  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  try {
    const page = browser.contexts()[0].pages().find(p => p.url().startsWith('dsh-app://'));
    await page.getByRole('button', { name: '新建会话' }).last().waitFor({ timeout: 30000 }).catch(() => {});
    const cont = page.getByRole('button', { name: '继续', exact: true }).first();
    if (await cont.isVisible().catch(() => false)) await cont.click({ timeout: 5000 }).catch(() => {});

    await page.getByRole('button', { name: /^(设置|账号菜单)$/ }).first().click({ timeout: 10000 }).catch(() => {});
    const mi = page.getByRole('menuitem', { name: '设置' });
    if (await mi.count().catch(() => 0)) await mi.first().click({ timeout: 5000 }).catch(() => {});
    await page.locator('[class*="navList"] button').first().waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
    await page.locator('[class*="navList"] button').filter({ hasText: '通用设置' }).first().click();
    await page.waitForTimeout(800);

    const read = () => page.evaluate(() => {
      const d = [...document.querySelectorAll('[role="dialog"]')].find(d => d.getBoundingClientRect().height > 200);
      const btn = d && [...d.querySelectorAll('button')].find(b => /^(浅色|深色|跟随系统)$/.test((b.innerText || '').trim()) && /selected/.test(String(b.className)));
      const rgb = getComputedStyle(document.body).backgroundColor.match(/\d+/g) || ['0', '0', '0'];
      const num = d ? ((d.innerText || '').match(/字号大小[\s\S]{0,40}?(\d+)\s*px/) || [])[1] : null;
      return { sel: btn ? btn.innerText.trim() : '(none)', lum: Math.round((+rgb[0] * 299 + +rgb[1] * 587 + +rgb[2] * 114) / 1000), font: num };
    });

    console.log('空patch启动:', JSON.stringify(await read()), ' patch:', JSON.stringify(patchState()));

    // 第一笔写入：深色 + 字号16（复原用户设置）
    await page.locator('[role="dialog"] button').filter({ hasText: /^\s*深色\s*$/ }).filter({ visible: true }).first().click({ timeout: 8000 });
    await page.waitForTimeout(1500);
    console.log('① 首写 点深色:', JSON.stringify(await read()), ' patch:', JSON.stringify(patchState()));

    const inc = page.getByRole('button', { name: '增大字号' });
    await inc.click({ timeout: 8000 }); await page.waitForTimeout(900);
    await inc.click({ timeout: 8000 }); await page.waitForTimeout(900);
    console.log('② 首写 字号+2:', JSON.stringify(await read()), ' patch:', JSON.stringify(patchState()));

    // 第二笔写入：浅色（换一个不同值）
    await page.locator('[role="dialog"] button').filter({ hasText: /^\s*浅色\s*$/ }).filter({ visible: true }).first().click({ timeout: 8000 });
    await page.waitForTimeout(1500);
    console.log('③ 二写 点浅色:', JSON.stringify(await read()), ' patch:', JSON.stringify(patchState()));
  } finally {
    await browser.close().catch(() => {});
  }
})().catch(e => { console.error('[probe11] FAIL:', e.message); process.exit(1); });
