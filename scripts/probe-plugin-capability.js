// @ts-check
/**
 * 一次性探测（插件能力组选择器考古）：以 electron 夹具同款方式拉起 eline
 * （web 形态 settings 持久化有已知缺陷——「预览版说明」关不掉，见
 * 《问题根因分析-M8-09工作区隔离与web端预览版弹窗.md》），考古三块 UI 的真实 DOM：
 *   1. 侧栏插件页 → 点「查看 <name>」后的插件详情页（返回/版本/包含的组件/运行状态/筛选）
 *   2. 「添加插件」安装表单（安装引导展开、非法包名校验、安装源当前值）
 *   3. 设置 → 内置插件（只读清单 + 搜索过滤 + 分组计数）
 * 用法：node scripts/probe-plugin-capability.js
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { _electron } = require('@playwright/test');
const { loadEnv, llmEnv } = require('../fixtures/env');

loadEnv();

(async () => {
  const RUNTIME_CWD = path.join(os.tmpdir(), 'dsh-e2e-cwd');
  fs.mkdirSync(RUNTIME_CWD, { recursive: true });
  const app = await _electron.launch({
    executablePath: 'D:/ElineAI/eline.exe',
    cwd: RUNTIME_CWD,
    env: { ...process.env, ...llmEnv() },
    timeout: 60000,
  });
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
    // 预览版说明（electron 下可正常确认）
    const cont = page.getByRole('button', { name: '继续', exact: true }).first();
    if (await cont.isVisible().catch(() => false)) {
      await cont.click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(1000);
    }

    /** 消解可能重挂的预览版说明（electron 正常情况一次即愈，这里兜底轮询） */
    const dismissHard = async () => {
      for (let round = 0; round < 4; round++) {
        const c = page.getByRole('button', { name: '继续', exact: true }).first();
        const appeared = await c.waitFor({ state: 'visible', timeout: round === 0 ? 5000 : 3000 })
          .then(() => true).catch(() => false);
        if (!appeared) return;
        await c.click({ timeout: 5000 }).catch(() => {});
        await page.waitForTimeout(1000);
      }
    };

    // —— 1. 插件页 → 详情页
    await dismissHard();
    await page.getByRole('button', { name: '插件', exact: true }).click();
    await page.locator('button[aria-label^="查看 "]').first().waitFor({ state: 'visible', timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(1200);
    const names = await page.evaluate(() =>
      [...document.querySelectorAll('button[aria-label^="查看 "]')]
        .map(b => b.getAttribute('aria-label').replace(/^查看\s+/, '').trim()));
    console.log(`\n[probe] 插件(${names.length}): ${names.join(', ')}`);

    if (names.length) {
      await dismissHard();
      await page.locator('button[aria-label^="查看 "]').first().click();
      await page.waitForTimeout(1500);
      console.log('=== 详情页关键控件 ===');
      for (const label of ['返回插件列表', '刷新', '添加插件', '卸载', '筛选组件']) {
        const n = page.getByRole('button', { name: label, exact: true });
        console.log(`  按钮「${label}」: count=${await n.count()} visible=${await n.first().isVisible().catch(() => false)}`);
      }
      console.log('=== 详情页全部 aria-label 按钮 ===');
      console.log(await page.evaluate(() =>
        [...document.querySelectorAll('button[aria-label]')].map(b => b.getAttribute('aria-label')).join(' | ')));
      console.log('=== 详情页正文文本（截断 2200 字） ===');
      console.log((await page.evaluate(() => document.body.innerText)).slice(0, 2200).replace(/\n{2,}/g, '\n'));
      const back = page.getByRole('button', { name: '返回插件列表', exact: true });
      if (await back.count()) { await back.first().click().catch(() => {}); await page.waitForTimeout(800); }
    }

    // —— 2. 安装表单（不提交）
    console.log('\n=== 添加插件 表单 ===');
    await dismissHard();
    const add = page.getByRole('button', { name: '添加插件', exact: true });
    if (await add.count()) {
      await add.first().click();
      await page.waitForTimeout(1200);
      console.log((await page.evaluate(() => document.body.innerText)).slice(0, 1800).replace(/\n{2,}/g, '\n'));
      console.log('--- 表单内控件 aria/placeholder ---');
      console.log(await page.evaluate(() =>
        [...document.querySelectorAll('input,textarea,[role="radio"],label')].slice(0, 40)
          .map(e => `${e.tagName}:${(e.getAttribute('aria-label') || e.getAttribute('placeholder') || e.textContent || '').slice(0, 40)}`).join('\n')));
      const guide = page.getByRole('button', { name: /插件安装引导和示例/ });
      console.log(`引导开关 count=${await guide.count()}`);
      if (await guide.count()) {
        await guide.first().click().catch(() => {});
        await page.waitForTimeout(800);
        console.log('--- 展开引导后文本（截断 2600） ---');
        console.log((await page.evaluate(() => document.body.innerText)).slice(0, 2600).replace(/\n{2,}/g, '\n'));
      }
      await page.keyboard.press('Escape');
      await page.waitForTimeout(600);
    }

    // —— 2b. 插件说明点击行为
    console.log('\n=== 插件说明 ===');
    const help = page.getByRole('button', { name: '插件说明', exact: true });
    if (await help.count()) {
      await help.first().click().catch(() => {});
      await page.waitForTimeout(800);
      const t = await page.evaluate(() => document.body.innerText);
      console.log('含「在这里配置官方插件」:', t.includes('在这里配置官方插件'));
      console.log('含「设置 → 内置插件」:', t.includes('设置 → 内置插件'));
    }

    // —— 2c. 安装表单：非法包名点击「安装」（无效输入校验，不会真正安装）
    console.log('\n=== 安装表单非法包名 ===');
    const add2 = page.getByRole('button', { name: '添加插件', exact: true });
    const before = await page.evaluate(() => document.querySelectorAll('button[aria-label^="查看 "]').length);
    if (await add2.count()) {
      await add2.first().click().catch(() => {});
      await page.waitForTimeout(800);
      const spec = page.locator('input[placeholder="包名或地址"]');
      if (await spec.count()) {
        await spec.first().fill('@@非法 包名!!');
        const run = page.getByRole('button', { name: '安装', exact: true });
        console.log(`安装按钮 count=${await run.count()} enabled=${await run.first().isEnabled().catch(() => false)}`);
        if (await run.count() && await run.first().isEnabled().catch(() => false)) {
          await run.first().click().catch(() => {});
          await page.waitForTimeout(1500);
          const t = await page.evaluate(() => document.body.innerText);
          for (const kw of ['无法识别这个包名或地址', '未找到相关插件', '取消安装', '正在检查']) {
            if (t.includes(kw)) console.log('出现文案:', kw);
          }
          // 取消路径
          const cancel = page.getByRole('button', { name: /取消安装|关闭|取消/ }).first();
          if (await cancel.isVisible().catch(() => false)) { await cancel.click().catch(() => {}); await page.waitForTimeout(800); }
          await page.keyboard.press('Escape').catch(() => {});
          await page.waitForTimeout(800);
        }
      } else {
        console.log('未找到「包名或地址」输入框');
      }
      await page.keyboard.press('Escape').catch(() => {});
      await page.waitForTimeout(600);
    }
    const afterAdd = await page.evaluate(() => document.querySelectorAll('button[aria-label^="查看 "]').length);
    console.log(`非法包名尝试前后插件行数: ${before} → ${afterAdd}`);

    // —— 3. 设置 → 内置插件
    console.log('\n=== 设置 → 内置插件 ===');
    await dismissHard();
    await page.keyboard.press('Escape').catch(() => {});
    await page.getByRole('button', { name: /^(设置|账号菜单)$/ }).first().click({ timeout: 10000 }).catch(() => {});
    const mi = page.getByRole('menuitem', { name: '设置' });
    if (await mi.count().catch(() => 0)) await mi.first().click().catch(() => {});
    await page.locator('[class*="navList"] button').first().waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
    await page.locator('[class*="navList"] button').filter({ hasText: '内置插件' }).first().click().catch(() => {});
    await page.waitForTimeout(1500);
    console.log('--- 内置插件页签头部 ---');
    console.log((await page.evaluate(() => document.body.innerText)).slice(-2600).replace(/\n{2,}/g, '\n'));
    // 搜索过滤行为
    const s = page.locator('input[placeholder="搜索插件"]');
    console.log(`搜索插件输入框 count=${await s.count()}`);
    if (await s.count()) {
      const totalBefore = await page.evaluate(() => document.body.innerText.match(/运行中|已停用/g)?.length || 0);
      await s.first().fill('tool-bash');
      await page.waitForTimeout(1200);
      const t1 = await page.evaluate(() => document.body.innerText);
      console.log('搜「tool-bash」后含 tool-bash:', t1.includes('tool-bash'), '；含「网页搜索」:', t1.includes('网页搜索'));
      await s.first().fill('不存在插件xyz');
      await page.waitForTimeout(1200);
      const t2 = await page.evaluate(() => document.body.innerText);
      const emptyHit = ['没有匹配', '无结果', '没有找到', '0 个'].find(k => t2.includes(k));
      console.log('搜不存在串后空态文案:', emptyHit || '(未见明显空态文案)');
      await s.first().fill('');
      await page.waitForTimeout(800);
      const totalAfter = await page.evaluate(() => document.body.innerText.match(/运行中|已停用/g)?.length || 0);
      console.log(`清空搜索后状态词计数: ${totalBefore} → ${totalAfter}`);
    }
    console.log('--- data-slot 清单（去重前 30） ---');
    console.log(await page.evaluate(() =>
      [...new Set([...document.querySelectorAll('[data-slot]')].map(e => e.getAttribute('data-slot')))].slice(0, 30).join('\n')));
  } finally {
    await app.close().catch(() => {});
  }
})().catch(e => { console.error('[probe] FAIL:', e); process.exit(1); });
