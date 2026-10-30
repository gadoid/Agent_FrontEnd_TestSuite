// @ts-check
/**
 * 一次性探测：确认 7 条失败用例对应的 eline 当前真实行为，为套件适配取数。
 * 覆盖：主题切换实际改变了什么 / 字号控件行为 / 语言切换实际效果 /
 *      通用设置开关与选择器清单 / 模型目录实际显示名 / 模型页签提供商编辑区结构。
 * 结束时恢复初始主题/字号/语言。用法：node scripts/probe-settings-behavior.js
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
    if (!win) throw new Error('未等到 dsh-app:// 主窗口');
    console.log(`[probe] 主窗口: ${win.url()}`);

    await win.getByRole('button', { name: '新建会话' }).last().waitFor({ timeout: 30000 }).catch(() => {});
    const cont = win.getByRole('button', { name: '继续', exact: true }).first();
    if (await cont.isVisible().catch(() => false)) await cont.click({ timeout: 5000 }).catch(() => {});

    // ---- 打开设置 ----
    async function openSettings() {
      if (await win.locator('[class*="navList"] button').first().isVisible().catch(() => false)) return;
      await win.keyboard.press('Escape').catch(() => {});
      await win.waitForTimeout(300);
      await win.getByRole('button', { name: /^(设置|账号菜单)$/ }).first().click({ timeout: 10000 }).catch(() => {});
      const mi = win.getByRole('menuitem', { name: '设置' });
      if (await mi.count().catch(() => 0)) await mi.first().click({ timeout: 5000 }).catch(() => {});
      await win.locator('[class*="navList"] button').first().waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
      await win.waitForTimeout(500);
    }
    async function openTab(name) {
      await openSettings();
      await win.locator('[class*="navList"] button').filter({ hasText: name }).first().click();
      await win.waitForTimeout(800);
    }

    await openSettings();

    // ---- A. 通用设置页签结构清单 ----
    await openTab('通用设置');
    const dlgText = await win.evaluate(() => {
      const d = [...document.querySelectorAll('[role="dialog"]')].find(d => d.getBoundingClientRect().height > 200);
      return d ? d.innerText : '';
    });
    console.log('\n===== A. 通用设置 页签 innerText =====');
    console.log(dlgText.split('\n').map(s => s.trim()).filter(Boolean).join('\n'));

    const switches = await win.evaluate(() =>
      [...document.querySelectorAll('[role="switch"], button[aria-pressed]')].map(el => ({
        tag: el.getAttribute('role') || 'button[pressed]',
        text: (el.innerText || el.getAttribute('aria-label') || '').trim().slice(0, 50),
        state: el.getAttribute('aria-checked') ?? el.getAttribute('aria-pressed'),
      })).filter(s => s.text));
    console.log('\n===== B. 开关控件（role=switch / aria-pressed）=====');
    switches.forEach(s => console.log(`  [${s.tag}] "${s.text}" = ${s.state}`));

    const selectors = await win.evaluate(() =>
      [...document.querySelectorAll('[role="dialog"] button[aria-haspopup]')].map(el => ({
        pop: el.getAttribute('aria-haspopup'),
        text: (el.innerText || '').trim().slice(0, 40),
      })).filter(s => s.text));
    console.log('\n===== C. 下拉选择器（aria-haspopup）=====');
    selectors.forEach(s => console.log(`  (${s.pop}) "${s.text}"`));

    // ---- D. 主题：点击前后都看 body/html/container 三层 ----
    const readThemeState = () => win.evaluate(() => {
      const g = (el) => el ? getComputedStyle(el).backgroundColor : 'n/a';
      const app = document.querySelector('#app, #root, [id*="app"], [class*="appShell"], body');
      return {
        bodyBg: g(document.body),
        htmlClass: document.documentElement.className,
        htmlDataTheme: document.documentElement.getAttribute('data-theme') || '',
        htmlStyleBg: getComputedStyle(document.documentElement).backgroundColor,
        containerBg: g(app),
        containerTag: app ? `${app.tagName}.${String(app.className).slice(0, 60)}` : 'n/a',
        darkReader: !!document.querySelector('meta[name="color-scheme"]'),
        colorScheme: getComputedStyle(document.documentElement).colorScheme,
      };
    });
    console.log('\n===== D. 主题切换实测 =====');
    console.log('  初始:', JSON.stringify(await readThemeState(), null, 2).replace(/\n/g, '\n  '));

    async function clickTheme(name) {
      const btn = win.locator('button').filter({ hasText: new RegExp(`^\\s*${name}\\s*$`) }).first();
      await btn.waitFor({ state: 'visible', timeout: 10000 });
      await btn.click();
      await win.waitForTimeout(1000);
    }
    for (const t of ['深色', '浅色', '跟随系统']) {
      const before = await readThemeState();
      await clickTheme(t);
      const after = await readThemeState();
      console.log(`  → 点「${t}」后: body亮度=${lumOf(after.bodyBg)} htmlClass="${after.htmlClass}" dataTheme="${after.htmlDataTheme}" colorScheme=${after.colorScheme} container亮度=${lumOf(after.containerBg)}`);
      console.log(`     变化字段: ${Object.keys(before).filter(k => JSON.stringify(before[k]) !== JSON.stringify(after[k])).join(', ') || '(无)'}`);
    }

    // ---- E. 字号 ----
    console.log('\n===== E. 字号控件实测 =====');
    const readFont = () => win.evaluate(() => {
      const raw = document.body.style.getPropertyValue('--dsh-content-font-size')
        || getComputedStyle(document.body).getPropertyValue('--dsh-content-font-size');
      const probe = document.querySelector('[class*="transcript"], [class*="composer"], main, body');
      return { cssVar: raw || '(无)', computed: probe ? getComputedStyle(probe).fontSize : 'n/a' };
    });
    console.log('  初始:', JSON.stringify(await readFont()));
    const inc = win.getByRole('button', { name: '增大字号' });
    for (let i = 0; i < 3; i++) {
      if (!(await inc.isVisible().catch(() => false))) { console.log('  「增大字号」按钮不可见!'); break; }
      await inc.click();
      await win.waitForTimeout(700);
      console.log(`  增大#${i + 1}:`, JSON.stringify(await readFont()));
    }
    const dec = win.getByRole('button', { name: '减小字号' });
    if (await dec.isVisible().catch(() => false)) {
      await dec.click();
      await win.waitForTimeout(700);
      console.log('  减小#1:', JSON.stringify(await readFont()));
    }

    // ---- F. 语言 ----
    console.log('\n===== F. 语言切换实测 =====');
    const langTrigger = win.locator('[role="dialog"] button').filter({ hasText: /^(中文|English)$/ }).first();
    console.log('  语言下拉触发器文本:', JSON.stringify(await langTrigger.innerText().catch(() => '(未找到)')));
    if (await langTrigger.isVisible().catch(() => false)) {
      await langTrigger.click();
      await win.waitForTimeout(500);
      const items = await win.locator('[role="menuitem"]').allInnerTexts();
      console.log('  菜单项:', JSON.stringify(items));
      await win.keyboard.press('Escape');
      await win.waitForTimeout(400);

      // 选 English，看 body 文本是否变化
      const textBefore = (await win.evaluate(() => document.body.innerText)).slice(0, 400);
      await langTrigger.click();
      await win.waitForTimeout(400);
      const en = win.locator('[role="menuitem"]').filter({ hasText: /^\s*English\s*$/ }).first();
      if (await en.isVisible().catch(() => false)) {
        await en.click();
        await win.waitForTimeout(2000);
        const textAfter = (await win.evaluate(() => document.body.innerText)).slice(0, 400);
        const htmlLang = await win.evaluate(() => document.documentElement.lang);
        console.log('  切 English 后 html@lang:', htmlLang);
        console.log('  切后文本头部:', JSON.stringify(textAfter.slice(0, 200)));
        console.log('  文本是否变化:', textBefore.slice(0, 200) !== textAfter.slice(0, 200) ? '有变化' : '无变化');
        // 恢复中文
        const trig2 = win.locator('[role="dialog"] button').filter({ hasText: /^(中文|English)$/ }).first();
        if (await trig2.isVisible().catch(() => false)) {
          await trig2.click();
          await win.waitForTimeout(400);
          await win.locator('[role="menuitem"]').filter({ hasText: /^\s*(中文|Chinese)\s*$/ }).first().click().catch(() => {});
          await win.waitForTimeout(1500);
          console.log('  已恢复中文:', JSON.stringify(((await win.evaluate(() => document.body.innerText))).includes('新会话')));
        }
      } else {
        console.log('  (菜单里没有 English 项)');
        await win.keyboard.press('Escape');
      }
    }

    // ---- G. 模型页签（提供商编辑区结构） ----
    console.log('\n===== G. 设置-模型 页签结构 =====');
    await openTab('模型');
    const modelTabText = await win.evaluate(() => {
      const d = [...document.querySelectorAll('[role="dialog"]')].find(d => d.getBoundingClientRect().height > 200);
      return d ? d.innerText : '';
    });
    console.log(modelTabText.split('\n').map(s => s.trim()).filter(Boolean).join('\n'));
    const modelTabButtons = await win.evaluate(() =>
      [...document.querySelectorAll('[role="dialog"] button')]
        .filter(b => b.getBoundingClientRect().height > 0)
        .map(b => (b.innerText || b.getAttribute('aria-label') || '').trim())
        .filter(Boolean));
    console.log('  模型页签按钮:', JSON.stringify([...new Set(modelTabButtons)]));

    // ---- H. 模型目录（输入区下钻） ----
    console.log('\n===== H. 输入区模型目录实测 =====');
    await win.keyboard.press('Escape').catch(() => {});
    await win.waitForTimeout(500);
    const modelBtn = win.locator('button[class*="model"], button[aria-label*="模型"]').first();
    const anyModelBtn = (await modelBtn.count()) ? modelBtn : win.getByRole('button', { name: /模型/ }).first();
    console.log('  当前 trigger 文本:', JSON.stringify(await anyModelBtn.innerText().catch(() => '(未找到)')));
    await anyModelBtn.click().catch(() => {});
    await win.waitForTimeout(1000);
    const menuLines = await win.evaluate(() => {
      const lines = [];
      document.querySelectorAll('[role="menu"], [role="listbox"]').forEach(el => {
        if (el.offsetWidth || el.offsetHeight) (el.innerText || '').split('\n').forEach(l => lines.push(l.trim()));
      });
      return lines.filter(Boolean);
    });
    console.log('  模型菜单行:', JSON.stringify(menuLines));
    const sub = win.locator('[role="menuitem"]').filter({ hasText: /模型/ }).first();
    if (await sub.isVisible().catch(() => false)) {
      await sub.click();
      await win.waitForTimeout(1000);
      const radios = await win.locator('[role="menuitemradio"]').allInnerTexts();
      console.log('  目录 menuitemradio:', JSON.stringify(radios.map(r => r.trim()).filter(Boolean)));
    }
    await win.keyboard.press('Escape').catch(() => {});

  } finally {
    await app.close().catch(() => {});
  }
})().catch(e => { console.error('[probe] FAIL:', e.message); process.exit(1); });
