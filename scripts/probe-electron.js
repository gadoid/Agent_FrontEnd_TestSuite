// @ts-check
/**
 * 官方版桌面形态探针（Phase 0.5）：验证 Playwright `_electron.launch` 能否接管官方版。
 *
 * 这是迁移里最大的未知——官方版是标准 electron-builder 包、fuse 偏宽松（RunAsNode /
 * EnableNodeCliInspectArguments 均为 1），理论上可行但未实测。
 * 本脚本同时验证：
 *   - 中性 cwd 是否让官方版避开「读项目根 .env → 命中 DSH_ 前缀 → 抛错退出」
 *   - 拿到的是主窗口（dsh-app://）还是 onboarding/welcome 窗口（file:)
 *
 * 前提：无桌面实例在跑（官方版有硬性单实例锁，19387 须空闲）。
 * 用法：node scripts/probe-electron.js
 */
const { _electron } = require('@playwright/test');
const fs = require('fs');
const os = require('os');
const path = require('path');

const EXE = process.env.DSH_ELECTRON_PATH
  || path.join(process.env.LOCALAPPDATA || '', 'Programs', 'DeepSeek Harness', 'DeepSeek Harness.exe');

/** 中性 cwd：避免官方版读项目根 .env（命中 DSH_ 前缀会让它启动即抛错） */
const RUNTIME_CWD = path.join(os.tmpdir(), 'dsh-e2e-cwd');

(async () => {
  fs.mkdirSync(RUNTIME_CWD, { recursive: true });
  console.log(`exe: ${EXE}`);
  console.log(`cwd: ${RUNTIME_CWD}`);
  console.log(`exists: ${fs.existsSync(EXE)}`);

  const app = await _electron.launch({
    executablePath: EXE.replace(/\\/g, '/'),
    cwd: RUNTIME_CWD,
    timeout: 60000,
  });
  console.log(`已启动，pid=${app.process().pid}`);

  // 等 2s 看进程是否当场退出（单实例锁被占 / .env 冲突都会这样）
  await new Promise(r => setTimeout(r, 2000));
  if (app.process().exitCode !== null) {
    console.error(`!! 进程启动后立即退出，exitCode=${app.process().exitCode}`);
    process.exit(2);
  }

  // 收集窗口（含后开的）
  const seen = new Set();
  app.on('window', w => console.log(`[window 事件] ${w.url()}`));
  const deadline = Date.now() + 60000;
  let main = null;
  while (Date.now() < deadline && !main) {
    for (const w of app.windows()) {
      const u = w.url();
      if (!seen.has(u)) { seen.add(u); console.log(`[窗口] ${u}`); }
      if (u.startsWith('dsh-app://')) main = w;
    }
    if (!main) await new Promise(r => setTimeout(r, 1500));
  }

  if (!main) {
    console.error('!! 60s 内未出现 dsh-app:// 主窗口。已见窗口:');
    for (const w of app.windows()) console.error(`   ${w.url()} | title=${await w.title().catch(() => '?')}`);
  } else {
    console.log(`\n主窗口: ${main.url()}`);
    console.log(`title: ${await main.title()}`);
    await main.waitForTimeout(3000);

    const info = await main.evaluate(() => ({
      slots: [...document.querySelectorAll('[data-slot]')].map(e => e.getAttribute('data-slot')).slice(0, 6),
      newSessionBtns: document.querySelectorAll('button[aria-label="新建会话"]').length,
      hasDialog: !!document.querySelector('[role="dialog"]'),
      dialogText: ((document.querySelector('[role="dialog"]') || {}).innerText || '').replace(/\s+/g, ' ').slice(0, 120),
      bodyHead: (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 200),
    }));
    console.log('DOM:', JSON.stringify(info, null, 1));
    await main.screenshot({ path: path.join(os.tmpdir(), 'probe-electron.png') });
    console.log(`截图: ${path.join(os.tmpdir(), 'probe-electron.png')}`);
  }

  // 关闭
  await Promise.race([app.close(), new Promise(r => setTimeout(r, 15000))]).catch(() => {});
  try { if (app.process().exitCode === null) app.process().kill('SIGKILL'); } catch {}
  console.log('已关闭');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
