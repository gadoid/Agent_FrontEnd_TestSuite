// @ts-check
// 探测脚本(三)：B 工作区操作菜单(hover 后点)、C 添加工作区表单结构
const { chromium } = require('@playwright/test');
const STATE = require('path').join(__dirname, '..', '.auth', 'dsh-state.json');
const dump = (label, v) => console.log(`=== ${label} ===\n${JSON.stringify(v, null, 1)}`);

async function popupText(page) {
  return page.evaluate(() => {
    const lines = [];
    document.querySelectorAll('[role=dialog], [role=menu], [role=listbox], [class*="popover"], [class*="menu"], [class*="Modal"], [class*="modal"], [class*="dialog"]').forEach(el => {
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

  /* B. hover 工作区行 → 点「工作区“…”的操作」 */
  const opsBtn = page.locator('button[aria-label^="工作区“"][aria-label$="的操作"]').first();
  await opsBtn.hover({ force: true }).catch(() => {});
  await page.waitForTimeout(800);
  await opsBtn.click({ force: true, timeout: 5000 }).catch(async e => {
    console.log('ops 直接点失败，尝试 hover 父行:', e.message.split('\n')[0]);
    const row = page.locator('[role=treeitem], [class*="workspace"]').first();
    await row.hover().catch(() => {});
    await page.waitForTimeout(800);
    await opsBtn.click({ force: true, timeout: 5000 });
  });
  await page.waitForTimeout(1200);
  dump('B. 工作区操作菜单', await popupText(page));
  await page.screenshot({ path: 'C:/Users/123/AppData/Local/Temp/ws-B-ops-menu.png' });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);

  /* C. 添加工作区 → 表单 */
  await page.getByRole('button', { name: '添加工作区' }).click();
  await page.waitForTimeout(2000);
  dump('C. 添加工作区弹层文本', await popupText(page));
  const ctl = await page.evaluate(() => {
    const out = { textboxes: [], buttons: [], selects: [] };
    document.querySelectorAll('[role=dialog] [role=textbox], [role=dialog] input, [class*="Modal"] [role=textbox], [class*="modal"] [role=textbox], [class*="Modal"] input, [class*="modal"] input').forEach(i => {
      out.textboxes.push({ ph: i.getAttribute('placeholder') || '', aria: i.getAttribute('aria-label') || '', type: i.type || '', tag: i.tagName });
    });
    document.querySelectorAll('button').forEach(b => {
      const t = (b.innerText || b.getAttribute('aria-label') || '').trim();
      if (t && t.length < 30 && b.offsetWidth) out.buttons.push(t);
    });
    document.querySelectorAll('[role=dialog] [role=combobox]').forEach(s => out.selects.push(s.getAttribute('aria-label') || ''));
    return out;
  });
  dump('C. 表单控件', ctl);
  await page.screenshot({ path: 'C:/Users/123/AppData/Local/Temp/ws-C-add-dialog.png' });

  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
