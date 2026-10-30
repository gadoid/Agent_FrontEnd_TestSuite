// @ts-check
/** 聚焦探测 #4：dump 设置-模型 页签提供商行 DOM，找「编辑」可靠定位 + 实际点击效果。
 *  用法：node scripts/probe-provider-dom.js */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { _electron } = require('@playwright/test');
const { loadEnv, llmEnv } = require('../fixtures/env');

loadEnv();

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
    await win.locator('[class*="navList"] button').filter({ hasText: '模型' }).first().click();
    await win.waitForTimeout(1000);

    // 找到包含 elineAI 的行，dump 其 HTML 与所有 button 状态
    const info = await win.evaluate(() => {
      const out = {};
      const dlg = [...document.querySelectorAll('[role="dialog"]')].find(d => d.getBoundingClientRect().height > 200);
      if (!dlg) return { err: 'no dialog' };
      const rows = [...dlg.querySelectorAll('*')].filter(el =>
        el.children.length && /^\s*elineAI\s*$/.test((el.innerText || '').split('\n')[0] || ''));
      const row = rows[rows.length - 1];
      if (row) {
        out.rowHTML = row.outerHTML.slice(0, 1200);
        out.rowButtons = [...row.querySelectorAll('button')].map(b => ({
          text: (b.innerText || '').trim(), visible: b.getBoundingClientRect().height > 0,
          display: getComputedStyle(b).display, aria: b.getAttribute('aria-label'),
        }));
      }
      // 所有含「编辑」文本的 button
      out.editBtns = [...dlg.querySelectorAll('button')].filter(b => (b.innerText || '').trim() === '编辑')
        .map(b => ({
          visible: b.getBoundingClientRect().height > 0,
          display: getComputedStyle(b).display,
          parentCls: String(b.parentElement.className).slice(0, 60),
          inRow: !!b.closest('div')?.innerText.includes('elineAI'),
        }));
      return out;
    });
    console.log(JSON.stringify(info, null, 1));

    // 直接 DOM click 试试（绕过 Playwright 可见性检查）
    const clicked = await win.evaluate(() => {
      const dlg = [...document.querySelectorAll('[role="dialog"]')].find(d => d.getBoundingClientRect().height > 200);
      const b = [...dlg.querySelectorAll('button')].find(x => (x.innerText || '').trim() === '编辑');
      if (!b) return 'no button';
      b.click();
      return 'dom-clicked';
    });
    console.log('[probe4]', clicked);
    await win.waitForTimeout(1500);
    const after = await win.evaluate(() =>
      [...document.querySelectorAll('[role="dialog"]')].map(d => ({
        h: Math.round(d.getBoundingClientRect().height),
        inputs: [...d.querySelectorAll('input')].map(i => ({ ph: i.placeholder || '', val: (i.value || '').slice(0, 40) })),
        head: (d.innerText || '').split('\n').map(s => s.trim()).filter(Boolean).slice(0, 20),
      })));
    console.log('[probe4] DOM click 后 dialogs:', JSON.stringify(after, null, 1));
    await win.keyboard.press('Escape').catch(() => {});
  } finally {
    await app.close().catch(() => {});
  }
})().catch(e => { console.error('[probe4] FAIL:', e.message); process.exit(1); });
