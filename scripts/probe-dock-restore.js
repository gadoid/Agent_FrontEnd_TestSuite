// @ts-check
/**
 * 一次性探测（rc.7 dock 行为）：弄清「对话/轨迹」页签在 rc.7 如何出现。
 * 流程：新建会话 → 发一条消息等回复 → 展开右栏 → dump 页签 →
 *       逐个尝试可能的入口（统计条按钮/消息操作/菜单）→ 每次 dump。
 * 用法：node scripts/probe-dock-restore.js（跑前须退出 SparkSeed 桌面应用）
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
  const dump = async (page, tag) => {
    const info = await page.evaluate(() => {
      const tabs = [...document.querySelectorAll('[role="tab"]')]
        .filter(t => t.getBoundingClientRect().width > 0)
        .map(t => (t.innerText || '').trim().replace(/\n/g, '/'));
      const btns = [...document.querySelectorAll('button')]
        .filter(b => b.getBoundingClientRect().width > 0)
        .map(b => (b.getAttribute('aria-label') || b.innerText || '').trim().replace(/\n/g, '/'))
        .filter(t => /对话|轨迹|聊天|消息/.test(t));
      return { tabs, chatBtns: btns };
    });
    console.log(`[${tag}]`, JSON.stringify(info));
    return info;
  };

  try {
    let win = null;
    const deadline = Date.now() + 90000;
    while (Date.now() < deadline && !win) {
      win = app.windows().find(w => w.url().startsWith('dsh-app://')) || null;
      if (!win) await new Promise(r => setTimeout(r, 1000));
    }
    const page = win;
    await page.getByRole('button', { name: '新建会话' }).last().waitFor({ timeout: 30000 });
    await page.waitForTimeout(1000);

    await dump(page, '启动后');

    // 新会话 + 发消息
    await page.getByRole('button', { name: '新建会话' }).last().click();
    await page.waitForTimeout(800);
    const input = page.locator('[contenteditable="true"], textarea').last();
    await input.click();
    await input.pressSequentially('自动化测试，请只回复：收到', { delay: 10 });
    await input.press('Enter');
    await page.waitForTimeout(15000); // 等回复

    // 展开右栏
    const expandBtn = page.getByRole('button', { name: '打开右侧边栏' });
    if (await expandBtn.count()) { await expandBtn.first().click(); await page.waitForTimeout(1000); }
    await dump(page, '展开右栏后');

    // 尝试：点底部统计条按钮
    for (const name of [/1 轮|轮 .*步|步 ·/, /tok/, /上下文已用/]) {
      const b = page.getByRole('button', { name }).first();
      if (await b.isVisible().catch(() => false)) {
        await b.click({ timeout: 5000 }).catch(() => {});
        await page.waitForTimeout(1200);
        await dump(page, `点击统计条[${name}]后`);
        await page.keyboard.press('Escape').catch(() => {});
        await page.waitForTimeout(400);
      }
    }

    // 尝试：点会话头部「更多操作」菜单看有没有 视图/对话 项
    const more = page.getByRole('button', { name: '更多操作' }).first();
    if (await more.isVisible().catch(() => false)) {
      await more.click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(800);
      const menuItems = await page.locator('[role="menuitem"]').allInnerTexts().catch(() => []);
      console.log('[更多操作菜单]', JSON.stringify(menuItems.map(t => t.trim().split('\n')[0])));
      await page.keyboard.press('Escape');
      await page.waitForTimeout(400);
    }

    // 尝试：banner 区按钮（用 文件资源管理器 打开 / 更多打开方式 之间有无视图切换）
    const bannerBtns = await page.evaluate(() => {
      const banner = document.querySelector('banner, header, [class*="banner"]');
      return banner ? [...banner.querySelectorAll('button')].map(b => (b.getAttribute('aria-label') || b.innerText || '').trim()) : [];
    });
    console.log('[banner 按钮]', JSON.stringify(bannerBtns));

    // 最后再 dump 一次 localStorage 的 view 键
    const viewState = await page.evaluate(() => {
      const out = {};
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (/view|dock|layout/i.test(k)) out[k] = (localStorage.getItem(k) || '').slice(0, 300);
      }
      return out;
    });
    console.log('[localStorage]', JSON.stringify(viewState, null, 1));
  } finally {
    await app.close().catch(() => {});
    const { spawn } = require('child_process');
    const pid = (() => { try { return app.process().pid; } catch { return null; } })();
    if (pid) await new Promise(r => { const p = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' }); p.on('exit', r); p.on('error', r); });
  }
})();
