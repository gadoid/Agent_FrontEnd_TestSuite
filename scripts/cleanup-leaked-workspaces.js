// @ts-check
/**
 * 清理测试残留的工作区（用例被硬超时中断时，用例体内的 finally 兜底清理不会执行）。
 *
 * 用法：node scripts/cleanup-leaked-workspaces.js [标题匹配正则]
 *   默认 ^dsh-(m8-09|ws)：M8-09 的 dsh-m8-09-* 与 M9 的 dsh-ws-<stamp>-* 临时目录名。
 *
 * 流程：复用 fixtures/web-server 拉起 `dsh web` → 用 .auth/dsh-state.json 登录态打开应用
 *   → 从工作区树行（data-row-key="workspace:<uuid>"）取 标题→id 映射 → 逐个 RPC 删除
 *   → 顺带清掉 %TEMP% 里残留的 dsh-m8-09-* / dsh-ws-* 临时目录 → 关闭服务。
 * 全程只走 RPC（模态遮罩不拦截 page.evaluate），无需碰 UI。
 * 注意：不要在有测试正在跑的时候执行（会误删在用工作区/临时目录）。
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('@playwright/test');
const { startWebServer, stopWebServer, readServerInfo } = require('../fixtures/web-server');
const { deleteWorkspace } = require('../fixtures/workspace-api');
const { loadEnv } = require('../fixtures/env');

loadEnv();

const PATTERN = new RegExp(process.argv[2] || '^dsh-(m8-09|ws)');
const STATE_FILE = path.join(__dirname, '..', '.auth', 'dsh-state.json');

(async () => {
  const info = await startWebServer();
  const external = !!info.external;
  const browser = await chromium.launch();

  try {
    const ctx = await browser.newContext({
      storageState: fs.existsSync(STATE_FILE) ? STATE_FILE : undefined,
    });
    const page = await ctx.newPage();
    await page.goto(info.url, { waitUntil: 'domcontentloaded' });
    // 等工作区树渲染（模态遮罩不影响树挂载，更不影响 evaluate）
    await page.locator('div[role="treeitem"][data-row-key^="workspace:"]')
      .first().waitFor({ timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(1000);

    // 标题 → id（树行 data-row-key = workspace:<uuid>；同标题取第一个）
    const map = await page.evaluate(() => {
      const titles = {};
      for (const el of document.querySelectorAll('div[role="treeitem"][data-row-key^="workspace:"]')) {
        const id = (el.getAttribute('data-row-key') || '').slice('workspace:'.length);
        const title = (el.innerText || '').trim();
        if (id && title && !(title in titles)) titles[title] = id;
      }
      return titles;
    });

    const victims = Object.keys(map).filter((t) => PATTERN.test(t));
    console.log(`[cleanup] 树中工作区 ${Object.keys(map).length} 个，命中 /${PATTERN.source}/：${victims.join(', ') || '(无)'}`);
    for (const title of victims) {
      try {
        await deleteWorkspace(page, map[title]);
        console.log(`[cleanup] 已删除工作区: ${title}`);
      } catch (e) {
        console.warn(`[cleanup] 删除失败 ${title}: ${e.message}`);
      }
    }

    // 顺带清掉残留临时目录（工作区采用过的文件夹）
    for (const dir of fs.readdirSync(os.tmpdir())) {
      if (/^dsh-(m8-09|ws)-/.test(dir)) {
        try {
          fs.rmSync(path.join(os.tmpdir(), dir), { recursive: true, force: true });
          console.log(`[cleanup] 已删除临时目录: ${dir}`);
        } catch { /* 占用中，跳过 */ }
      }
    }
    await ctx.close();
  } finally {
    await browser.close();
    if (!external) await stopWebServer();
  }
})().catch((e) => { console.error(e); process.exitCode = 1; });
