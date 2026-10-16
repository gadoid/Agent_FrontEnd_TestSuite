// @ts-check
/**
 * 官方版 DeepSeek Harness 选择器取证探针（一次性，迁移用）
 *
 * 背景：官方版前端改为插件化 i18n 词典（95 个 dsh-client-ui-* 包），词典只能证明
 * 文案存在，**不能证明挂在哪个 DOM 节点、什么角色、是否可见**。本脚本起真机把
 * 关键结构的可访问性信息 dump 出来，作为改 pages/ 的唯一依据。
 *
 * 用法（需先自行起服务）：
 *   node scripts/probe-official.js http://127.0.0.1:3180
 */
const { chromium } = require('@playwright/test');
const { buildStorageState } = require('../fixtures/dsh-credentials');

const URL_ = process.argv[2] || 'http://127.0.0.1:3180';

/** 把一个容器内的可交互元素连同关键属性 dump 出来 */
async function dumpInteractive(page, rootSelector, label, limit = 40) {
  const out = await page.evaluate(({ sel, lim }) => {
    const root = sel ? document.querySelector(sel) : document.body;
    if (!root) return { error: `未找到容器: ${sel}` };
    const nodes = root.querySelectorAll(
      'button, [role="button"], [role="treeitem"], [role="menuitem"], [role="tab"], ' +
      '[role="option"], [role="textbox"], input, a[href], [aria-haspopup]'
    );
    const ATTRS = ['role', 'aria-label', 'aria-haspopup', 'aria-expanded', 'aria-selected',
      'aria-current', 'aria-labelledby', 'data-testid', 'data-row-key', 'data-chat-flow-kind',
      'data-variant', 'placeholder', 'title'];
    const items = [];
    for (const el of nodes) {
      if (items.length >= lim) break;
      const attrs = {};
      for (const a of ATTRS) {
        const v = el.getAttribute(a);
        if (v !== null) attrs[a] = v.length > 60 ? v.slice(0, 60) + '…' : v;
      }
      const dataKeys = [];
      for (const a of el.getAttributeNames()) if (a.startsWith('data-')) dataKeys.push(a);
      const styles = getComputedStyle(el);
      items.push({
        tag: el.tagName.toLowerCase(),
        text: (el.innerText || el.value || '').replace(/\s+/g, ' ').trim().slice(0, 48),
        attrs,
        dataAttrs: dataKeys.slice(0, 8),
        visible: !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length),
        disabled: el.disabled === true || el.getAttribute('aria-disabled') === 'true',
        cls: styles && (el.className || '').toString().slice(0, 70),
      });
    }
    return { total: nodes.length, shown: items.length, items };
  }, { sel: rootSelector, lim: limit });
  console.log(`\n===== ${label}  (root: ${rootSelector || 'body'}) =====`);
  console.log(JSON.stringify(out, null, 1));
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    storageState: buildStorageState({ url: URL_ }),
    locale: 'zh-CN',
    viewport: { width: 1440, height: 900 },
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  await page.goto(URL_, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(8000);

  console.log('===== 概览 =====');
  console.log(JSON.stringify({
    title: await page.title(),
    url: page.url(),
  }, null, 1));

  // 侧边栏：官方版结构由 data-slot 标注（实测 [data-slot="sidebar"] / [data-slot="root"]）
  await dumpInteractive(page, '[data-slot="sidebar"]', '侧边栏', 50);
  await dumpInteractive(page, 'body', '全页可交互元素（前 60）', 60);

  // 工作区/会话树
  const treeInfo = await page.evaluate(() => {
    const trees = [...document.querySelectorAll('[role="tree"], [role="group"]')];
    return trees.slice(0, 4).map(t => ({
      role: t.getAttribute('role'),
      ariaLabel: t.getAttribute('aria-label'),
      children: t.querySelectorAll(':scope > *').length,
    }));
  });
  console.log('\n===== tree 容器 =====');
  console.log(JSON.stringify(treeInfo, null, 1));

  const rows = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('[role="treeitem"]')) {
      if (out.length >= 25) break;
      const attrs = {};
      for (const a of el.getAttributeNames()) attrs[a] = (el.getAttribute(a) || '').slice(0, 50);
      out.push({ text: (el.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 50), attrs });
    }
    return out;
  });
  console.log('\n===== treeitem 明细 =====');
  console.log(JSON.stringify(rows, null, 1));

  // composer
  const composer = await page.evaluate(() => {
    const input = document.querySelector('div[role="textbox"], [contenteditable="true"]');
    if (!input) return { error: '未找到输入框' };
    return {
      inputAriaLabel: input.getAttribute('aria-label'),
      inputClass: (input.className || '').toString().slice(0, 60),
      parentText: (input.closest('[class]')?.parentElement?.innerText || '').slice(0, 120),
    };
  });
  console.log('\n===== composer =====');
  console.log(JSON.stringify(composer, null, 1));

  // 设置面板：尝试用多种可能的名字打开
  console.log('\n===== 打开设置 =====');
  for (const name of ['设置', '打开设置']) {
    const btn = page.getByRole('button', { name, exact: true });
    const n = await btn.count();
    console.log(`  候选 "${name}": count=${n}`);
    if (n > 0) {
      await btn.first().click().catch(e => console.log('  点击失败: ' + e.message));
      await page.waitForTimeout(2500);
      break;
    }
  }
  const dialog = page.locator('[role="dialog"]').first();
  if (await dialog.count()) {
    await dumpInteractive(page, '[role="dialog"]', '设置面板内容', 45);
  } else {
    console.log('  (未出现 [role=dialog])');
  }

  console.log('\n===== 控制台错误 =====');
  console.log(errors.length ? errors.slice(0, 10).join('\n') : '(无)');

  await ctx.close();
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
