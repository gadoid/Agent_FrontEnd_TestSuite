// @ts-check
/** 聚焦探测 #3：设置-模型 页签「编辑」按钮点击后是否弹出编辑弹层（含 input）。
 *  用法：node scripts/probe-provider-editor.js */
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
    executablePath: 'D:/ElineAI/eline.exe',
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
    if (!win) throw new Error('未等到主窗口');
    await win.getByRole('button', { name: '新建会话' }).last().waitFor({ timeout: 30000 }).catch(() => {});
    const cont = win.getByRole('button', { name: '继续', exact: true }).first();
    if (await cont.isVisible().catch(() => false)) await cont.click({ timeout: 5000 }).catch(() => {});

    await win.getByRole('button', { name: /^(设置|账号菜单)$/ }).first().click({ timeout: 10000 }).catch(() => {});
    const mi = win.getByRole('menuitem', { name: '设置' });
    if (await mi.count().catch(() => 0)) await mi.first().click({ timeout: 5000 }).catch(() => {});
    await win.locator('[class*="navList"] button').first().waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
    await win.locator('[class*="navList"] button').filter({ hasText: '模型' }).first().click();
    await win.waitForTimeout(900);

    const dialogsBefore = await win.evaluate(() =>
      [...document.querySelectorAll('[role="dialog"]')].map(d => ({ h: Math.round(d.getBoundingClientRect().height), inputs: d.querySelectorAll('input').length })));
    console.log('[probe3] 点击前 dialogs:', JSON.stringify(dialogsBefore));

    const editBtn = win.getByRole('button', { name: /^编辑$/ }).first();
    console.log('[probe3] 「编辑」按钮可见:', await editBtn.isVisible().catch(() => false));
    await editBtn.click({ timeout: 5000 }).catch(e => console.log('[probe3] click err:', e.message.split('\n')[0]));
    await win.waitForTimeout(1500);

    const after = await win.evaluate(() => {
      const dlgs = [...document.querySelectorAll('[role="dialog"]')].map(d => ({
        h: Math.round(d.getBoundingClientRect().height),
        inputs: [...d.querySelectorAll('input')].map(i => ({ ph: i.placeholder || '', val: (i.value || '').slice(0, 30) })),
        text: (d.innerText || '').split('\n').map(s => s.trim()).filter(Boolean).slice(0, 25),
      }));
      return dlgs;
    });
    console.log('[probe3] 点击后 dialogs:', JSON.stringify(after, null, 1));

    // Esc 关闭，避免留状态
    await win.keyboard.press('Escape').catch(() => {});
  } finally {
    await app.close().catch(() => {});
  }
})().catch(e => { console.error('[probe3] FAIL:', e.message); process.exit(1); });
