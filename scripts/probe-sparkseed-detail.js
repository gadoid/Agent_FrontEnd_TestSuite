// @ts-check
/**
 * 一次性探测（SparkSeed rc.7 迁移基线·第二批）：
 *   1. 侧栏插件页 → 各插件详情页 DOM（innerText + 全部按钮 aria-label + data-slot）
 *   2. 输入区模型菜单下钻（menuitemradio 清单 = 模型目录真值，供 MODEL_CATALOG 重基线）
 *   3. 设置 → 模型 → 编辑卡片全文（provider 目录真值）
 * 结果写 .runtime/probe-sparkseed-detail.json。
 * 用法：node scripts/probe-sparkseed-detail.js（跑前须退出 SparkSeed 桌面应用）
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { _electron } = require('@playwright/test');
const { loadEnv, llmEnv, readEnv } = require('../fixtures/env');

loadEnv();

(async () => {
  const RUNTIME_CWD = path.join(os.tmpdir(), 'dsh-e2e-cwd');
  fs.mkdirSync(RUNTIME_CWD, { recursive: true });
  const app = await _electron.launch({
    executablePath: readEnv('E2E_DSH_EXE') || 'D:/sparkseed/sparkseed.exe',
    cwd: RUNTIME_CWD,
    env: { ...process.env, ...llmEnv() },
    timeout: 60000,
  });
  const out = {};
  const section = async (name, fn) => {
    try { out[name] = await fn(); console.log(`[probe] ${name}: OK`); }
    catch (e) { out[name] = { error: e.message.split('\n')[0] }; console.log(`[probe] ${name}: FAIL ${e.message.split('\n')[0]}`); }
  };

  try {
    let win = null;
    const deadline = Date.now() + 90000;
    while (Date.now() < deadline && !win) {
      win = app.windows().find(w => w.url().startsWith('dsh-app://')) || null;
      if (!win) await new Promise(r => setTimeout(r, 1000));
    }
    if (!win) throw new Error('未等到 dsh-app:// 主窗口');
    const page = win;
    await page.getByRole('button', { name: '新建会话' }).last().waitFor({ timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(1500);

    // —— 1. 插件详情页 DOM
    await section('pluginDetails', async () => {
      await page.getByRole('button', { name: '插件', exact: true }).click({ timeout: 10000 });
      await page.waitForTimeout(1500);
      const names = (await page.locator('button[aria-label^="查看 "]').allInnerTexts())
        .map(t => t.trim()).filter(Boolean);
      const labels = await page.locator('button[aria-label^="查看 "]').evaluateAll(
        els => els.map(e => e.getAttribute('aria-label')));
      const details = [];
      for (let i = 0; i < Math.min(names.length, 5); i++) {
        await page.locator('button[aria-label^="查看 "]').nth(i).click();
        await page.waitForTimeout(1500);
        const info = {
          plugin: labels[i],
          text: (await page.evaluate(() => document.body.innerText)).slice(0, 3000),
          buttons: await page.locator('button').evaluateAll(els =>
            els.map(e => e.getAttribute('aria-label') || e.innerText?.trim()).filter(Boolean).slice(0, 60)),
          slots: await page.evaluate(() =>
            [...document.querySelectorAll('[data-slot]')].map(e => e.getAttribute('data-slot'))
              .filter((v, idx, a) => a.indexOf(v) === idx).slice(0, 60)),
        };
        details.push(info);
        const back = page.getByRole('button', { name: /返回插件列表/ }).first();
        if (await back.isVisible().catch(() => false)) { await back.click(); await page.waitForTimeout(1000); }
        else await page.keyboard.press('Escape');
        await page.waitForTimeout(600);
      }
      return { count: names.length, names, details };
    });

    // —— 2. 模型目录（输入区菜单下钻）
    await section('modelCatalog', async () => {
      // 回首页（新建会话按钮可见即输入区在）
      await page.getByRole('button', { name: '新建会话' }).last().click({ timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(800);
      const trigger = page.locator('button[aria-haspopup="menu"]').filter({ hasText: /模型|deepseek|glm|sparkseed/i }).first();
      await trigger.click({ timeout: 10000 });
      await page.waitForTimeout(800);
      // 下钻「模型」子菜单
      const sub = page.locator('[role="menuitem"]').filter({ hasText: /模型/ }).first();
      if (await sub.isVisible().catch(() => false)) { await sub.click(); await page.waitForTimeout(1000); }
      const rows = await page.locator('[role="menuitemradio"]').evaluateAll(els =>
        els.map(e => (e.innerText || '').trim()).filter(Boolean));
      const menuText = await page.evaluate(() => {
        const m = [...document.querySelectorAll('[role="menu"]')].pop();
        return m ? (m.innerText || '').slice(0, 2000) : '';
      });
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
      await page.keyboard.press('Escape');
      return { rows, menuText };
    });

    // —— 3. 设置 → 模型 → 编辑卡片
    await section('providerCard', async () => {
      await page.keyboard.press('Escape').catch(() => {});
      await page.getByRole('button', { name: /^(设置|账号菜单)$/ }).first().click({ timeout: 10000 });
      const mi = page.getByRole('menuitem', { name: '设置' });
      if (await mi.count().catch(() => 0)) await mi.first().click({ timeout: 5000 });
      await page.locator('[class*="navList"] button').first().waitFor({ state: 'visible', timeout: 10000 });
      await page.locator('[class*="navList"] button').filter({ hasText: '模型' }).first().click();
      await page.waitForTimeout(1000);
      const modelTabText = await page.evaluate(() => {
        const d = [...document.querySelectorAll('[role="dialog"]')].pop();
        return d ? (d.innerText || '').slice(0, 3000) : '';
      });
      const editBtns = await page.locator('[role="dialog"] button').evaluateAll(els =>
        els.map(e => (e.getAttribute('aria-label') || e.innerText || '').trim())
          .filter(t => /编辑|添加/.test(t)));
      // 点首个「编辑」
      const edit = page.locator('[role="dialog"] button').filter({ hasText: /^编辑$|^编辑$/ }).first();
      const editByLabel = page.locator('[role="dialog"] button[aria-label^="编辑"]').first();
      const target = (await editByLabel.count()) ? editByLabel : edit;
      let cardText = '';
      if (await target.count()) {
        await target.click({ timeout: 5000 }).catch(() => {});
        await page.waitForTimeout(1000);
        cardText = await page.evaluate(() => {
          const d = [...document.querySelectorAll('[role="dialog"]')].find(d => d.getBoundingClientRect().height > 200);
          return d ? (d.innerText || '').slice(0, 3000) : '';
        });
      }
      await page.keyboard.press('Escape');
      return { modelTabText, editBtns, cardText };
    });
  } finally {
    const file = path.join(__dirname, '..', '.runtime', 'probe-sparkseed-detail.json');
    fs.writeFileSync(file, JSON.stringify(out, null, 2));
    console.log(`[probe] 结果已写入 ${file}`);
    await app.close().catch(() => {});
    const { spawn } = require('child_process');
    const pid = (() => { try { return app.process().pid; } catch { return null; } })();
    if (pid) await new Promise(r => { const p = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' }); p.on('exit', r); p.on('error', r); });
  }
})();
