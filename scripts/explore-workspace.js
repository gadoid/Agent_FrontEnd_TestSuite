// @ts-check
// 探测脚本：工作区相关 UI 考古 —— 侧边栏工作区区、+ 按钮、选择器下拉、创建/添加流程
// 输出各阶段可交互元素与弹层文本，截图存 /tmp。只读探测优先，必要处做可逆操作。
const { chromium } = require('@playwright/test');
const STATE = require('path').join(__dirname, '..', '.auth', 'dsh-state.json');

const dump = (label, v) => console.log(`=== ${label} ===\n${typeof v === 'string' ? v : JSON.stringify(v, null, 1)}`);

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    locale: 'zh-CN',
    viewport: { width: 1440, height: 900 },
    storageState: STATE,
  });
  const page = await ctx.newPage();
  await page.goto('http://127.0.0.1:3080/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: '新建会话' }).last().waitFor({ timeout: 30000 });
  await page.waitForTimeout(2000);

  /* 1. 侧边栏「工作区」区域结构 */
  const wsSection = await page.evaluate(() => {
    const out = [];
    // 找到「工作区」文本节点，取其父容器内的可交互元素
    document.querySelectorAll('button, [role=button], [role=combobox], [role=textbox]').forEach(el => {
      const aria = el.getAttribute('aria-label') || '';
      const text = (el.innerText || '').trim().slice(0, 40);
      if (/工作区|workspace/i.test(aria + ' ' + text) || (el.title || '').includes('工作区')) {
        out.push({ tag: el.tagName.toLowerCase(), aria, text, title: el.title || '', hasPopup: el.getAttribute('aria-haspopup') || '' });
      }
    });
    return out;
  });
  dump('工作区相关控件', wsSection);

  /* 2. 点击「选择工作区」combobox → 下拉内容 */
  const picker = page.locator('div[role="textbox"][aria-label="选择工作区"]');
  if (await picker.count()) {
    await picker.click();
    await page.waitForTimeout(1500);
    const dd = await page.evaluate(() => {
      const lines = [];
      document.querySelectorAll('[role=option], [role=listbox] *, [cmdk-item], [class*="popover"] *, [class*="menu"] *').forEach(el => {
        if (el.children.length === 0 && (el.offsetWidth || el.offsetHeight)) {
          const t = (el.innerText || '').trim();
          if (t && t.length < 60) lines.push(t);
        }
      });
      return [...new Set(lines)].slice(0, 25);
    });
    dump('选择工作区下拉项', dd);
    await page.screenshot({ path: 'C:/Users/123/AppData/Local/Temp/ws-1-picker-open.png' });
    await page.keyboard.press('Escape');
  } else {
    dump('选择工作区 combobox', 'NOT FOUND');
  }

  /* 3. 工作区旁边的 + 按钮（新建工作区入口）*/
  const plusBtn = page.locator('button[title*="工作区"], button[aria-label*="工作区"]').filter({ hasNot: page.locator('div[role=textbox]') });
  const plusCount = await page.locator('button[title*="新建工作区"], button[aria-label*="新建工作区"], button[title*="添加工作区"], button[aria-label*="添加工作区"]').count();
  dump('+ 入口按钮数(按 label)', plusCount);
  // 兜底：侧边栏所有 icon-only 按钮（无文本）列出来
  const iconBtns = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('button').forEach(el => {
      const text = (el.innerText || '').trim();
      if (!text) out.push({ aria: el.getAttribute('aria-label') || '', title: el.title || '' });
    });
    return out;
  });
  dump('无文本 icon 按钮', iconBtns);

  /* 4. 点 + → 弹窗结构 */
  const addBtn = page.locator('button[aria-label*="工作区"], button[title*="工作区"]').last();
  try {
    await addBtn.click({ timeout: 3000 });
    await page.waitForTimeout(1500);
    const dlg = await page.evaluate(() => {
      const out = { dialogs: [], inputs: [], buttons: [] };
      document.querySelectorAll('[role=dialog]').forEach(d => {
        if (d.offsetWidth) out.dialogs.push((d.innerText || '').slice(0, 400));
      });
      document.querySelectorAll('[role=dialog] input, [role=dialog] [role=textbox], [role=dialog] textarea').forEach(i => {
        out.inputs.push({ ph: i.placeholder || '', aria: i.getAttribute('aria-label') || '', type: i.type || '' });
      });
      document.querySelectorAll('[role=dialog] button').forEach(b => {
        const t = (b.innerText || b.getAttribute('aria-label') || '').trim();
        if (t && t.length < 30) out.buttons.push(t);
      });
      return out;
    });
    dump('「+」弹窗', dlg);
    await page.screenshot({ path: 'C:/Users/123/AppData/Local/Temp/ws-2-add-dialog.png' });
    await page.keyboard.press('Escape');
  } catch (e) {
    dump('+ 点击失败', e.message.split('\n')[0]);
  }

  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
