// @ts-check
/**
 * 一次性探测：以 electron 夹具同款方式（中性 cwd + llmEnv 注入）拉起 eline，
 * 读取侧栏插件页的清单加载情况，用于排查「测试拉起的实例插件市场/清单未加载」。
 * 用法：node scripts/probe-plugin-launch.js
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
  console.log(`[probe] cwd=${RUNTIME_CWD}  DEEPSEEK_API_KEY=${llmEnv().DEEPSEEK_API_KEY ? '已注入' : '未注入'}`);

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
    if (!win) throw new Error('未等到 dsh-app:// 主窗口: ' + app.windows().map(w => w.url()).join(', ') || '(无)');
    console.log(`[probe] 主窗口: ${win.url()}`);

    await win.getByRole('button', { name: '新建会话' }).last().waitFor({ timeout: 30000 }).catch(() => {});
    const cont = win.getByRole('button', { name: '继续', exact: true }).first();
    if (await cont.isVisible().catch(() => false)) await cont.click({ timeout: 5000 }).catch(() => {});

    await win.getByRole('button', { name: '插件', exact: true }).click();
    await win.locator('button[aria-label^="查看 "]').first()
      .waitFor({ state: 'visible', timeout: 20000 }).catch(() => {});
    await win.waitForTimeout(1500);

    const names = await win.evaluate(() =>
      [...document.querySelectorAll('button[aria-label^="查看 "]')]
        .map(b => b.getAttribute('aria-label').replace(/^查看\s+/, '').trim()));
    const items = await win.evaluate(() => document.querySelectorAll('[data-slot="plugins.item"]').length);
    const toolbar = {};
    for (const label of ['刷新', '添加插件', '插件说明']) {
      toolbar[label] = await win.getByRole('button', { name: label, exact: true }).isVisible().catch(() => false);
    }
    console.log(`[probe] 插件行(${names.length}): ${names.join(', ') || '(空)'}`);
    console.log(`[probe] 分组说明项(data-slot=plugins.item): ${items}`);
    console.log(`[probe] 工具栏: ${JSON.stringify(toolbar)}`);
    console.log(names.length > 0 ? '[probe] 结论: 测试同款启动方式下插件清单正常加载' : '[probe] 结论: 插件清单为空，测试启动方式存在差异，需进一步排查');
  } finally {
    await app.close().catch(() => {});
  }
})().catch(e => { console.error('[probe] FAIL:', e.message); process.exit(1); });
