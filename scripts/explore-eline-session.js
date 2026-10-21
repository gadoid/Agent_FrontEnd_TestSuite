// @ts-check
// 探测脚本（四）：真实会话视图 —— 发消息（验证 LLM 连通）、会话态右栏页签、
// 浏览器入口、会话态模型菜单、会话切换。
// 用法: node scripts/explore-eline4.js <token>
const { chromium } = require('@playwright/test');

const APP_URL = process.env.E2E_URL || 'http://127.0.0.1:3080/';
const TOKEN = process.argv[2] || '';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' });
  const page = await context.newPage();
  await page.goto(`${APP_URL}?token=${TOKEN}`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(4000);
  const cont = page.getByRole('button', { name: '继续', exact: true }).first();
  if (await cont.isVisible().catch(() => false)) await cont.click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(600);

  const dumpVisible = async (label) => {
    await page.waitForTimeout(700);
    const elements = await page.evaluate(() => {
      const out = [];
      const sel = 'button, a, input, textarea, [role="button"], [role="textbox"], [role="tab"], [role="menuitem"], [role="menuitemradio"], [role="option"], [role="switch"], [role="treeitem"], [role="dialog"], [role="tabpanel"], [data-chat-flow-kind]';
      document.querySelectorAll(sel).forEach((el) => {
        const text = (el.innerText || el.getAttribute('aria-label') || el.getAttribute('placeholder') || '').trim().slice(0, 90);
        if (!text) return;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return;
        out.push({ tag: el.tagName.toLowerCase(), role: el.getAttribute('role') || '', slot: el.getAttribute('data-slot') || '', flow: el.getAttribute('data-chat-flow-kind') || '', aria: el.getAttribute('aria-label') || '', text });
      });
      return out.slice(0, 300);
    });
    console.log(`\n########## ${label} ##########`);
    const seen = new Set();
    for (const e of elements) {
      const k = JSON.stringify(e);
      if (seen.has(k)) continue;
      seen.add(k);
      console.log(JSON.stringify(e));
    }
  };
  const shot = (n) => page.screenshot({ path: `exp-04-${n}.png` });
  const esc = async () => { await page.keyboard.press('Escape'); await page.waitForTimeout(400); };

  // 1. 发消息（走真实 LLM）
  const MARK = `ELINE-PROBE-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const box = page.locator('[role="textbox"][aria-label*="描述"]').first();
  await box.click();
  await box.fill(`请原样输出这个标记词：${MARK}`);
  await page.getByRole('button', { name: '发送消息' }).click();
  console.log(`[send] 已发送，标记=${MARK}`);
  shot('sent');

  // 2. 等回复
  const deadline = Date.now() + 180000;
  let replied = false;
  while (Date.now() < deadline) {
    const body = await page.evaluate(() => document.body.innerText);
    if (body.includes(MARK) && !body.includes('正在思考')) { replied = true; break; }
    await page.waitForTimeout(3000);
  }
  console.log(`[reply] 收到回复=${replied}`);
  await dumpVisible('会话视图(有消息后)');
  shot('replied');

  // 3. 会话态模型菜单（看思考程度是否出现）
  const modelBtn = page.locator('button[aria-label*="选择模型"]').first();
  if (await modelBtn.isVisible().catch(() => false)) {
    await modelBtn.click(); await page.waitForTimeout(600);
    await dumpVisible('会话态模型菜单');
    const mi = page.getByRole('menuitem', { name: /模型/ }).first();
    if (await mi.isVisible().catch(() => false)) { await mi.click(); await page.waitForTimeout(600); await dumpVisible('会话态模型二级'); }
    await esc(); await esc();
  }

  // 4. 右栏展开 + 页签
  const rightBtn = page.getByRole('button', { name: '打开右侧边栏' }).first();
  if (await rightBtn.isVisible().catch(() => false)) { await rightBtn.click(); await page.waitForTimeout(1000); }
  await dumpVisible('会话右栏展开');
  shot('rightpanel');
  for (const tab of ['轨迹', '文件', '系统提示词', '上下文']) {
    const t = page.locator('[role="tab"], button').filter({ hasText: new RegExp(`^\\s*${tab}\\s*$`) }).first();
    if (await t.isVisible().catch(() => false)) { await t.click(); await dumpVisible(`右栏页签[${tab}]`); shot(`tab-${tab}`); }
  }

  // 5. 全 DOM 搜浏览器入口
  const found = await page.evaluate(() => {
    const hits = [];
    document.querySelectorAll('button, [role="button"], [role="tab"], [role="menuitem"], a, [title]').forEach((el) => {
      const t = [(el.innerText || ''), (el.getAttribute('aria-label') || ''), (el.getAttribute('title') || '')].join('|');
      if (/浏览器|browser/i.test(t)) {
        const r = el.getBoundingClientRect();
        if (r.width > 0) hits.push({ tag: el.tagName.toLowerCase(), aria: el.getAttribute('aria-label') || '', title: el.getAttribute('title') || '', text: (el.innerText || '').trim().slice(0, 60) });
      }
    });
    return hits;
  });
  console.log('\n########## 浏览器入口候选(会话内) ##########');
  console.log(JSON.stringify(found, null, 1));

  // 6. 会话切换：新建第二个会话 → 树里点回第一个
  await page.getByRole('button', { name: '新建会话' }).last().click();
  await page.waitForTimeout(1200);
  const firstSession = page.locator('div[role="treeitem"][data-row-key^="session:"]').nth(1);
  const rowCount = await page.locator('div[role="treeitem"][data-row-key^="session:"]').count();
  console.log(`[switch] 树里 session 行数=${rowCount}`);
  if (rowCount >= 2) {
    await firstSession.click();
    await page.waitForTimeout(1500);
    const body = await page.evaluate(() => document.body.innerText);
    console.log(`[switch] 切回第一条会话后正文包含标记=${body.includes(MARK)}`);
    shot('switched-back');
  }

  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
