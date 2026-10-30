// @ts-check
/**
 * 复核探测 #6：设置写入恢复后的实测基线取数（与测试套件同款 _electron 拉起）。
 * 测：主题三档亮度值 / 字号步进值 / 语言切换锚点 / 开关翻转 / 提供商编辑卡片形态。
 * 结束恢复原状。用法：node scripts/probe-settings-after-fix.js
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { _electron } = require('@playwright/test');
const { loadEnv, llmEnv } = require('../fixtures/env');

loadEnv();

const lumOf = (rgbStr) => {
  const m = (rgbStr || '').match(/\d+/g) || ['0', '0', '0'];
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

    const lum = () => win.evaluate(() => {
      const rgb = getComputedStyle(document.body).backgroundColor.match(/\d+/g) || ['0', '0', '0'];
      return Math.round((+rgb[0] * 299 + +rgb[1] * 587 + +rgb[2] * 114) / 1000);
    });
    const themeState = () => win.evaluate(() => ({
      bodyBg: getComputedStyle(document.body).backgroundColor,
      btns: [...document.querySelectorAll('[role="dialog"] button')].filter(b => /^(浅色|深色|跟随系统)$/.test((b.innerText || '').trim()))
        .map(b => ({ t: b.innerText.trim(), pressed: b.getAttribute('aria-pressed'), selected: /selected/.test(String(b.className)) })),
    }));
    const clickTheme = async (name) => {
      const b = win.locator('[role="dialog"] button').filter({ hasText: new RegExp(`^\\s*${name}\\s*$`) }).filter({ visible: true }).first();
      await b.click({ timeout: 8000 });
      await win.waitForTimeout(1500);
    };

    console.log('===== 主题 =====');
    console.log('初始:', JSON.stringify(await themeState()), '亮度=', await lum());
    for (const t of ['深色', '浅色', '跟随系统']) {
      await clickTheme(t);
      console.log(`点「${t}」→ 亮度=${await lum()} 状态=${JSON.stringify(await themeState())}`);
    }

    console.log('\n===== 字号 =====');
    const fontState = () => win.evaluate(() => ({
      var14: document.body.style.getPropertyValue('--dsh-content-font-size')
        || getComputedStyle(document.body).getPropertyValue('--dsh-content-font-size'),
      dlgNum: (() => {
        const d = [...document.querySelectorAll('[role="dialog"]')].find(d => d.getBoundingClientRect().height > 200);
        if (!d) return null;
        const m = (d.innerText || '').match(/字号大小[\s\S]{0,40}?(\d+)\s*px/);
        return m ? m[1] : null;
      })(),
    }));
    console.log('初始:', JSON.stringify(await fontState()));
    const inc = win.getByRole('button', { name: '增大字号' });
    for (let i = 0; i < 2; i++) { await inc.click({ timeout: 8000 }); await win.waitForTimeout(900); }
    console.log('增大×2:', JSON.stringify(await fontState()));
    const dec = win.getByRole('button', { name: '减小字号' });
    await dec.click({ timeout: 8000 }); await win.waitForTimeout(900);
    console.log('减小×1:', JSON.stringify(await fontState()));
    await dec.click({ timeout: 8000 }); await win.waitForTimeout(900);
    console.log('复原后:', JSON.stringify(await fontState()));

    console.log('\n===== 语言 =====');
    const trig = () => win.locator('[role="dialog"] button').filter({ hasText: /^(中文|English)$/ }).filter({ visible: true }).first();
    await trig().click({ timeout: 8000 }); await win.waitForTimeout(500);
    await win.locator('[role="menuitem"]').filter({ hasText: /^\s*English\s*$/ }).first().click();
    await win.waitForTimeout(2000);
    console.log('选 English 后 trigger:', JSON.stringify(await trig().innerText().catch(() => '(x)')),
      '含「新会话」:', (await win.evaluate(() => document.body.innerText)).includes('新会话'),
      '含「New chat」:', (await win.evaluate(() => document.body.innerText)).includes('New chat'));
    await trig().click({ timeout: 8000 }).catch(() => {}); await win.waitForTimeout(500);
    await win.locator('[role="menuitem"]').filter({ hasText: /^\s*中文\s*$/ }).first().click().catch(() => {});
    await win.waitForTimeout(1500);
    console.log('恢复中文后 含「新会话」:', (await win.evaluate(() => document.body.innerText)).includes('新会话'));

    console.log('\n===== 开关（对话内角色定位 + 坐标兜底） =====');
    const swRead = () => win.evaluate(() => {
      const d = [...document.querySelectorAll('[role="dialog"]')].find(d => d.getBoundingClientRect().height > 200);
      if (!d) return null;
      const el = [...d.querySelectorAll('[role="switch"]')].find(x => (x.closest('div,section,label')?.innerText || '').includes('显示代码工作视图'));
      if (!el) return { found: false };
      const r = el.getBoundingClientRect();
      return { found: true, checked: el.getAttribute('aria-checked'), x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    console.log('开关(前):', JSON.stringify(await swRead()));
    let st = await swRead();
    await win.mouse.click(st.x, st.y);
    await win.waitForTimeout(1000);
    st = await swRead();
    console.log('坐标点击后:', JSON.stringify(st));
    await win.mouse.click(st.x, st.y);
    await win.waitForTimeout(1000);
    console.log('复原点击后:', JSON.stringify(await swRead()));
  } finally {
    await app.close().catch(() => {});
  }
})().catch(e => { console.error('[probe6] FAIL:', e.message); process.exit(1); });
