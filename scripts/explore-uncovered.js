// @ts-check
// 探索测试：系统枚举 UI 上尚未被 40 个功能点覆盖的交互面（只记录，不做破坏性操作）。
// 用法: node scripts/explore-uncovered.js <token>
const { chromium } = require('@playwright/test');

const APP = 'http://127.0.0.1:3080/';
const TOKEN = process.argv[2] || '';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' });
  const page = await context.newPage();
  await page.goto(`${APP}?token=${TOKEN}`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(5000);
  const cont = page.getByRole('button', { name: '继续', exact: true }).first();
  if (await cont.isVisible().catch(() => false)) await cont.click().catch(() => {});
  await page.waitForTimeout(600);

  const log = (...a) => console.log(...a);
  const shot = (n) => page.screenshot({ path: `uncov-${n}.png` }).catch(() => {});
  const dumpPopup = async (label) => {
    await page.waitForTimeout(700);
    const items = await page.evaluate(() => {
      const out = [];
      document.querySelectorAll('[role="menuitem"], [role="menuitemradio"], [role="option"], [role="menu"] button, [role="dialog"] h1, [role="dialog"] h2, [role="dialog"] h3, [role="dialog"] button, [role="dialog"] input, [data-slot]')
        .forEach((el) => {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) return;
          const tag = el.tagName.toLowerCase();
          const text = ((el.innerText || '') + '|' + (el.getAttribute('aria-label') || '') + '|' + (el.getAttribute('placeholder') || '')).replace(/\n/g, ' / ').slice(0, 70);
          if (text.replace(/[|\s]/g, '')) out.push(`[${el.getAttribute('role') || tag}] ${text}`);
        });
      return [...new Set(out)].slice(0, 30);
    });
    log(`  ${label}:`, JSON.stringify(items, null, 1).slice(0, 1500));
  };
  const esc = async (n = 1) => { for (let i = 0; i < n; i++) { await page.keyboard.press('Escape').catch(() => {}); await page.waitForTimeout(350); } };

  // ── 进入一条有消息的历史会话（树里找一条非「新会话」的行）
  log('== P1 会话头部「更多操作」菜单 ==');
  const rows = page.locator('div[role="treeitem"][data-row-key^="session:"]');
  const n = await rows.count();
  let entered = false;
  for (let i = 0; i < n; i++) {
    const t = (await rows.nth(i).innerText()).trim();
    if (!t.includes('新会话')) { await rows.nth(i).click(); entered = true; break; }
  }
  if (!entered && n > 0) await rows.nth(0).click();
  await page.waitForTimeout(1500);

  const moreOps = page.getByRole('button', { name: '更多操作' }).first();
  if (await moreOps.isVisible().catch(() => false)) {
    await moreOps.click().catch(() => {});
    await dumpPopup('更多操作菜单');
    await shot('p1-more-ops');
    await esc();
  } else log('  会话头部无「更多操作」按钮（当前会话可能为空）');

  // ── P2 「更多打开方式」菜单
  log('== P2 「更多打开方式」菜单 ==');
  const moreOpen = page.getByRole('button', { name: '更多打开方式' }).first();
  if (await moreOpen.isVisible().catch(() => false)) {
    await moreOpen.click().catch(() => {});
    await dumpPopup('更多打开方式菜单');
    await esc();
  } else log('  会话头部无「更多打开方式」按钮');

  // ── P3 底部状态栏按钮（统计/上下文）
  log('== P3 状态栏按钮弹层 ==');
  for (const name of [/轮.*步/, /tok.*缓存/, /上下文已用/]) {
    const b = page.getByRole('button', { name }).first();
    if (await b.isVisible().catch(() => false)) {
      await b.click().catch(() => {});
      await dumpPopup(`状态栏弹层[${name}]`);
      await shot('p3-status');
      await esc();
    } else log(`  状态栏无 ${name} 按钮`);
  }

  // ── P4 指令面板里未覆盖的选项（目标/计划/反馈/压缩/权限/模型/下载日志）——逐个打开看形态
  log('== P4 指令面板选项形态（只打开观察，不确认） ==');
  for (const optName of ['目标', '计划', '反馈', '压缩', '权限', '下载日志']) {
    const addBtn = page.getByRole('button', { name: '添加文件或调用指令' }).first();
    await addBtn.click().catch(() => {});
    await page.waitForTimeout(600);
    const opt = page.locator('[role="option"]').filter({ hasText: new RegExp(`^\\s*${optName}`) }).first();
    if (await opt.isVisible().catch(() => false)) {
      await opt.click().catch(() => {});
      await page.waitForTimeout(700);
      await dumpPopup(`指令[${optName}]打开后`);
      await shot(`p4-${optName}`);
      await esc(2);
    } else {
      log(`  指令[${optName}] 不可见`);
      await esc();
    }
  }

  // ── P5 输入 "/" 唤起内联指令
  log('== P5 输入 "/" 内联指令 ==');
  const box = page.locator('[role="textbox"][aria-label*="调用指令"]').last();
  await box.click().catch(() => {});
  await page.keyboard.type('/', { delay: 50 }).catch(() => {});
  await page.waitForTimeout(800);
  await dumpPopup('输入/ 后');
  await shot('p5-slash');
  await page.keyboard.press('Backspace').catch(() => {});
  await esc();

  // ── P6 输入 "@" 唤起引用
  log('== P6 输入 "@" 引用 ==');
  await box.click().catch(() => {});
  await page.keyboard.type('@', { delay: 50 }).catch(() => {});
  await page.waitForTimeout(800);
  await dumpPopup('输入@ 后');
  await shot('p6-at');
  await page.keyboard.press('Backspace').catch(() => {});
  await esc();

  // ── P7 设置深挖
  log('== P7 设置：语言/快捷键/开关/模型提供商/Agent预设辅助操作 ==');
  await page.getByRole('button', { name: '设置', exact: true }).first().click().catch(() => {});
  await page.waitForTimeout(900);
  // 语言下拉
  const lang = page.getByRole('dialog').getByText('中文', { exact: true }).first();
  if (await lang.isVisible().catch(() => false)) {
    await lang.click().catch(() => {});
    await dumpPopup('语言下拉');
    await esc();
  }
  // 编辑快捷键
  const kb = page.getByRole('button', { name: '编辑快捷键' }).first();
  if (await kb.isVisible().catch(() => false)) {
    await kb.click().catch(() => {});
    await page.waitForTimeout(800);
    await dumpPopup('快捷键编辑器');
    await shot('p7-shortcuts');
    await esc(2);
    await page.waitForTimeout(400);
    // esc 后设置面板可能被关，重开
    if (!(await page.getByRole('button', { name: '编辑快捷键' }).first().isVisible().catch(() => false))) {
      await page.getByRole('button', { name: '设置', exact: true }).first().click().catch(() => {});
      await page.waitForTimeout(900);
    }
  }
  // 排队发送 / Session Log / 代码工作视图 开关（只记录）
  for (const nm of ['排队发送', '上传 Session Log', '显示代码工作视图']) {
    const sw = page.getByRole('switch', { name: nm }).or(page.getByText(nm)).first();
    log(`  开关[${nm}] 可见=${await sw.isVisible().catch(() => false)}`);
  }
  // 模型 tab：编辑中转站 / 添加模型提供商
  const modelTab = page.getByRole('dialog').getByText('模型', { exact: true }).first();
  if (await modelTab.isVisible().catch(() => false)) {
    await modelTab.click().catch(() => {});
    await page.waitForTimeout(600);
    const edit = page.getByRole('button', { name: /编辑 中转站/ }).first();
    if (await edit.isVisible().catch(() => false)) {
      await edit.click().catch(() => {});
      await page.waitForTimeout(700);
      await dumpPopup('编辑中转站弹层');
      await shot('p7-provider-edit');
      await esc();
      await page.waitForTimeout(300);
    }
    const addProv = page.getByRole('button', { name: '添加模型提供商' }).first();
    if (await addProv.isVisible().catch(() => false)) {
      await addProv.click().catch(() => {});
      await page.waitForTimeout(700);
      await dumpPopup('添加模型提供商弹层');
      await esc();
      await page.waitForTimeout(300);
    }
  }
  // Agent 预设 tab：模式说明/如何使用/查看配置
  const apTab = page.getByRole('dialog').getByText('Agent 预设', { exact: true }).first();
  if (await apTab.isVisible().catch(() => false)) {
    await apTab.click().catch(() => {});
    await page.waitForTimeout(600);
    for (const nm of ['模式说明', '如何使用']) {
      const b = page.getByRole('button', { name: new RegExp(`${nm}: `) }).first();
      if (await b.isVisible().catch(() => false)) {
        await b.click().catch(() => {});
        await page.waitForTimeout(600);
        await dumpPopup(`Agent预设[${nm}]`);
        await esc();
        await page.waitForTimeout(300);
        if (!(await apTab.isVisible().catch(() => false))) { await page.getByRole('button', { name: '设置', exact: true }).first().click().catch(() => {}); await page.waitForTimeout(700); await page.getByRole('dialog').getByText('Agent 预设', { exact: true }).first().click().catch(() => {}); await page.waitForTimeout(500); }
      }
    }
  }
  await esc();
  await page.waitForTimeout(400);

  // ── P8 插件页：插件行点击详情
  log('== P8 插件页详情 ==');
  await page.getByRole('button', { name: '插件', exact: true }).first().click().catch(() => {});
  await page.waitForTimeout(1200);
  const plugRow = page.locator('button[aria-label*="已启用"], button[aria-label*="已停用"]').first();
  if (await plugRow.isVisible().catch(() => false)) {
    await plugRow.click().catch(() => {});
    await page.waitForTimeout(800);
    await dumpPopup('插件详情');
    await shot('p8-plugin');
  } else log('  插件行未找到');
  await esc();

  // ── P9 终端打字 → 文件面板看到文件（工作区文件浏览链路）
  log('== P9 终端输入→工作区文件浏览 ==');
  await page.getByRole('button', { name: '新建会话' }).last().click().catch(() => {});
  await page.waitForTimeout(1000);
  const rb = page.getByRole('button', { name: '打开右侧边栏' }).first();
  if (await rb.isVisible().catch(() => false)) { await rb.click(); await page.waitForTimeout(900); }
  const termBtn = page.getByRole('button', { name: /新建终端/ }).first();
  if (await termBtn.isVisible().catch(() => false)) {
    await termBtn.click().catch(() => {});
    await page.waitForTimeout(2500);
    // xterm 键盘输入
    await page.locator('.xterm, textarea[data-testid="xterm-helper-textarea"]').first().click().catch(() => {});
    await page.keyboard.type('echo eline-probe > probe.txt\r', { delay: 20 }).catch(() => {});
    await page.waitForTimeout(1500);
    // 回开始页打开文件面板
    const startTab = page.locator('[role="tab"]').filter({ hasText: /^开始$/ }).first();
    if (await startTab.isVisible().catch(() => false)) { await startTab.click(); await page.waitForTimeout(600); }
    const newTab = page.getByRole('button', { name: '新标签页', exact: true }).first();
    if (await newTab.isVisible().catch(() => false)) { await newTab.click().catch(() => {}); await page.waitForTimeout(700); }
    const wf = page.getByRole('button', { name: /工作区文件/ }).first();
    if (await wf.isVisible().catch(() => false)) {
      await wf.click().catch(() => {});
      await page.waitForTimeout(1500);
      const files = await page.evaluate(() => document.body.innerText.match(/probe\.txt|空目录/g) || []);
      log('  文件面板内容含:', JSON.stringify([...new Set(files)]));
      await shot('p9-files');
      // 清理
      const termTab = page.locator('[role="tab"]').filter({ hasText: /cmd|pwsh|bash/i }).first();
      if (await termTab.isVisible().catch(() => false)) { await termTab.click(); await page.waitForTimeout(600); }
      await page.locator('.xterm, textarea[data-testid="xterm-helper-textarea"]').first().click().catch(() => {});
      await page.keyboard.type('del probe.txt\r', { delay: 20 }).catch(() => {});
      await page.waitForTimeout(800);
    }
  }

  // ── P10 快捷键 Ctrl+Alt+N
  log('== P10 快捷键 Ctrl+Alt+N ==');
  const before = await page.locator('div[role="treeitem"][data-row-key^="session:"]').count();
  await page.keyboard.press('Control+Alt+n').catch(() => {});
  await page.waitForTimeout(1200);
  const after = await page.locator('div[role="treeitem"][data-row-key^="session:"]').count();
  log(`  快捷键新建会话: 树行 ${before} → ${after} ${after > before ? '✅ 生效' : '（未变化）'}`);

  // ── P11 视图选项里的归档项（归档功能入口）
  log('== P11 归档相关 ==');
  const vo = page.getByRole('button', { name: '视图选项' }).first();
  if (await vo.isVisible().catch(() => false)) {
    await vo.click().catch(() => {});
    await dumpPopup('视图选项（归档项）');
    await esc();
  }
  // 会话行 hover 看归档/更多按钮
  const sessRow = page.locator('div[role="treeitem"][data-row-key^="session:"]').first();
  if (await sessRow.isVisible().catch(() => false)) {
    await sessRow.hover().catch(() => {});
    await page.waitForTimeout(400);
    const hoverBtns = await page.evaluate(() => [...document.querySelectorAll('button')]
      .filter(b => b.getBoundingClientRect().width > 0 && /归档|删除|重命名|更多/.test(b.getAttribute('aria-label') || ''))
      .map(b => b.getAttribute('aria-label')));
    log('  会话行 hover 可见按钮:', JSON.stringify(hoverBtns));
  }

  await browser.close();
  console.log('== 探索完成 ==');
})().catch(e => { console.error('ERR', e); process.exit(1); });
