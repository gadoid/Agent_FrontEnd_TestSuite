// @ts-check
/**
 * 2026-10-31 探针#6：会话行 hover 预览卡（Rx-Pca_hoverContent）的关闭条件 —— 给 M9-08A 找可行解。
 *  m1 阶梯移动(steps)到目标  m2 Esc  m3 空白处单击  m4 二次 hover 后移开
 * 用法：node scripts/probe-rc8b-hover-dismiss.js（先彻底退出桌面应用）
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
    await win.getByRole('button', { name: '新建会话' }).last().click().catch(() => {});
    await win.waitForTimeout(1500);

    const cardState = () => win.evaluate(() => {
      const hc = document.querySelector('[class*="hoverContent"]');
      const ws = document.querySelector('button[aria-label="选择工作区"]');
      let covered = null;
      if (ws) {
        const r = ws.getBoundingClientRect();
        const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        covered = top ? !ws.contains(top) : null;
      }
      return { card: !!hc, covered };
    });
    const row = win.getByRole('treeitem').filter({ hasText: '自动化测试确认回复' }).first();
    if (!(await row.isVisible().catch(() => false))) { console.log('（无会话行，跳过）'); return; }

    const wsBtn = win.locator('button[aria-label="选择工作区"]').first();
    const wsBox = await wsBtn.boundingBox().catch(() => null);

    await row.hover();
    await win.waitForTimeout(1000);
    console.log('hover 后:', JSON.stringify(await cardState()));

    if (wsBox) {
      const cx = wsBox.x + wsBox.width / 2, cy = wsBox.y + wsBox.height / 2;
      console.log('m1 阶梯移动到按钮中心:');
      await win.mouse.move(cx, cy, { steps: 15 });
      await win.waitForTimeout(800);
      console.log('  ', JSON.stringify(await cardState()));

      console.log('m2 Esc:');
      await win.keyboard.press('Escape');
      await win.waitForTimeout(600);
      console.log('  ', JSON.stringify(await cardState()));

      console.log('m3 空白处单击:');
      await win.mouse.click(cx + 260, cy - 200).catch(() => {});
      await win.waitForTimeout(800);
      console.log('  ', JSON.stringify(await cardState()));

      console.log('m4 二次 hover 行 → 再移开:');
      await row.hover();
      await win.waitForTimeout(600);
      await win.mouse.move(cx, cy, { steps: 15 });
      await win.waitForTimeout(800);
      console.log('  ', JSON.stringify(await cardState()));

      console.log('最终点击尝试:');
      const ok = await wsBtn.click({ timeout: 4000 }).then(() => true).catch(() => false);
      console.log('   点击', ok ? '成功' : '仍被拦截');
    } else {
      console.log('（无 选择工作区 按钮）');
    }
  } finally {
    await app.close().catch(() => {});
  }
})().catch(e => { console.error('[probe6] FAIL:', e); process.exit(1); });
