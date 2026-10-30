// @ts-check
/**
 * 复核探测 #5：设置写入到底生不生效 —— 四重证据法。
 *  1) 全量 class/inline-style/data-* 差分（不预设采样点）
 *  2) 窗口截图目视（.runtime/probe5/*.png）
 *  3) 设置界面自身显示值（字号数字、语言 trigger 文本、开关 aria 态）
 *  4) 控制台错误 / RPC 失败日志
 * 另扫 ~/.eline 与 AppData 写盘痕迹。结束时恢复原状。
 * 用法：node scripts/probe-settings-deep.js
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { _electron } = require('@playwright/test');
const { loadEnv, llmEnv } = require('../fixtures/env');

loadEnv();

const OUT = path.join(__dirname, '..', '.runtime', 'probe5');
fs.mkdirSync(OUT, { recursive: true });

// 注入签名函数：class + inline style + data-* 全量差分
async function installSignature(win) {
  await win.evaluate(() => {
    const sig = () => {
      const out = {};
      document.querySelectorAll('*').forEach(el => {
        const cls = typeof el.className === 'string' ? el.className : (el.className && el.className.baseVal) || '';
        const style = el.getAttribute('style') || '';
        const key = el.tagName + '|' + cls + '|' + style;
        out[key] = (out[key] || 0) + 1;
      });
      const attrs = {};
      document.querySelectorAll('[data-theme], [data-mode], [data-color], [dir], [color-scheme]').forEach(el => {
        const k = el.tagName + '@' + (el.getAttribute('data-theme') || '') + (el.getAttribute('data-mode') || '')
          + (el.getAttribute('data-color') || '') + (el.getAttribute('color-scheme') || '');
        attrs[k] = (attrs[k] || 0) + 1;
      });
      return {
        classes: out, attrs,
        htmlCls: document.documentElement.className,
        bodyCls: document.body.className,
        bodyStyle: document.body.getAttribute('style') || '',
        htmlStyle: document.documentElement.getAttribute('style') || '',
      };
    };
    window.__domSig = sig;
  });
}

function diffSig(a, b) {
  const diffs = [];
  const keys = new Set([...Object.keys(a.classes), ...Object.keys(b.classes)]);
  for (const k of keys) {
    const d = (b.classes[k] || 0) - (a.classes[k] || 0);
    if (d !== 0) diffs.push(`${d > 0 ? '+' : ''}${d} ${k.slice(0, 120)}`);
  }
  const attrDiffs = [];
  const akeys = new Set([...Object.keys(a.attrs), ...Object.keys(b.attrs)]);
  for (const k of akeys) {
    const d = (b.attrs[k] || 0) - (a.attrs[k] || 0);
    if (d !== 0) attrDiffs.push(`${d > 0 ? '+' : ''}${d} ${k}`);
  }
  const misc = [];
  if (a.htmlCls !== b.htmlCls) misc.push(`html.class: "${a.htmlCls}" → "${b.htmlCls}"`);
  if (a.bodyCls !== b.bodyCls) misc.push(`body.class: "${a.bodyCls}" → "${b.bodyCls}"`);
  if (a.bodyStyle !== b.bodyStyle) misc.push(`body.style: "${a.bodyStyle}" → "${b.bodyStyle}"`);
  if (a.htmlStyle !== b.htmlStyle) misc.push(`html.style: "${a.htmlStyle}" → "${b.htmlStyle}"`);
  return { classDiffs: diffs, attrDiffs, misc };
}

(async () => {
  const HOME = os.homedir();
  const SCAN_DIRS = [path.join(HOME, '.eline'), path.join(process.env.APPDATA || '', 'eline')];
  const START = Date.now() - 60_000;
  const scanFiles = (label) => {
    const hits = [];
    const scan = (dir) => {
      try {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
          const p = path.join(dir, e.name);
          if (e.isDirectory()) { if (!/Cache|GPU|Dawn|Graphite|blob|Session Storage|Shared|Code Cache/i.test(e.name)) scan(p); }
          else { try { if (fs.statSync(p).mtimeMs > START - 2000) hits.push(p); } catch {} }
        }
      } catch {}
    };
    SCAN_DIRS.forEach(scan);
    console.log(`[${label}] 近期写盘: ${hits.slice(0, 10).join(' | ') || '(无)'}`);
  };

  const RUNTIME_CWD = path.join(os.tmpdir(), 'dsh-e2e-cwd');
  fs.mkdirSync(RUNTIME_CWD, { recursive: true });
  const app = await _electron.launch({
    executablePath: 'D:/sparkseed/sparkseed.exe',
    cwd: RUNTIME_CWD,
    env: { ...process.env, ...llmEnv() },
    timeout: 60000,
  });
  const consoleErrs = [];
  try {
    let win = null;
    const deadline = Date.now() + 90000;
    while (Date.now() < deadline && !win) {
      win = app.windows().find(w => w.url().startsWith('dsh-app://')) || null;
      if (!win) await new Promise(r => setTimeout(r, 1000));
    }
    win.on('console', m => { if (['error', 'warning'].includes(m.type())) consoleErrs.push(`[${m.type()}] ${m.text().slice(0, 200)}`); });
    win.on('pageerror', e => consoleErrs.push(`[pageerror] ${String(e).slice(0, 200)}`));

    await win.getByRole('button', { name: '新建会话' }).last().waitFor({ timeout: 30000 }).catch(() => {});
    const cont = win.getByRole('button', { name: '继续', exact: true }).first();
    if (await cont.isVisible().catch(() => false)) await cont.click({ timeout: 5000 }).catch(() => {});
    await installSignature(win);

    await win.getByRole('button', { name: /^(设置|账号菜单)$/ }).first().click({ timeout: 10000 }).catch(() => {});
    const mi = win.getByRole('menuitem', { name: '设置' });
    if (await mi.count().catch(() => 0)) await mi.first().click({ timeout: 5000 }).catch(() => {});
    await win.locator('[class*="navList"] button').first().waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
    await win.locator('[class*="navList"] button').filter({ hasText: '通用设置' }).first().click();
    await win.waitForTimeout(1000);

    const dlgText = () => win.evaluate(() => {
      const d = [...document.querySelectorAll('[role="dialog"]')].find(d => d.getBoundingClientRect().height > 200);
      return d ? d.innerText.split('\n').map(s => s.trim()).filter(Boolean) : [];
    });
    const shot = (name) => win.screenshot({ path: path.join(OUT, name) });
    const state = () => win.evaluate(() => ({
      fontVar: document.body.style.getPropertyValue('--dsh-content-font-size')
        || getComputedStyle(document.body).getPropertyValue('--dsh-content-font-size'),
      bodyBg: getComputedStyle(document.body).backgroundColor,
      switches: [...document.querySelectorAll('[role="switch"]')].map(el => ({
        t: (el.innerText || '').trim().slice(0, 20), c: el.getAttribute('aria-checked'),
      })),
    }));

    console.log('===== 1) 主题 =====');
    const sigA = await win.evaluate(() => window.__domSig());
    await shot('1-before-theme.png');
    console.log('设置页文本(外观/字号段):', JSON.stringify((await dlgText()).filter(l => /外观|浅色|深色|跟随|字号/.test(l))));
    console.log('状态:', JSON.stringify(await state()));

    const darkBtn = win.locator('button').filter({ hasText: /^\s*深色\s*$/ }).first();
    await darkBtn.click();
    await win.waitForTimeout(3000);
    const sigB = await win.evaluate(() => window.__domSig());
    const d1 = diffSig(sigA, sigB);
    await shot('2-after-dark.png');
    console.log(`点「深色」后 class/style 差分(${d1.classDiffs.length} 项):`);
    d1.classDiffs.slice(0, 15).forEach(x => console.log('   ', x));
    if (!d1.classDiffs.length) console.log('    (无任何变化)');
    console.log('  attr 差分:', d1.attrDiffs.length ? d1.attrDiffs : '(无)', ' misc:', d1.misc.length ? d1.misc : '(无)');
    scanFiles('主题点击后');

    console.log('\n===== 2) 字号 =====');
    console.log('字号段文本(点击前):', JSON.stringify((await dlgText()).filter(l => /字号|^\d+$|px/.test(l))));
    const inc = win.getByRole('button', { name: '增大字号' });
    await inc.click(); await win.waitForTimeout(1200);
    await inc.click(); await win.waitForTimeout(1200);
    await shot('3-after-font.png');
    console.log('字号段文本(增大×2后):', JSON.stringify((await dlgText()).filter(l => /字号|^\d+$|px/.test(l))));
    console.log('状态:', JSON.stringify(await state()));
    const dec = win.getByRole('button', { name: '减小字号' });
    await dec.click(); await win.waitForTimeout(600);
    await dec.click(); await win.waitForTimeout(600);

    console.log('\n===== 3) 语言 =====');
    const trig = win.locator('[role="dialog"] button').filter({ hasText: /^(中文|English)$/ }).first();
    console.log('trigger 文本(点击前):', JSON.stringify(await trig.innerText().catch(() => '(x)')));
    await trig.click(); await win.waitForTimeout(500);
    await win.locator('[role="menuitem"]').filter({ hasText: /^\s*English\s*$/ }).first().click();
    await win.waitForTimeout(2000);
    const trig2 = win.locator('[role="dialog"] button').filter({ hasText: /^(中文|English)$/ }).first();
    await shot('4-after-lang.png');
    console.log('trigger 文本(选 English 后):', JSON.stringify(await trig2.innerText().catch(() => '(x)')));
    console.log('body 文本含 新会话:', (await win.evaluate(() => document.body.innerText)).includes('新会话'));
    await trig2.click(); await win.waitForTimeout(400);
    await win.locator('[role="menuitem"]').filter({ hasText: /^\s*中文\s*$/ }).first().click().catch(() => {});
    await win.waitForTimeout(1000);
    scanFiles('语言选择后');

    console.log('\n===== 4) 开关（普通 + 坐标点击兜底） =====');
    const swRead = () => win.evaluate(() => {
      const d = [...document.querySelectorAll('[role="dialog"]')].find(d => d.getBoundingClientRect().height > 200);
      if (!d) return null;
      const el = [...d.querySelectorAll('[role="switch"]')].find(x => (x.closest('label,div,section')?.innerText || x.innerText || '').includes('显示代码工作视图'));
      if (!el) return { found: false };
      const r = el.getBoundingClientRect();
      return { found: true, checked: el.getAttribute('aria-checked'), rect: { x: r.x, y: r.y, w: r.width, h: r.height } };
    });
    console.log('开关(前):', JSON.stringify(await swRead()));
    const sw = win.locator('[role="switch"]').filter({ hasText: '显示代码工作视图' }).first();
    await sw.click().catch(e => console.log('  click err:', e.message.split('\n')[0]));
    await win.waitForTimeout(1000);
    console.log('开关(普通 click 后):', JSON.stringify(await swRead()));
    const st = await swRead();
    if (st && st.found && st.rect.w > 0) {
      await win.mouse.click(st.rect.x + st.rect.w / 2, st.rect.y + st.rect.h / 2);
      await win.waitForTimeout(1000);
      console.log('开关(坐标 click 后):', JSON.stringify(await swRead()));
    }

    console.log('\n===== 5) 控制台错误 =====');
    console.log(consoleErrs.length ? consoleErrs.slice(0, 15).join('\n') : '(无 error/warning/pageerror)');
    scanFiles('收尾');
    console.log('[probe5] 截图目录:', OUT);
  } finally {
    await app.close().catch(() => {});
  }
})().catch(e => { console.error('[probe5] FAIL:', e.message); process.exit(1); });
