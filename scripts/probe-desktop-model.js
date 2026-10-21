// @ts-check
// 桌面端模型实验 v2：逐个模型实测聊天，成功判定只认【助手回复块】含标记（避免用户气泡假阳性）。
const { _electron } = require('@playwright/test');

(async () => {
  const app = await _electron.launch({
    executablePath: 'D:/ElineAI/eline.exe',
    cwd: 'C:/Users/123/AppData/Local/Temp/dsh-e2e-cwd',
    timeout: 60000,
  });
  await new Promise(r => setTimeout(r, 3000));
  let page = null;
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline && !page) {
    for (const w of app.windows()) {
      if (w.url().startsWith('dsh-app://')) { page = w; break; }
    }
    if (!page) await new Promise(r => setTimeout(r, 1000));
  }
  if (!page) throw new Error('未等到 dsh-app:// 主窗口');
  await page.getByRole('button', { name: '新建会话' }).last().waitFor({ timeout: 30000 }).catch(() => {});
  const cont = page.getByRole('button', { name: '继续', exact: true }).first();
  if (await cont.isVisible().catch(() => false)) await cont.click().catch(() => {});
  await page.waitForTimeout(1500);

  const mb = page.locator('button[aria-label^="选择模型"]').first();
  console.log('[default]', await mb.getAttribute('aria-label'));

  const results = [];
  for (const name of ['DeepSeek-V4-Pro', 'DeepSeek-V41-Flash']) {
    await mb.click();
    await page.waitForTimeout(800);
    const sub2 = page.locator('[role="menuitem"]').filter({ hasText: /模型/ }).first();
    if (await sub2.isVisible().catch(() => false)) { await sub2.click(); await page.waitForTimeout(800); }
    await page.locator('[role="menuitemradio"]').filter({ hasText: name }).first().click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(800);

    const MARK = `DT2-${Date.now().toString(36).toUpperCase()}`;
    const box = page.locator('[role="textbox"][aria-label*="调用指令"]').last();
    await box.click();
    await box.fill(`请原样输出这个标记词：${MARK}`);
    await page.getByRole('button', { name: '发送消息' }).click();

    let ok = false, err = '';
    const dl = Date.now() + 150000;
    while (Date.now() < dl) {
      const state = await page.evaluate((mark) => {
        const replies = [...document.querySelectorAll('[data-chat-flow-kind="assistant-step"][data-chat-group-part="response"]')];
        if (replies.some(r => (r.innerText || '').includes(mark))) return 'ok';
        const body = document.body.innerText;
        if (body.includes('处理失败')) return (body.match(/本轮运行失败[^\n]{0,80}/) || ['处理失败'])[0];
        return '';
      }, MARK);
      if (state === 'ok') { ok = true; break; }
      if (state) { err = state; break; }
      await page.waitForTimeout(3000);
    }
    results.push(`${name}: ${ok ? 'OK ✅' : 'FAIL ❌ ' + err}`);
    console.log(`[chat] ${name}: ${ok ? 'OK ✅' : 'FAIL ❌ ' + err}`);
    await page.getByRole('button', { name: '新建会话' }).last().click().catch(() => {});
    await page.waitForTimeout(1200);
  }
  console.log('[summary]', JSON.stringify(results));

  try { await Promise.race([app.close(), new Promise(r => setTimeout(r, 8000))]); } catch {}
  try { await app.evaluate(({ app: a }) => a.exit(0)); } catch {}
  await new Promise(r => setTimeout(r, 2000));
  try { app.process().kill(); } catch {}
  process.exit(0);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
