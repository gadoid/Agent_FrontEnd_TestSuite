// @ts-check
// 最小桌面聊天探针：默认模型发一条消息，报告 wire 错误或成功。
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
    for (const w of app.windows()) if (w.url().startsWith('dsh-app://')) { page = w; break; }
    if (!page) await new Promise(r => setTimeout(r, 1000));
  }
  await page.getByRole('button', { name: '新建会话' }).last().waitFor({ timeout: 30000 }).catch(() => {});
  const cont = page.getByRole('button', { name: '继续', exact: true }).first();
  if (await cont.isVisible().catch(() => false)) await cont.click().catch(() => {});
  await page.waitForTimeout(1200);

  console.log('[picker]', await page.locator('button[aria-label^="选择模型"]').first().getAttribute('aria-label'));
  const MARK = `PX-${Date.now().toString(36).toUpperCase()}`;
  const box = page.locator('[role="textbox"][aria-label*="调用指令"]').last();
  await box.click();
  await box.fill(`请原样输出这个标记词：${MARK}`);
  await page.getByRole('button', { name: '发送消息' }).click();

  const dl = Date.now() + 150000;
  while (Date.now() < dl) {
    const state = await page.evaluate((mark) => {
      const replies = [...document.querySelectorAll('[data-chat-flow-kind="assistant-step"][data-chat-group-part="response"]')];
      if (replies.some(r => (r.innerText || '').includes(mark))) return 'ok';
      const body = document.body.innerText;
      if (body.includes('处理失败')) return (body.match(/本轮运行失败[^\n]{0,90}/) || ['处理失败'])[0];
      return '';
    }, MARK);
    if (state === 'ok') { console.log('[chat] OK ✅'); break; }
    if (state) { console.log('[chat] FAIL ❌', state); break; }
    await new Promise(r => setTimeout(r, 3000));
  }
  try { await Promise.race([app.close(), new Promise(r => setTimeout(r, 8000))]); } catch {}
  try { await app.evaluate(({ app: a }) => a.exit(0)); } catch {}
  await new Promise(r => setTimeout(r, 2000));
  try { app.process().kill(); } catch {}
  process.exit(0);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
