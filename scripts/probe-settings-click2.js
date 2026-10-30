// @ts-check
/**
 * 聚焦探测 #2：设置控件点击后到底发生什么。
 * 对照组：显示代码工作视图开关（RPC 通路是否正常）；
 * 疑问组：主题三按钮 / 字号增减 / 语言选择 —— aria 状态、disabled、localStorage、toast。
 * 全程只读+复原，不落任何业务数据。用法：node scripts/probe-settings-click2.js
 */
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
    if (!win) throw new Error('未等到 dsh-app:// 主窗口');
    await win.getByRole('button', { name: '新建会话' }).last().waitFor({ timeout: 30000 }).catch(() => {});
    const cont = win.getByRole('button', { name: '继续', exact: true }).first();
    if (await cont.isVisible().catch(() => false)) await cont.click({ timeout: 5000 }).catch(() => {});

    async function openSettings() {
      if (await win.locator('[class*="navList"] button').first().isVisible().catch(() => false)) return;
      await win.keyboard.press('Escape').catch(() => {});
      await win.waitForTimeout(300);
      await win.getByRole('button', { name: /^(设置|账号菜单)$/ }).first().click({ timeout: 10000 }).catch(() => {});
      const mi = win.getByRole('menuitem', { name: '设置' });
      if (await mi.count().catch(() => 0)) await mi.first().click({ timeout: 5000 }).catch(() => {});
      await win.locator('[class*="navList"] button').first().waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
      await win.waitForTimeout(600);
    }
    await openSettings();
    await win.locator('[class*="navList"] button').filter({ hasText: '通用设置' }).first().click();
    await win.waitForTimeout(800);

    const snapshot = () => win.evaluate(() => ({
      ls: Object.fromEntries(Object.entries(localStorage).filter(([k]) => /theme|font|lang|locale|appear|setting/i.test(k))),
      switches: [...document.querySelectorAll('[role="switch"]')].map(el => ({
        t: (el.innerText || el.getAttribute('aria-label') || '').trim().slice(0, 30), c: el.getAttribute('aria-checked'),
      })),
      themeBtns: [...document.querySelectorAll('button')].filter(b => /^(浅色|深色|跟随系统)$/.test((b.innerText || '').trim()))
        .map(b => ({ t: b.innerText.trim(), pressed: b.getAttribute('aria-pressed'), disabled: b.disabled, cls: String(b.className).slice(0, 80) })),
      fontBtns: [...document.querySelectorAll('button')].filter(b => /^(增大字号|减小字号)$/.test((b.innerText || '').trim()))
        .map(b => ({ t: b.innerText.trim(), disabled: b.disabled })),
      fontVar: document.body.style.getPropertyValue('--dsh-content-font-size')
        || getComputedStyle(document.body).getPropertyValue('--dsh-content-font-size'),
      toasts: [...document.querySelectorAll('[data-sonner-toast], [role="status"], [role="alert"]')]
        .map(t => (t.innerText || '').trim()).filter(Boolean).slice(0, 5),
    }));
    const dump = (label, s) => console.log(`\n--- ${label} ---\n${JSON.stringify(s, null, 1)}`);

    console.log('== 初始快照 ==');
    dump('init', await snapshot());

    // 对照组：显示代码工作视图开关
    const sw = win.locator('[role="switch"]').filter({ hasText: '显示代码工作视图' }).first();
    if (await sw.isVisible().catch(() => false)) {
      await sw.click();
      await win.waitForTimeout(800);
      dump('点「显示代码工作视图」后', await snapshot());
      await sw.click();
      await win.waitForTimeout(600);
      dump('复原开关后', await snapshot());
    } else {
      console.log('!! 显示代码工作视图 开关不可见');
    }

    // 疑问组：主题按钮（普通 click + force click 双尝试）
    for (const t of ['深色', '浅色']) {
      const btn = win.locator('button').filter({ hasText: new RegExp(`^\\s*${t}\\s*$`) }).first();
      if (!(await btn.isVisible().catch(() => false))) { console.log(`!! 按钮「${t}」不可见`); continue; }
      await btn.click().catch(e => console.log(`  click 异常: ${e.message.split('\n')[0]}`));
      await win.waitForTimeout(900);
      dump(`点「${t}」后`, await snapshot());
    }

    // 疑问组：字号
    const inc = win.getByRole('button', { name: '增大字号' }).first();
    if (await inc.isVisible().catch(() => false)) {
      await inc.click().catch(e => console.log(`  click 异常: ${e.message.split('\n')[0]}`));
      await win.waitForTimeout(900);
      dump('点「增大字号」后', await snapshot());
    }

    // 疑问组：语言
    const trig = win.locator('[role="dialog"] button').filter({ hasText: /^(中文|English)$/ }).first();
    if (await trig.isVisible().catch(() => false)) {
      await trig.click();
      await win.waitForTimeout(500);
      const en = win.locator('[role="menuitem"]').filter({ hasText: /^\s*English\s*$/ }).first();
      await en.click().catch(e => console.log(`  选 English 异常: ${e.message.split('\n')[0]}`));
      await win.waitForTimeout(1500);
      dump('选 English 后', await snapshot());
      // 恢复中文
      const trig2 = win.locator('[role="dialog"] button').filter({ hasText: /^(中文|English)$/ }).first();
      await trig2.click().catch(() => {});
      await win.waitForTimeout(400);
      await win.locator('[role="menuitem"]').filter({ hasText: /^\s*中文\s*$/ }).first().click().catch(() => {});
      await win.waitForTimeout(800);
      dump('恢复中文后', await snapshot());
    }
  } finally {
    await app.close().catch(() => {});
  }
})().catch(e => { console.error('[probe2] FAIL:', e.message); process.exit(1); });
