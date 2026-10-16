// @ts-check
// 探测脚本(二)：精确点击 添加工作区 / 选择工作区 / 工作区操作 三个入口，逐个 dump 弹层
const { chromium } = require('@playwright/test');
const STATE = require('path').join(__dirname, '..', '.auth', 'dsh-state.json');

const dump = (label, v) => console.log(`=== ${label} ===\n${JSON.stringify(v, null, 1)}`);

async function popupText(page) {
  return page.evaluate(() => {
    const lines = [];
    document.querySelectorAll('[role=dialog], [role=menu], [role=listbox], [class*="popover"], [class*="menu"], [class*="Modal"], [class*="modal"], [class*="dialog"]').forEach(el => {
      const cls = (el.className || '').toString();
      if (!(el.offsetWidth || el.offsetHeight)) return;
      (el.innerText || '').split('\n').forEach(l => { const t = l.trim(); if (t) lines.push(t); });
    });
    return [...new Set(lines)].slice(0, 40);
  });
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ locale: 'zh-CN', viewport: { width: 1440, height: 900 }, storageState: STATE });
  const page = await ctx.newPage();
  await page.goto('http://127.0.0.1:3080/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: '新建会话' }).last().waitFor({ timeout: 30000 });
  await page.waitForTimeout(2000);

  /* A. 选择工作区 → 菜单 */
  await page.getByRole('button', { name: '选择工作区' }).click();
  await page.waitForTimeout(1500);
  dump('A. 选择工作区菜单', await popupText(page));
  await page.screenshot({ path: 'C:/Users/123/AppData/Local/Temp/ws-A-select-menu.png' });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);

  /* B. 工作区操作（…按钮）→ 菜单 */
  const opsBtn = page.locator('button[aria-label^="工作区“"][aria-label$="的操作"]');
  await opsBtn.click();
  await page.waitForTimeout(1500);
  dump('B. 工作区操作菜单', await popupText(page));
  await page.screenshot({ path: 'C:/Users/123/AppData/Local/Temp/ws-B-ops-menu.png' });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);

  /* C. 添加工作区 → 弹窗/表单 */
  await page.getByRole('button', { name: '添加工作区' }).click();
  await page.waitForTimeout(2000);
  dump('C. 添加工作区弹层文本', await popupText(page));
  const ctl = await page.evaluate(() => {
    const out = { inputs: [], buttons: [] };
    document.querySelectorAll('[role=dialog] input, [role=dialog] [role=textbox], [role=dialog] textarea, [class*="Modal"] input, [class*="modal"] input').forEach(i => {
      out.inputs.push({ ph: i.placeholder || '', aria: i.getAttribute('aria-label') || '', type: i.type || '' });
    });
    document.querySelectorAll('button').forEach(b => {
      const t = (b.innerText || b.getAttribute('aria-label') || '').trim();
      if (t && t.length < 30 && b.offsetWidth) out.buttons.push(t);
    });
    return out;
  });
  dump('C. 表单控件', ctl);
  await page.screenshot({ path: 'C:/Users/123/AppData/Local/Temp/ws-C-add-dialog.png' });

  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
