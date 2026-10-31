// @ts-check
/**
 * 2026-10-31 探针#4：settings/mutate 返回 200 但主题没应用 —— 看请求/响应体。
 *  - mutate 的 postData（写了什么路径什么值）
 *  - mutate 的响应体（200 里有没包业务错误）
 *  - 随后 describe 的响应体（服务端最终存了什么值）
 * 用法：node scripts/probe-rc8b-mutate-body.js（先彻底退出桌面应用）
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
  const app = await _electron.launch({ executablePath: 'D:/sparkseed/sparkseed.exe', cwd: RUNTIME_CWD, env: { ...process.env, ...llmEnv() }, timeout: 60000 });
  try {
    let win = null;
    const deadline = Date.now() + 90000;
    while (Date.now() < deadline && !win) {
      win = app.windows().find(w => w.url().startsWith('dsh-app://')) || null;
      if (!win) await new Promise(r => setTimeout(r, 1000));
    }
    await win.getByRole('button', { name: '新建会话' }).last().waitFor({ timeout: 30000 }).catch(() => {});

    await win.getByRole('button', { name: /^(设置|账号菜单)$/ }).first().click({ timeout: 10000 }).catch(() => {});
    const mi = win.getByRole('menuitem', { name: '设置' });
    if (await mi.count().catch(() => 0)) await mi.first().click({ timeout: 5000 }).catch(() => {});
    await win.locator('[class*="navList"] button').filter({ hasText: '通用设置' }).first().click({ timeout: 10000 }).catch(() => {});
    await win.waitForTimeout(1200);

    const grab = async (urlPart, label) => {
      const respPromise = win.waitForResponse(r => r.url().includes(urlPart) && r.request().method() === 'POST', { timeout: 15000 }).catch(() => null);
      const dark = win.locator('[role="dialog"] button').filter({ hasText: /^\s*深色\s*$/ }).filter({ visible: true }).first();
      await dark.click({ timeout: 8000 }).catch(() => {});
      const resp = await respPromise;
      if (!resp) { console.log(`${label}: 没等到响应`); return; }
      const req = resp.request();
      let post = req.postData();
      try { post = JSON.stringify(JSON.parse(post)); } catch { /* 原样 */ }
      let body = await resp.text().catch(() => '(读响应体失败)');
      try { body = JSON.stringify(JSON.parse(body)); } catch { /* 原样 */ }
      console.log(`${label} [${resp.status()}] ${resp.url().slice(0, 90)}`);
      console.log(`  请求: ${(post || '(空)').slice(0, 400)}`);
      console.log(`  响应: ${(body || '(空)').slice(0, 400)}`);
    };

    await grab('settings/mutate', 'mutate#1(深色)');
    await win.waitForTimeout(1500);
    await grab('settings/describe', 'describe#1');
    await win.waitForTimeout(800);

    // 复核：renderer 侧再读一次外观选中态与 html/body 状态
    const state = await win.evaluate(() => {
      const d = [...document.querySelectorAll('[role="dialog"]')].find(d => d.getBoundingClientRect().height > 200);
      const btns = d ? [...d.querySelectorAll('button')].filter(b => /^(浅色|深色|跟随系统)$/.test((b.innerText || '').trim())) : [];
      const cls = {};
      for (const b of btns) cls[b.innerText.trim()] = String(b.className).slice(0, 70);
      return {
        classes: cls,
        htmlClass: document.documentElement.className || '(空)',
        bodyClass: (document.body.className || '(空)').slice(0, 70),
        colorScheme: getComputedStyle(document.documentElement).colorScheme,
        bodyBg: getComputedStyle(document.body).backgroundColor,
        htmlBg: getComputedStyle(document.documentElement).backgroundColor,
        prefersDark: matchMedia('(prefers-color-scheme: dark)').matches,
      };
    });
    console.log('\nrenderer 终态:', JSON.stringify(state, null, 1));
  } finally {
    await app.close().catch(() => {});
  }
})().catch(e => { console.error('[probe4] FAIL:', e); process.exit(1); });
