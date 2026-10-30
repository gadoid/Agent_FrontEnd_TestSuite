// @ts-check
/**
 * 探针：嵌套目录工作区在侧栏树中的真实渲染
 *
 * 场景（M9 工作区树语义验证的前置调查）：
 *   1. 建父目录 → workspace/create 加为工作区 P
 *   2. 在 P 内建子目录 → workspace/create 加为工作区 C
 *   3. 观察两种分组方式（按工作区 / 按工作区树）下侧栏树的 DOM 结构：
 *      行的 key/标题/aria-level/aria-expanded/DOM 祖先链/缩进。
 *
 * 只读探查 + 完整清理（删两个工作区、删临时目录、关服务）。
 * 用法：node scripts/probe-workspace-tree.js
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('@playwright/test');
const { startWebServer, stopWebServer } = require('../fixtures/web-server');
const { createWorkspace, deleteWorkspace } = require('../fixtures/workspace-api');
const { loadEnv } = require('../fixtures/env');

loadEnv();
const STATE_FILE = path.join(__dirname, '..', '.auth', 'dsh-state.json');
const STAMP = Date.now().toString(36);

/** 抓取侧栏工作区树的 DOM 结构快照 */
async function dumpTree(page, label) {
  const rows = await page.evaluate(() => {
    const tree = document.querySelector('div[role="tree"]');
    const out = [];
    for (const el of tree.querySelectorAll('div[role="treeitem"][data-row-key^="workspace:"]')) {
      // DOM 祖先链里最近的 treeitem 祖先（嵌套渲染时= 父工作区行）
      let anc = el.parentElement, ancKey = null, depth = 0;
      while (anc && anc !== tree) {
        if (anc.getAttribute && anc.getAttribute('data-row-key')) {
          if (!ancKey) ancKey = anc.getAttribute('data-row-key');
          depth += 1;
        }
        anc = anc.parentElement;
      }
      const cs = getComputedStyle(el);
      out.push({
        key: el.getAttribute('data-row-key'),
        title: (el.innerText || '').trim().slice(0, 40),
        level: el.getAttribute('aria-level'),
        expanded: el.getAttribute('aria-expanded'),
        domParentKey: ancKey,
        domDepth: depth,
        paddingLeft: cs.paddingLeft,
      });
    }
    return out;
  });
  console.log(`\n===== ${label} =====`);
  for (const r of rows) console.log(JSON.stringify(r));
  return rows;
}

(async () => {
  const info = await startWebServer();
  const browser = await chromium.launch();
  let ids = [];
  const dirs = [];
  try {
    const ctx = await browser.newContext({ storageState: fs.existsSync(STATE_FILE) ? STATE_FILE : undefined });
    const page = await ctx.newPage();
    await page.goto(info.url, { waitUntil: 'domcontentloaded' });
    await page.locator('div[role="treeitem"][data-row-key^="workspace:"]').first().waitFor({ timeout: 30000 });

    // 模态遮罩只拦真实指针不拦 evaluate —— JS 派发点击照常可用，无需摘除
    await page.waitForTimeout(1000);

    // 1) 父目录 → 工作区 P；2) P 内子目录 → 工作区 C
    const parentDir = fs.mkdtempSync(path.join(os.tmpdir(), `dsh-wstree-p-${STAMP}-`));
    const childDir = path.join(parentDir, `dsh-wstree-c-${STAMP}`);
    fs.mkdirSync(childDir, { recursive: true });
    dirs.push(parentDir); // 子目录随父目录一并删除

    const P = await createWorkspace(page, parentDir);
    const C = await createWorkspace(page, childDir);
    ids = [P.workspace.workspaceId, C.workspace.workspaceId];
    console.log('P =', JSON.stringify(P.workspace));
    console.log('C =', JSON.stringify(C.workspace));
    await page.waitForTimeout(1500);

    // 默认分组下的树
    const before = await dumpTree(page, '默认分组');

    // 切「按工作区树」再抓一次。模态遮罩会拦截 Playwright 的真实指针点击，
    // 探针改用 JS 派发点击（React 合成事件照常响应），完全绕开拦截。
    const jsClick = (selector, text) => page.evaluate(([sel, t]) => {
      const els = [...document.querySelectorAll(sel)];
      const el = t ? els.find(e => (e.textContent || '').trim() === t || (e.getAttribute('aria-label') || '') === t) : els[0];
      if (!el) throw new Error(`jsClick: 未找到 ${sel} ${t || ''}`);
      el.click();
    }, [selector, text]);
    await jsClick('button', '视图选项');
    await page.waitForTimeout(800);
    await jsClick('[role="menuitem"]', '按工作区树');
    await page.waitForTimeout(1200);
    const treeMode = await dumpTree(page, '按工作区树');

    // 找 P/C 两行的相对关系摘要
    const pick = (rows, t) => rows.find(r => r.title.includes(t));
    const p1 = pick(before, `dsh-wstree-p-${STAMP}`), c1 = pick(before, `dsh-wstree-c-${STAMP}`);
    const p2 = pick(treeMode, `dsh-wstree-p-${STAMP}`), c2 = pick(treeMode, `dsh-wstree-c-${STAMP}`);
    console.log('\n===== 摘要 =====');
    console.log('默认分组: P=', JSON.stringify(p1), '\n          C=', JSON.stringify(c1));
    console.log('按工作区树: P=', JSON.stringify(p2), '\n           C=', JSON.stringify(c2));

    await ctx.close();
  } finally {
    await browser.close();
    // RPC 兜底清理 + 临时目录
    if (ids.length) {
      const { request } = require('@playwright/test');
      const ctx = await request.newContext({ baseURL: info.url, storageState: STATE_FILE });
      // 服务已随 browser.close 后仍在跑；deleteWorkspace 需要 page.evaluate，改走独立 browser
      await ctx.dispose();
    }
    const b2 = await chromium.launch();
    try {
      const ctx2 = await b2.newContext({ storageState: fs.existsSync(STATE_FILE) ? STATE_FILE : undefined });
      const p2 = await ctx2.newPage();
      await p2.goto(info.url, { waitUntil: 'domcontentloaded' });
      await p2.waitForTimeout(1500);
      for (const id of ids) await deleteWorkspace(p2, id).catch((e) => console.warn('清理失败', id, e.message));
      await ctx2.close();
    } finally {
      await b2.close();
      for (const d of dirs) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} }
      if (!info.external) await stopWebServer();
    }
  }
})().catch((e) => { console.error(e); process.exitCode = 1; });
