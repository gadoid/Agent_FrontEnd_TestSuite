// @ts-check
/**
 * 2026-10-31 rc.8 重构建（exe mtime 10:48）两问题活体取证：
 *   A) M8-06A：外观三按钮点击后选中态/亮度是否变化；elementFromPoint 看点击点被谁占据
 *      （区分「点击被悬浮层拦截」与「按钮惰性不生效」）
 *   B) M9-08A：hover 侧栏会话行 → 移开鼠标 → Rx-Pca_hoverContent 是否残留；
 *      残留时 elementFromPoint(选择工作区按钮中心) 是否被预览卡占据
 * 用法：node scripts/probe-rc8b-theme-hover.js（先彻底退出桌面应用）
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { _electron } = require('@playwright/test');
const { loadEnv, llmEnv } = require('../fixtures/env');

loadEnv();

const lumOf = (rgb) => {
  const m = (rgb || '').match(/\d+/g) || ['0', '0', '0'];
  return Math.round((+m[0] * 299 + +m[1] * 587 + +m[2] * 114) / 1000);
};

(async () => {
  const RUNTIME_CWD = path.join(os.tmpdir(), 'dsh-e2e-cwd');
  fs.mkdirSync(RUNTIME_CWD, { recursive: true });
  const app = await _electron.launch({
    executablePath: 'D:/sparkseed/sparkseed.exe',
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
    await win.getByRole('button', { name: '新建会话' }).last().waitFor({ timeout: 30000 }).catch(() => {});
    const cont = win.getByRole('button', { name: '继续', exact: true }).first();
    if (await cont.isVisible().catch(() => false)) await cont.click({ timeout: 5000 }).catch(() => {});
    console.log('== 应用就绪 ==');

    /* ---------- A) 主题按钮 ---------- */
    await win.getByRole('button', { name: /^(设置|账号菜单)$/ }).first().click({ timeout: 10000 }).catch(() => {});
    const mi = win.getByRole('menuitem', { name: '设置' });
    if (await mi.count().catch(() => 0)) await mi.first().click({ timeout: 5000 }).catch(() => {});
    await win.locator('[class*="navList"] button').filter({ hasText: '通用设置' }).first().click({ timeout: 10000 }).catch(() => {});
    await win.waitForTimeout(1000);

    const themeState = () => win.evaluate(() => {
      const lum = (rgb) => {
        const m = (rgb || '').match(/\d+/g) || ['0', '0', '0'];
        return Math.round((+m[0] * 299 + +m[1] * 587 + +m[2] * 114) / 1000);
      };
      const d = [...document.querySelectorAll('[role="dialog"]')].find(d => d.getBoundingClientRect().height > 200);
      const btns = d ? [...d.querySelectorAll('button')].filter(b => /^(浅色|深色|跟随系统)$/.test((b.innerText || '').trim())) : [];
      const sel = btns.find(b => /selected|active|checked/i.test(String(b.className)));
      const rgb = getComputedStyle(document.body).backgroundColor.match(/\d+/g) || ['0', '0', '0'];
      const htmlRgb = getComputedStyle(document.documentElement).backgroundColor.match(/\d+/g) || ['0', '0', '0'];
      return {
        selected: sel ? sel.innerText.trim() : '(无选中态类)',
        bodyLum: lum(rgb.join(',')), htmlLum: lum(htmlRgb.join(',')),
        htmlClass: document.documentElement.className || '(空)',
        bodyClass: (document.body.className || '(空)').slice(0, 80),
      };
    });
    console.log('初始主题态:', JSON.stringify(await themeState()));

    for (const name of ['浅色', '深色']) {
      const btn = win.locator('[role="dialog"] button').filter({ hasText: new RegExp(`^\\s*${name}\\s*$`) }).filter({ visible: true }).first();
      const at = await btn.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const x = r.x + r.width / 2, y = r.y + r.height / 2;
        const top = document.elementFromPoint(x, y);
        return { x: Math.round(x), y: Math.round(y), topEl: top ? `${top.tagName}.${String(top.className).slice(0, 60)}` : '(null)', isSelfOrChild: top ? el.contains(top) || top === el : false };
      });
      console.log(`\n[${name}] 按钮中心 (${at.x},${at.y}) 顶元素: ${at.topEl} | 是否按钮自身: ${at.isSelfOrChild}`);
      await btn.click({ timeout: 8000 }).catch(async () => { console.log(`  常规 click 失败，force 兜底`); await btn.click({ force: true, timeout: 5000 }).catch(() => {}); });
      await win.waitForTimeout(1000);
      console.log(`  点击${name}后:`, JSON.stringify(await themeState()));
    }
    // 对照：原生鼠标事件（page.mouse）再点一次深色 + 焦点观测
    const deep = win.locator('[role="dialog"] button').filter({ hasText: /^\s*深色\s*$/ }).filter({ visible: true }).first();
    const box = await deep.boundingBox();
    if (box) {
      console.log(`\n[对照] hasFocus=${await win.evaluate(() => document.hasFocus())}，page.mouse.click 深色中心 (${Math.round(box.x + box.width / 2)},${Math.round(box.y + box.height / 2)})`);
      await win.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await win.waitForTimeout(1000);
      console.log('  原生鼠标点击深色后:', JSON.stringify(await themeState()));
    }
    await win.keyboard.press('Escape');
    await win.waitForTimeout(800);

    /* ---------- B) 会话行 hover 预览卡 ---------- */
    await win.getByRole('button', { name: '新建会话' }).last().click({ timeout: 10000 }).catch(() => {});
    await win.waitForTimeout(1500);
    const row = win.getByRole('treeitem').filter({ hasText: '自动化测试确认回复' }).first();
    if (await row.isVisible().catch(() => false)) {
      await row.hover().catch(() => {});
      await win.waitForTimeout(1200);
      const s1 = await win.evaluate(() => {
        const hc = document.querySelector('[class*="hoverContent"]');
        const r = hc ? hc.getBoundingClientRect() : null;
        return { present: !!hc, rect: r ? `x=${Math.round(r.x)},y=${Math.round(r.y)},w=${Math.round(r.width)},h=${Math.round(r.height)}` : '-', text: hc ? (hc.innerText || '').slice(0, 40).replace(/\n/g, '|') : '' };
      });
      console.log('\n== hover 会话行后 hoverContent:', JSON.stringify(s1));

      const wsBtn = win.locator('button[aria-label="选择工作区"]').first();
      if (await wsBtn.isVisible().catch(() => false)) {
        const at = await wsBtn.evaluate((el) => {
          const r = el.getBoundingClientRect();
          const x = r.x + r.width / 2, y = r.y + r.height / 2;
          const top = document.elementFromPoint(x, y);
          return { x: Math.round(x), y: Math.round(y), topEl: top ? `${top.tagName}.${String(top.className).slice(0, 70)}` : '(null)', covered: top ? !el.contains(top) : true };
        });
        console.log(`移开鼠标后 选择工作区按钮中心 (${at.x},${at.y}) 顶元素: ${at.topEl} | 被占据: ${at.covered}`);
        const clickOk = await wsBtn.click({ timeout: 5000 }).then(() => true).catch((e) => { console.log('  点击失败:', String(e).split('\n')[0]); return false; });
        console.log('  点击选择工作区:', clickOk ? '成功' : '被拦截');
        await win.keyboard.press('Escape').catch(() => {});
      } else {
        console.log('（当前视图无 选择工作区 按钮，跳过 B2）');
      }
    } else {
      console.log('\n（侧栏无目标会话行，跳过 B）');
    }
  } finally {
    await app.close().catch(() => {});
  }
})().catch((e) => { console.error('探针失败:', e); process.exit(1); });
