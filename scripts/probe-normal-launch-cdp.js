// @ts-check
/**
 * 复核探测 #8：正常方式启动（仅挂 --remote-debugging-port）+ CDP 连接，
 * 验证运行时主题/字号/语言切换在「真实使用环境」里是否生效。
 * 用法：node scripts/probe-normal-launch-cdp.js
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');
const { loadEnv } = require('../fixtures/env');

loadEnv();

const lumOf = (rgb) => {
  const m = (rgb || '').match(/\d+/g) || ['0', '0', '0'];
  return Math.round((+m[0] * 299 + +m[1] * 587 + +m[2] * 114) / 1000);
};

(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  try {
    const ctx = browser.contexts()[0];
    let page = null;
    for (const p of ctx.pages()) {
      if (p.url().startsWith('dsh-app://')) { page = p; break; }
    }
    if (!page) throw new Error('未找到 dsh-app:// 页面: ' + ctx.pages().map(p => p.url()).join(', '));
    console.log('[probe8] 页面:', page.url());

    await page.getByRole('button', { name: '新建会话' }).last().waitFor({ timeout: 30000 }).catch(() => {});
    const cont = page.getByRole('button', { name: '继续', exact: true }).first();
    if (await cont.isVisible().catch(() => false)) await cont.click({ timeout: 5000 }).catch(() => {});

    await page.getByRole('button', { name: /^(设置|账号菜单)$/ }).first().click({ timeout: 10000 }).catch(() => {});
    const mi = page.getByRole('menuitem', { name: '设置' });
    if (await mi.count().catch(() => 0)) await mi.first().click({ timeout: 5000 }).catch(() => {});
    await page.locator('[class*="navList"] button').first().waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
    await page.locator('[class*="navList"] button').filter({ hasText: '通用设置' }).first().click();
    await page.waitForTimeout(1000);

    const read = () => page.evaluate(() => {
      const d = [...document.querySelectorAll('[role="dialog"]')].find(d => d.getBoundingClientRect().height > 200);
      const btn = d && [...d.querySelectorAll('button')].find(b => /^(浅色|深色|跟随系统)$/.test((b.innerText || '').trim()) && /selected/.test(String(b.className)));
      const rgb = getComputedStyle(document.body).backgroundColor.match(/\d+/g) || ['0', '0', '0'];
      const font = document.body.style.getPropertyValue('--dsh-content-font-size')
        || getComputedStyle(document.body).getPropertyValue('--dsh-content-font-size');
      const num = d ? ((d.innerText || '').match(/字号大小[\s\S]{0,40}?(\d+)\s*px/) || [])[1] : null;
      return { selected: btn ? btn.innerText.trim() : '(none)', lum: Math.round((+rgb[0] * 299 + +rgb[1] * 587 + +rgb[2] * 114) / 1000), font, num };
    });
    const clickTheme = async (name) => {
      const b = page.locator('[role="dialog"] button').filter({ hasText: new RegExp(`^\\s*${name}\\s*$`) }).filter({ visible: true }).first();
      await b.click({ timeout: 8000 });
      await page.waitForTimeout(1500);
    };

    console.log('初始:', JSON.stringify(await read()));
    await clickTheme('浅色');
    console.log('点 浅色:', JSON.stringify(await read()));
    await clickTheme('深色');
    console.log('点 深色:', JSON.stringify(await read()));

    // 字号
    const inc = page.getByRole('button', { name: '增大字号' });
    if (await inc.isVisible().catch(() => false)) {
      await inc.click({ timeout: 8000 });
      await page.waitForTimeout(1000);
      console.log('增大字号:', JSON.stringify(await read()));
      const dec = page.getByRole('button', { name: '减小字号' });
      await dec.click({ timeout: 8000 });
      await page.waitForTimeout(1000);
      console.log('减小字号(复原):', JSON.stringify(await read()));
    }

    // 语言
    const trig = () => page.locator('[role="dialog"] button').filter({ hasText: /^(中文|English)$/ }).filter({ visible: true }).first();
    await trig().click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(500);
    await page.locator('[role="menuitem"]').filter({ hasText: /^\s*English\s*$/ }).first().click().catch(() => {});
    await page.waitForTimeout(2000);
    console.log('选 English 后 trigger:', JSON.stringify(await trig().innerText().catch(() => '(x)')),
      '含 New chat:', (await page.evaluate(() => document.body.innerText)).includes('New chat'));
    await trig().click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(500);
    await page.locator('[role="menuitem"]').filter({ hasText: /^\s*中文\s*$/ }).first().click().catch(() => {});
    await page.waitForTimeout(1500);
    console.log('恢复中文:', (await page.evaluate(() => document.body.innerText)).includes('新会话'));
  } finally {
    await browser.close().catch(() => {});  // 只断开 CDP，不关应用
  }
})().catch(e => { console.error('[probe8] FAIL:', e.message); process.exit(1); });
