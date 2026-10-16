// @ts-check
// 探测脚本(五)：重命名/删除对话框结构、模式按钮属性、切换工作区交互、模型切换
const { chromium } = require('@playwright/test');
const STATE = require('path').join(__dirname, '..', '.auth', 'dsh-state.json');
const dump = (label, v) => console.log(`=== ${label} ===\n${typeof v === 'string' ? v : JSON.stringify(v, null, 1)}`);

async function popupText(page) {
  return page.evaluate(() => {
    const lines = [];
    document.querySelectorAll('[role=dialog], [role=menu], [class*="Modal"], [class*="modal"]').forEach(el => {
      if (!(el.offsetWidth || el.offsetHeight)) return;
      (el.innerText || '').split('\n').forEach(l => { const t = l.trim(); if (t) lines.push(t); });
    });
    return [...new Set(lines)].slice(0, 30);
  });
}

(async () => {
  const browser = await chromium.launch({ headless: false });
  const ctx = await browser.newContext({ locale: 'zh-CN', viewport: { width: 1440, height: 900 }, storageState: STATE });
  const page = await ctx.newPage();
  await page.goto('http://127.0.0.1:3080/');
  await page.getByRole('button', { name: '新建会话' }).last().waitFor({ timeout: 30000 });
  await page.waitForTimeout(2500);

  /* 1. 模式按钮的稳定属性（hero 区）*/
  const modeBtnInfo = await page.evaluate(() => {
    return [...document.querySelectorAll('button')].filter(b => /模式/.test(b.innerText || '') && (b.offsetWidth)).map(b => ({
      text: (b.innerText || '').trim().slice(0, 20), aria: b.getAttribute('aria-label') || '', popup: b.getAttribute('aria-haspopup') || '', cls: (b.className || '').slice(0, 40),
    }));
  });
  dump('1. 含「模式」的可见按钮', modeBtnInfo);

  /* 2. 工作区操作 → 重命名 对话框 */
  const opsBtn = page.locator('button[aria-label^="工作区“"][aria-label$="的操作"]').first();
  await opsBtn.hover({ force: true }).catch(() => {});
  await opsBtn.click({ force: true });
  await page.waitForTimeout(1000);
  await page.locator('[role=menuitem]').filter({ hasText: '重命名' }).first().click();
  await page.waitForTimeout(1200);
  dump('2. 重命名弹层', await popupText(page));
  const renameCtl = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('[role=dialog] input, [role=dialog] [role=textbox], [class*="Modal"] input').forEach(i =>
      out.push({ ph: i.placeholder || '', aria: i.getAttribute('aria-label') || '', value: i.value || '' }));
    return out;
  });
  dump('2. 重命名输入框', renameCtl);
  await page.screenshot({ path: 'C:/Users/123/AppData/Local/Temp/ws-K-rename.png' });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);

  /* 3. 删除工作区确认弹窗（对 ws-probe-dir 操作，不真删——先取消）*/
  // 切到 ws-probe-dir
  await page.getByRole('button', { name: '选择工作区' }).click();
  await page.waitForTimeout(1000);
  await page.locator('[role=menuitem]').filter({ hasText: 'ws-probe-dir' }).first().click();
  await page.waitForTimeout(2000);
  dump('3. 切换后当前工作区', (await page.getByRole('button', { name: '选择工作区' }).innerText()).trim());
  const ops2 = page.locator('button[aria-label^="工作区“"][aria-label$="的操作"]').first();
  await ops2.hover({ force: true }).catch(() => {});
  await ops2.click({ force: true });
  await page.waitForTimeout(1000);
  await page.locator('[role=menuitem]').filter({ hasText: '删除工作区' }).first().click();
  await page.waitForTimeout(1200);
  dump('4. 删除确认弹层', await popupText(page));
  const delBtns = await page.evaluate(() => [...document.querySelectorAll('[role=dialog] button, [class*="Modal"] button')].map(b => (b.innerText || '').trim()).filter(Boolean));
  dump('4. 弹窗按钮', delBtns);
  await page.screenshot({ path: 'C:/Users/123/AppData/Local/Temp/ws-L-delete-confirm.png' });

  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
