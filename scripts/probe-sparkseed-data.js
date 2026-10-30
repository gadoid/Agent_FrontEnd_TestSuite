// @ts-check
/**
 * 一次性探测（SparkSeed rc.7 迁移基线）：以 electron 夹具同款方式拉起应用，
 * 采集 fixtures/test-data/ui-catalog.js 里所有「部署相关」数据的实测值：
 *   Agent 预设菜单 / 模型菜单 / 指令面板 / 设置页签与通用控件 / 版本号 /
 *   插件安装表单（安装源选项 + 示例包名）/ 设置→内置插件分组
 * 结果写 .runtime/probe-sparkseed-data.json，供重新基线化 ui-catalog 用。
 * 用法：node scripts/probe-sparkseed-data.js（跑前须退出 SparkSeed 桌面应用）
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { _electron } = require('@playwright/test');
const { loadEnv, llmEnv, readEnv } = require('../fixtures/env');

loadEnv();

(async () => {
  const RUNTIME_CWD = path.join(os.tmpdir(), 'dsh-e2e-cwd');
  fs.mkdirSync(RUNTIME_CWD, { recursive: true });
  const app = await _electron.launch({
    executablePath: readEnv('E2E_DSH_EXE') || 'D:/sparkseed/sparkseed.exe',
    cwd: RUNTIME_CWD,
    env: { ...process.env, ...llmEnv() },
    timeout: 60000,
  });
  const out = {};
  /** 每节独立兜底，一节失败不拖垮其余采集 */
  const section = async (name, fn) => {
    try { out[name] = await fn(); console.log(`[probe] ${name}: OK`); }
    catch (e) { out[name] = { error: e.message.split('\n')[0] }; console.log(`[probe] ${name}: FAIL ${e.message.split('\n')[0]}`); }
  };
  const texts = async (loc) => (await loc.allInnerTexts()).map(t => t.trim()).filter(Boolean);

  try {
    let win = null;
    const deadline = Date.now() + 90000;
    while (Date.now() < deadline && !win) {
      win = app.windows().find(w => w.url().startsWith('dsh-app://')) || null;
      if (!win) await new Promise(r => setTimeout(r, 1000));
    }
    if (!win) throw new Error('未等到 dsh-app:// 主窗口');
    const page = win;
    await page.getByRole('button', { name: '新建会话' }).last().waitFor({ timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(1500);

    await section('pageTitle', async () => await page.title());

    // —— 1. Agent 预设菜单（首页 hero）
    await section('agentModes', async () => {
      const btn = page.locator('[data-slot="conversation.hero.agentPreset"] button[aria-haspopup="menu"], button[title*="Agent 预设"]').first();
      await btn.waitFor({ state: 'visible', timeout: 10000 });
      await btn.click();
      await page.locator('[role="menuitem"]').first().waitFor({ timeout: 10000 });
      const names = await texts(page.locator('[role="menuitem"]'));
      await page.keyboard.press('Escape');
      return names.map(t => t.split('\n')[0].trim());
    });

    // —— 2. 模型菜单（输入区）
    await section('modelMenu', async () => {
      const btn = page.locator('button[aria-haspopup="menu"]').filter({ hasText: /模型|deepseek|glm/i }).first();
      const visible = await btn.isVisible().catch(() => false);
      const target = visible ? btn : page.getByRole('button', { name: /模型/ }).first();
      await target.click();
      await page.locator('[role="menuitem"], [role="menuitemradio"]').first().waitFor({ timeout: 10000 });
      const items = await texts(page.locator('[role="menuitem"], [role="menuitemradio"]'));
      await page.keyboard.press('Escape');
      return items.map(t => t.split('\n')[0].trim());
    });

    // —— 3. 指令面板（输入框输入 /）
    await section('commandPanel', async () => {
      const input = page.locator('[contenteditable="true"], textarea').last();
      await input.click({ timeout: 10000 });
      await input.pressSequentially('/', { delay: 50 });
      await page.waitForTimeout(1200);
      const items = await texts(page.locator('[role="option"], [cmdk-item], [data-slot*="command"] [role="menuitem"]'));
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
      return items.map(t => t.split('\n')[0].trim());
    });

    // —— 4. 设置面板：页签 + 版本 + 通用控件
    await section('settings', async () => {
      await page.keyboard.press('Escape').catch(() => {});
      await page.getByRole('button', { name: /^(设置|账号菜单)$/ }).first().click({ timeout: 10000 });
      const mi = page.getByRole('menuitem', { name: '设置' });
      if (await mi.count().catch(() => 0)) await mi.first().click({ timeout: 5000 });
      await page.locator('[class*="navList"] button').first().waitFor({ state: 'visible', timeout: 10000 });
      const tabs = await texts(page.locator('[class*="navList"] button'));
      const body = await texts(page.locator('[role="dialog"] button'));
      const version = (await page.getByText(/当前版本/).first().innerText().catch(() => '')).trim();
      await page.keyboard.press('Escape');
      return { tabs, version, dialogButtons: body.map(t => t.split('\n')[0].trim()).slice(0, 40) };
    });

    // —— 5. 侧栏插件页：安装表单 + 内置插件分组
    await section('plugins', async () => {
      await page.getByRole('button', { name: '插件', exact: true }).click({ timeout: 10000 });
      await page.waitForTimeout(1500);
      const res = {};
      const addBtn = page.getByRole('button', { name: /添加插件/ }).first();
      if (await addBtn.isVisible().catch(() => false)) {
        await addBtn.click();
        await page.waitForTimeout(800);
        res.buttons = await texts(page.locator('button')).then(a => a.filter(t => /安装|示例|源|引导/.test(t)));
        const example = page.getByRole('button', { name: /填入示例/ }).first();
        res.exampleAria = await example.getAttribute('aria-label').catch(() => null);
        await page.keyboard.press('Escape');
      }
      const groups = await texts(page.locator('[class*="group"] [class*="title"], [class*="group"] h3, [class*="section"] h3'));
      res.groupTexts = groups.slice(0, 10);
      return res;
    });
  } finally {
    const file = path.join(__dirname, '..', '.runtime', 'probe-sparkseed-data.json');
    fs.writeFileSync(file, JSON.stringify(out, null, 2));
    console.log(`[probe] 结果已写入 ${file}`);
    await app.close().catch(() => {});
    const { spawn } = require('child_process');
    const pid = (() => { try { return app.process().pid; } catch { return null; } })();
    if (pid) await new Promise(r => { const p = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' }); p.on('exit', r); p.on('error', r); });
  }
})();
