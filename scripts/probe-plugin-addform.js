// @ts-check
/**
 * 一次性探测：复现 12-plugin-capabilities 的 beforeEach 路径（openApp → plugins.open →
 * 点「添加插件」），确认安装表单在测试路径下是否渲染、输入框 placeholder 是什么。
 * 用法：node scripts/probe-plugin-addform.js
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
    const page = win;
    await page.getByRole('button', { name: '新建会话' }).last().waitFor({ timeout: 30000 }).catch(() => {});
    const cont = page.getByRole('button', { name: '继续', exact: true }).first();
    if (await cont.isVisible().catch(() => false)) { await cont.click().catch(() => {}); await page.waitForTimeout(1000); }

    // plugins.open() 同款
    await page.getByRole('button', { name: '插件', exact: true }).click();
    await page.locator('button[aria-label^="查看 "]').first().waitFor({ state: 'visible', timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(800);

    // openAddPluginForm() 同款
    const addBtn = page.getByRole('button', { name: '添加插件', exact: true });
    console.log('[probe] 添加插件按钮 count=', await addBtn.count(), 'visible=', await addBtn.first().isVisible().catch(() => false));
    await addBtn.first().click();
    await page.waitForTimeout(800);
    for (let i = 0; i < 8; i++) {
      const n = await page.locator('input[placeholder="包名或地址"]').count();
      if (n) break;
      await page.waitForTimeout(1000);
    }
    console.log('[probe] 包名或地址输入框 count=', await page.locator('input[placeholder="包名或地址"]').count());
    console.log('[probe] 全部 input/textarea:');
    console.log(await page.evaluate(() =>
      [...document.querySelectorAll('input,textarea')].map(e =>
        `${e.tagName}[type=${e.type}] placeholder=${e.placeholder} visible=${!!(e.offsetWidth || e.offsetHeight)}`).join('\n')));
    const body = await page.evaluate(() => document.body.innerText);
    console.log('[probe] 正文含「输入插件的包名」:', body.includes('输入插件的包名'));
    console.log('[probe] 正文含「插件安装引导和示例」:', body.includes('插件安装引导和示例'));
    console.log('[probe] 正文含「安装源」:', body.includes('安装源'));
    console.log('--- 插件页局部文本 ---');
    console.log(body.slice(body.indexOf('安装、启用和配置插件'), body.indexOf('安装、启用和配置插件') + 900).replace(/\n{2,}/g, '\n'));
  } finally {
    await app.close().catch(() => {});
  }
})().catch(e => { console.error('[probe] FAIL:', e); process.exit(1); });
