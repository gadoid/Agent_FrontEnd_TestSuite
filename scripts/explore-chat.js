// @ts-check
// 探测脚本4：真实对话流程 —— 发消息、看消息 DOM、上传附件（知识库）
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const APP_URL = process.env.DSH_URL || 'http://127.0.0.1:3080/';
const TOKEN = process.env.DSH_TOKEN || 'C79C_OJtFuNt2F7URLeM4OoWms1L3fyfFXgGsnaVtNs';
const MARKER = 'ZKB-MARKER-7F3A9C';

(async () => {
  // 准备知识库样本文件
  const tmpDir = path.join(__dirname, '..', 'fixtures', 'test-data');
  fs.mkdirSync(tmpDir, { recursive: true });
  const kbFile = path.join(tmpDir, 'kb-sample.md');
  fs.writeFileSync(kbFile, `# 知识库样本\n\n机密代号: ${MARKER}\n\n外贸术语: FOB 表示离岸价。\n`);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${APP_URL}?token=${TOKEN}`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: '新建会话' }).last().waitFor({ timeout: 30000 });
  await page.waitForTimeout(1000);

  // 新会话
  await page.getByRole('button', { name: '新建会话' }).last().click();
  await page.waitForTimeout(800);

  // 输入并发送
  const input = page.locator('div[role="textbox"][aria-label*="描述你想要构建的内容"]');
  await input.click();
  await input.fill('你好，这是一条自动化测试消息，请简短回复"收到"。');
  await page.getByRole('button', { name: '发送消息' }).click();
  console.log('>>> message sent, waiting for reply...');

  // 等回复出现（最长120s）：监测 DOM 变化
  const started = Date.now();
  let dumped = false;
  while (Date.now() - started < 120000) {
    await page.waitForTimeout(5000);
    const bodyLen = await page.evaluate(() => document.body.innerText.length);
    const hasReply = await page.evaluate(() => /收到/.test(document.body.innerText));
    console.log(`  t=${Math.round((Date.now()-started)/1000)}s bodyLen=${bodyLen} has收到=${hasReply}`);
    if (hasReply && !dumped) {
      // 等流式输出稳定
      await page.waitForTimeout(4000);
      const structure = await page.evaluate(() => {
        const out = [];
        // 找消息区域: 主内容区里排除输入框
        document.querySelectorAll('main *, [class*="message"] *, [class*="conversation"] *').forEach(el => {
          if (el.children.length === 0) {
            const t = (el.innerText || '').trim();
            if (t && t.length > 3) out.push(`<${el.tagName.toLowerCase()} class="${(el.className||'').toString().slice(0,60)}"> ${t.slice(0,80)}`);
          }
        });
        return [...new Set(out)].slice(0, 30);
      });
      console.log('===== TRANSCRIPT STRUCTURE =====');
      console.log(structure.join('\n'));
      await page.screenshot({ path: 'explore-chat-reply.png' });
      dumped = true;
      break;
    }
  }
  if (!dumped) { await page.screenshot({ path: 'explore-chat-timeout.png' }); console.log('!! no reply within 120s'); }

  // 附件/知识库: @ 引用
  await input.click();
  await input.fill('@');
  await page.waitForTimeout(1200);
  const mentions = await page.evaluate(() => {
    const hits = [];
    document.querySelectorAll('[role="option"], [role="menuitem"], [class*="mention"], [class*="popup"] *, [class*="popover"] *').forEach(el => {
      const t = (el.innerText || '').trim().replace(/\n/g, ' | ');
      if (t && t.length > 2 && t.length < 80) hits.push(`<${el.tagName.toLowerCase()}> ${t}`);
    });
    return [...new Set(hits)].slice(0, 25);
  });
  console.log('===== @ mention options =====');
  console.log(mentions.join('\n') || '(none)');
  await page.screenshot({ path: 'explore-mention.png' });

  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
