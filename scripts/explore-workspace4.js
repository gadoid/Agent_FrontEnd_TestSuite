// @ts-check
// 探测脚本(四)：模式菜单选项；「添加工作区…」创建表单；创建→切换→删除往返验证
const { chromium } = require('@playwright/test');
const STATE = require('path').join(__dirname, '..', '.auth', 'dsh-state.json');
const dump = (label, v) => console.log(`=== ${label} ===\n${JSON.stringify(v, null, 1)}`);

async function popupText(page) {
  return page.evaluate(() => {
    const lines = [];
    document.querySelectorAll('[role=dialog], [role=menu], [role=listbox], [class*="popover"], [class*="menu"], [class*="Modal"], [class*="modal"]').forEach(el => {
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
  await page.waitForTimeout(2500);

  /* 1. 模式菜单（hero 区「标准模式 ⌄」）*/
  const modeBtn = page.getByRole('button', { name: '标准模式' }).first();
  console.log('mode buttons:', await page.getByRole('button', { name: '标准模式' }).count());
  await modeBtn.click();
  await page.waitForTimeout(1200);
  dump('1. 模式菜单', await popupText(page));
  await page.screenshot({ path: 'C:/Users/123/AppData/Local/Temp/ws-D-mode-menu.png' });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);

  /* 2. 打开选择工作区菜单 → 点「添加工作区…」 */
  await page.getByRole('button', { name: '选择工作区' }).click();
  await page.waitForTimeout(1200);
  const addEntry = page.getByRole('menuitem', { name: /添加工作区/ });
  const addEntryCount = await addEntry.count();
  console.log('添加工作区 menuitem count:', addEntryCount);
  if (!addEntryCount) {
    // 兜底：菜单里任意文本匹配
    const item = page.locator('[role=menuitem], [class*="popover"] *').filter({ hasText: '添加工作区' }).first();
    await item.click();
  } else {
    await addEntry.first().click();
  }
  await page.waitForTimeout(2000);
  dump('2. 添加工作区… 弹层', await popupText(page));
  const formCtl = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('[role=dialog] input, [role=dialog] [role=textbox], [role=dialog] textarea, [class*="Modal"] input, [class*="Modal"] [role=textbox]').forEach(i => {
      out.push({ ph: i.getAttribute('placeholder') || '', aria: i.getAttribute('aria-label') || '', tag: i.tagName, type: i.type || '' });
    });
    return out;
  });
  dump('2. 表单输入框', formCtl);
  await page.screenshot({ path: 'C:/Users/123/AppData/Local/Temp/ws-E-create-form.png' });

  /* 3. 填名称 → 提交，验证创建 */
  const WS = 'ws-probe-' + Date.now().toString(36);
  try {
    const nameInput = page.locator('[role=dialog] input, [role=dialog] [role=textbox]').first();
    await nameInput.fill(WS, { timeout: 5000 });
    // 找创建/确定/添加按钮
    const submit = page.locator('[role=dialog] button').filter({ hasText: /创建|确定|添加/ }).first();
    const submitLabel = await submit.innerText().catch(() => '(icon)');
    await submit.click();
    await page.waitForTimeout(3000);
    dump('3. 提交按钮', submitLabel);
    // 当前工作区按钮文本应变为新名字
    const cur = await page.getByRole('button', { name: '选择工作区' }).innerText().catch(() => '(读取失败)');
    dump('3. 创建后当前工作区', cur);
    dump('3. body 含新名?', (await page.evaluate(() => document.body.innerText)).includes(WS));
    await page.screenshot({ path: 'C:/Users/123/AppData/Local/Temp/ws-F-created.png' });

    /* 4. 切换回原工作区 eline */
    await page.getByRole('button', { name: '选择工作区' }).click();
    await page.waitForTimeout(1000);
    await page.locator('[role=menuitem]').filter({ hasText: 'eline' }).first().click();
    await page.waitForTimeout(2000);
    dump('4. 切换后当前工作区', (await page.getByRole('button', { name: '选择工作区' }).innerText()).trim());

    /* 5. 删除探测工作区：切到 ws-probe → 操作菜单 → 删除工作区 */
    await page.getByRole('button', { name: '选择工作区' }).click();
    await page.waitForTimeout(1000);
    await page.locator('[role=menuitem]').filter({ hasText: WS }).first().click();
    await page.waitForTimeout(2000);
    const ops = page.locator(`button[aria-label="工作区“${WS}”的操作"]`);
    await ops.hover({ force: true }).catch(() => {});
    await ops.click({ force: true });
    await page.waitForTimeout(1200);
    const del = page.locator('[role=menuitem]').filter({ hasText: '删除工作区' }).first();
    await del.click();
    await page.waitForTimeout(1500);
    // 可能出现确认弹窗
    const confirmText = await popupText(page);
    dump('5. 删除确认弹层', confirmText);
    const confirmBtn = page.locator('[role=dialog] button, [class*="Modal"] button').filter({ hasText: /删除|确定/ }).first();
    if (await confirmBtn.count()) await confirmBtn.click();
    await page.waitForTimeout(2500);
    dump('5. 删除后当前工作区', (await page.getByRole('button', { name: '选择工作区' }).innerText()).trim());
    dump('5. body 还含新名?', (await page.evaluate(() => document.body.innerText)).includes(WS));
  } catch (e) {
    dump('3-5 往返失败', e.message.split('\n')[0]);
    await page.screenshot({ path: 'C:/Users/123/AppData/Local/Temp/ws-G-fail.png' });
  }

  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
