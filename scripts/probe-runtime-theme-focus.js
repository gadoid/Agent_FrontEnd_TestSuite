// @ts-check
/**
 * 复核探测 #7：_electron 实例里运行时主题切换为什么不动 —— 三层输入对比。
 *  A) locator.click（CDP 合成点击，无焦点基线）
 *  B) BrowserWindow.focus() + webContents.focus() 后再 locator.click
 *  C) webContents.sendInputEvent（Electron 主进程原生输入管线，真实坐标）
 * 附带 document.hasFocus() 观测。用法：node scripts/probe-runtime-theme-focus.js
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { _electron } = require('@playwright/test');
const { loadEnv, llmEnv } = require('../fixtures/env');

loadEnv();

const lumOf = (rgb) => {
  const m = (rgb || '').match(/\d+/g) || ['0', '0', '0'];
  return Math.round((+m[0] * 299 + +m[1] * 587 + +m[2] * 114) / 1000);
};

(async () => {
  const RUNTIME_CWD = path.join(os.tmpdir(), 'dsh-e2e-cwd');
  fs.mkdirSync(RUNTIME_CWD, { recursive: true });
  const app = await _electron.launch({
    executablePath: 'D:/sparkseed/sparkseed.exe',
    cwd: RUNTIME_CWD,
    env: { ...process.env, ...llmEnv() },
    timeout: 60000,
  });
  try {
    let win = null;
    const deadline = Date.now() + 90000;
    while (Date.now() < deadline && !win) {
      win = app.windows().find(w => w.url().startsWith('dsh-app://')) || null;
      if (!win) await new Promise(r => setTimeout(r, 1000));
    }
    await win.getByRole('button', { name: '新建会话' }).last().waitFor({ timeout: 30000 }).catch(() => {});
    const cont = win.getByRole('button', { name: '继续', exact: true }).first();
    if (await cont.isVisible().catch(() => false)) await cont.click({ timeout: 5000 }).catch(() => {});

    await win.getByRole('button', { name: /^(设置|账号菜单)$/ }).first().click({ timeout: 10000 }).catch(() => {});
    const mi = win.getByRole('menuitem', { name: '设置' });
    if (await mi.count().catch(() => 0)) await mi.first().click({ timeout: 5000 }).catch(() => {});
    await win.locator('[class*="navList"] button').first().waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
    await win.locator('[class*="navList"] button').filter({ hasText: '通用设置' }).first().click();
    await win.waitForTimeout(1000);

    const read = () => win.evaluate(() => {
      const d = [...document.querySelectorAll('[role="dialog"]')].find(d => d.getBoundingClientRect().height > 200);
      const btn = d && [...d.querySelectorAll('button')].find(b => /^(浅色|深色|跟随系统)$/.test((b.innerText || '').trim()) && /selected/.test(String(b.className)));
      const rgb = getComputedStyle(document.body).backgroundColor.match(/\d+/g) || ['0', '0', '0'];
      return {
        selected: btn ? btn.innerText.trim() : '(none)',
        lum: Math.round((+rgb[0] * 299 + +rgb[1] * 587 + +rgb[2] * 114) / 1000),
        hasFocus: document.hasFocus(),
      };
    });
    const themeBtn = (name) => win.locator('[role="dialog"] button')
      .filter({ hasText: new RegExp(`^\\s*${name}\\s*$`) }).filter({ visible: true }).first();
    const clickTheme = async (name) => {
      const b = themeBtn(name);
      await b.click({ timeout: 8000 });
      await win.waitForTimeout(1500);
    };

    console.log('A0 初始:', JSON.stringify(await read()));
    await clickTheme('浅色');
    console.log('A1 locator.click 浅色:', JSON.stringify(await read()));

    // B: Electron 焦点
    await app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows().find(x => x.isVisible()) || BrowserWindow.getAllWindows()[0];
      if (w) { w.show(); w.focus(); w.moveTop(); w.webContents.focus(); }
    });
    await win.waitForTimeout(800);
    console.log('B0 focus 后 hasFocus:', JSON.stringify(await read()));
    await clickTheme('跟随系统');
    console.log('B1 focus + locator.click 跟随系统:', JSON.stringify(await read()));

    // C: sendInputEvent 原生输入管线
    const rect = await themeBtn('深色').evaluate(el => {
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    await app.evaluate(({ BrowserWindow }, pos) => {
      const w = BrowserWindow.getAllWindows().find(x => x.isVisible()) || BrowserWindow.getAllWindows()[0];
      const wc = w.webContents;
      wc.focus();
      wc.sendInputEvent({ type: 'mouseMove', x: Math.round(pos.x), y: Math.round(pos.y) });
      wc.sendInputEvent({ type: 'mouseDown', x: Math.round(pos.x), y: Math.round(pos.y), button: 'left', clickCount: 1 });
      wc.sendInputEvent({ type: 'mouseUp', x: Math.round(pos.x), y: Math.round(pos.y), button: 'left', clickCount: 1 });
    }, rect);
    await win.waitForTimeout(1500);
    console.log('C1 sendInputEvent 深色:', JSON.stringify(await read()));

    // D: 页面内直接派发 pointer/mouse 事件（绕过输入管线，直打 DOM handler）
    await win.evaluate(() => {
      const d = [...document.querySelectorAll('[role="dialog"]')].find(d => d.getBoundingClientRect().height > 200);
      const b = [...d.querySelectorAll('button')].find(x => /^浅色$/.test((x.innerText || '').trim()));
      for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
        b.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window, button: 0 }));
      }
    });
    await win.waitForTimeout(1500);
    console.log('D1 dispatchEvent 浅色:', JSON.stringify(await read()));
  } finally {
    await app.close().catch(() => {});
  }
})().catch(e => { console.error('[probe7] FAIL:', e.message); process.exit(1); });
