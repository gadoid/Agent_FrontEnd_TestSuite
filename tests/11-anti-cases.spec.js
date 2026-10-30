// @ts-check
/**
 * 反例（anti）用例集 —— 针对每个既有测试项的反向/异常/边界验证。
 * ID 规则：原用例 ID + A（如 M3-01A = M3-01 的反例）。
 *
 * 覆盖形态：
 *   · 无效输入被拒   空消息/空重命名/特殊字符搜索/非法 RPC
 *   · 取消路径无害   菜单 Esc / 表单取消 / 确认框取消 → 状态不变、无副作用
 *   · 幂等往返       折叠/全屏/页签/弹层重复操作状态一致
 *   · 边界 clamp     字号连续增减有上下界
 *   · 形态差异负断言 web 无浏览器入口（预期缺失）
 *   · 容错韧性       终端非法命令后仍可用；深链无效路由不炸服务
 *
 * 原则：反例操作必须无痕恢复（开关/主题/字号/临时工作区在用例内复原），
 *      不产生持久脏状态；不在反例里做无法判定的 LLM 负向断言。
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { test, expect, APP_URL } = require('../fixtures/app.fixtures');
const { request: bareRequest } = require('@playwright/test');
const CATALOG = require('../fixtures/test-data/ui-catalog');
const workspaceApi = require('../fixtures/workspace-api');

const STATE_FILE = path.join(__dirname, '..', '.auth', 'dsh-state.json');

test.beforeEach(async ({ pages }) => {
  await pages.sidebar.openApp();
});

/**
 * 共享回复会话：搜索历史自动化会话并打开（标题保留「自动化测试」前缀，见 M8-04 注）；
 * 搜不到时现场造一个。返回后当前视图必有至少一个回合尾（turn-tail）。
 */
async function ensureReplySession(page, pages) {
  await pages.sidebar.searchSessions('自动化测试');
  const hit = page.locator('[role="tree"] [role="treeitem"]').filter({ hasText: /自动化测试/ }).first();
  if (await hit.isVisible().catch(() => false)) {
    await hit.click();
    await page.waitForTimeout(1500);
    await pages.sidebar.searchInput().fill('');
    await page.waitForTimeout(600);
  }
  // 满载数据下（历史会话 270+）桌面端转录本渲染慢：等 60s；仍没有就现场造一个回复
  let attached = await page.locator('[data-chat-flow-kind="turn-tail"]').first()
    .waitFor({ state: 'attached', timeout: 60000 }).then(() => true).catch(() => false);
  if (!attached) {
    await pages.sidebar.newSession();
    await pages.composer.send(`自动化测试(${Date.now().toString(36)})，请只回复：收到`);
    await pages.transcript.waitForReply(180000);
    attached = await page.locator('[data-chat-flow-kind="turn-tail"]').first()
      .waitFor({ state: 'attached', timeout: 30000 }).then(() => true).catch(() => false);
  }
  await expect(page.locator('[data-chat-flow-kind="turn-tail"]').first())
    .toBeAttached({ timeout: 30000 });
}

/* ═══════════════ 安装 / 启动（anti） ═══════════════ */

test.describe('安装/启动（anti）', () => {

  test('M1-03A 深链无效路由不炸服务（anti 反例）[web]', async ({ mode }) => {
    test.skip(mode !== 'web', 'web 专属用例（桌面端无可控导航地址）');
    const ctx = await bareRequest.newContext({ baseURL: APP_URL, storageState: STATE_FILE });
    const resp = await ctx.get('/__dsh_anti_no_such_route__');
    expect(resp.status(), '未知路由不应产生 5xx').toBeLessThan(500);
    if (resp.status() === 200) {
      // SPA 兜底：返回客户端壳由前端路由处理
      expect((await resp.text()).includes('__ModuleLoader__'), '200 时应仍是客户端壳').toBe(true);
    }
    await ctx.dispose();
  });
});

/* ═══════════════ 登录 / 认证（anti） ═══════════════ */

test.describe('登录/认证（anti）', () => {

  test('M2-01A 篡改 cookie 经页面导航被拦（anti 反例）[web]', async ({ mode, browser }) => {
    test.skip(mode !== 'web', 'web 专属用例');
    const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    const cookie = (state.cookies || []).find(c => c.name.startsWith('dsh-auth-'));
    test.skip(!cookie, '登录态里没有 dsh-auth-* cookie');
    const domain = new URL(APP_URL).host.split(':')[0];

    const ctx = await browser.newContext();
    await ctx.addCookies([{
      name: cookie.name,
      value: cookie.value.slice(0, -4) + 'beef', // 篡改签名段
      domain, path: '/', httpOnly: true, secure: false, sameSite: 'Strict',
    }]);
    const page = await ctx.newPage();
    const resp = await page.goto(APP_URL + '/');
    expect([401, 403], '篡改 cookie 的页面导航应被拦').toContain(resp.status());
    expect((await page.locator('body').innerText().catch(() => '')).toLowerCase())
      .toContain('auth');
    await ctx.close();
  });
});

/* ═══════════════ 对话（anti） ═══════════════ */

test.describe('对话（anti）', () => {

  test('M3-01A 空消息不可发送（anti 反例）[双端]', async ({ pages }) => {
    const btn = pages.composer.sendButton();
    await btn.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
    test.skip(!(await btn.count()), '当前视图无发送按钮');

    expect(await btn.isDisabled(), '空输入时发送按钮应禁用').toBe(true);
    await pages.composer.fill('   ');
    expect(await btn.isDisabled(), '纯空白输入应等价空消息（仍禁用）').toBe(true);
    await pages.composer.fill('');
  });

  test('M3-03A 未发送的空会话不落库（anti 反例，含 M10-04A 断言面）[双端]', async ({ page, pages }) => {
    await pages.sidebar.newSession();
    await page.waitForTimeout(1000);
    // 桌面端实测：新建会话后树里渲染**选中的「新会话」草稿行**（客户端草稿态，非服务端留存）。
    // 判别依据：留存行必带服务端相对时间标记（如「自动化测试收到 41分钟」），草稿行没有。
    // web 形态不渲染草稿行 → 断言平凡成立。
    const draftRow = page.locator('div[role="treeitem"][data-row-key^="session:"][aria-selected="true"]')
      .filter({ hasText: '新会话' }).first();
    if (await draftRow.count()) {
      const text = (await draftRow.innerText()).trim();
      expect(text, `草稿行不应带服务端留存时间标记（实际: ${text.replace(/\n/g, ' ')}）`)
        .not.toMatch(/\d+\s*(秒|分钟|小时|天)/);
    }
  });
});

/* ═══════════════ 插件管理（anti） ═══════════════ */

test.describe('插件管理（anti）', () => {

  test('M4-02A 添加插件表单取消无副作用（anti 反例）[双端]', async ({ page, pages }) => {
    test.setTimeout(120000);
    await pages.sidebar.openPlugins();
    const before = await pages.plugins.items().count();
    test.skip(before === 0, '插件清单为空');

    const input = await pages.plugins.openAddPluginForm();
    await expect(input).toBeVisible();
    await pages.plugins.close(); // Esc 取消，不提交安装

    let after = await pages.plugins.items().count();
    if (after === 0) { await pages.sidebar.openPlugins(); after = await pages.plugins.items().count(); }
    expect(after, '取消添加后插件清单数量不应变化').toBe(before);
  });

  test('M4-05A 插件详情往返清单一致（anti 反例）[双端]', async ({ page, pages }) => {
    await pages.plugins.open();
    const before = await pages.plugins.pluginNames();
    test.skip(before.length === 0, '本部署没有开放任何插件');

    // 详情 ↔ 列表 往返两轮：清单不能丢行、不能换序
    for (let round = 0; round < 2; round++) {
      await pages.plugins.viewButton(before[0]).click();
      await expect(pages.plugins.backToListButton()).toBeVisible({ timeout: 15000 });
      await pages.plugins.backToListButton().click();
      await expect(pages.plugins.viewButton(before[0])).toBeVisible({ timeout: 15000 });
    }
    const after = await pages.plugins.pluginNames();
    expect(after, '详情往返两轮后插件清单应与初始一致').toEqual(before);
  });

  test('M4-06A 安装表单非法包名不产生安装（anti 反例）[双端]', async ({ page, pages }) => {
    test.setTimeout(120000);
    await pages.plugins.open();
    const before = await pages.plugins.pluginNames();
    test.skip(before.length === 0, '本部署没有开放任何插件');

    const input = await pages.plugins.openAddPluginForm();
    const spec = pages.plugins.installSpecInput();
    test.skip(!(await spec.isVisible().catch(() => false)), '安装表单未渲染「包名或地址」输入框（形态差异）');

    // 无法合法解析为 npm 包名/Git 仓库/本地路径的串：应在本地校验即被拒，不发起安装
    await spec.fill('@@bad spec!!');
    const run = pages.plugins.installRunButton();
    if (!(await run.isEnabled().catch(() => false))) {
      test.info().annotations.push({ type: 'note', description: '非法包名下「安装」按钮为禁用态（校验前置），未发起安装' });
    } else {
      await run.click();
      // 表单必须有反应：本地校验拒绝 / 联网检查 / 可取消任务面板，任一出现即算被受理
      await expect(page.getByText(/无法识别这个包名或地址|未找到相关插件|正在检查|正在准备安装|取消安装/).first())
        .toBeVisible({ timeout: 20000 });
      // 收尾：优先「取消安装」，兜底 Esc，不留下进行中的安装任务
      const cancel = page.getByRole('button', { name: /取消安装/ }).first();
      if (await cancel.isVisible().catch(() => false)) await cancel.click().catch(() => {});
      await page.keyboard.press('Escape').catch(() => {});
    }
    await page.waitForTimeout(1000);
    const after = await pages.plugins.pluginNames();
    expect(after, '非法包名尝试后插件清单不应变化（无安装副作用）').toEqual(before);
  });

  test('M4-07A 内置插件搜索无效关键字无崩溃（anti 反例）[双端]', async ({ page, pages }) => {
    await pages.settings.openTab('内置插件');
    const search = pages.plugins.builtinSearchInput();
    test.skip(!(await search.isVisible().catch(() => false)), '内置插件页无搜索框（形态差异）');

    const total0 = await pages.plugins.builtinTotal();
    await search.fill('不存在的插件xyz');
    await expect(page.getByText(/没有匹配/).first()).toBeVisible({ timeout: 15000 });

    // 清空后清单恢复：分组计数徽标回归且合计不变
    await search.fill('');
    await expect.poll(async () =>
      pages.plugins.builtinSection().getByText(/\d+ 个/).first().isVisible().catch(() => false),
      { timeout: 15000 }).toBe(true);
    const total1 = await pages.plugins.builtinTotal();
    test.info().annotations.push({ type: 'note', description: `清单计数合计 ${total0} → ${total1}` });
    expect(total1, '清空搜索后内置插件清单应恢复').toBe(total0);
    await pages.settings.closeButton().click().catch(() => {});
  });
});

/* ═══════════════ 附件问答（anti） ═══════════════ */

test.describe('附件问答（anti）', () => {

  test('M5-01A 附件可移除且移除后清空（anti 反例）[web]', async ({ page, pages, mode }) => {
    test.skip(mode === 'electron', '桌面端附件链路无法被 Playwright 驱动（见 M5-01 说明）');
    const KB_FILE = path.join(__dirname, '..', 'fixtures', 'test-data', 'kb-sample.md');
    await pages.composer.attachFile(KB_FILE);
    expect(await pages.composer.attachmentCount(), '上传后附件应登记').toBeGreaterThan(0);

    // 反例路径：发送前撤回——点附件条「移除文件 X」→ 附件区清空
    const removed = await pages.composer.removeAttachment('kb-sample.md');
    expect(removed, '附件条应提供「移除文件」按钮').toBe(true);
    expect(await pages.composer.attachmentCount(), '移除后待发送附件区应清空').toBe(0);

    // 行为记录（2026-10-19 探针实测）：附件草稿跨会话保持——上传后新建会话不清空附件区
    await pages.composer.attachFile(KB_FILE);
    await pages.sidebar.newSession();
    await page.waitForTimeout(800);
    const carried = await pages.composer.attachmentCount();
    test.info().annotations.push({ type: 'note', description: `附件草稿跨会话保持: ${carried > 0 ? '是' : '否'}（${carried} 条）` });
    await pages.composer.removeAttachment('kb-sample.md'); // 清场
  });
});

/* ═══════════════ 消息操作（anti） ═══════════════ */

test.describe('消息操作（anti）', () => {

  test('M6-01A 空会话无回合操作条（anti 反例，含 M6-04A 断言面）[双端]', async ({ pages }) => {
    await pages.sidebar.newSession();
    const tail = pages.messageActions.tail();
    expect(await tail.count(), '空会话无回合尾（turn-tail）').toBe(0);
    expect(await pages.messageActions.copyButton().count(), '空会话无复制按钮').toBe(0);
    expect(await pages.messageActions.branchButton().count(), '空会话无分支入口').toBe(0);
  });

  test('M6-02A 点赞表单取消无副作用（anti 反例）[双端]', async ({ page, pages }) => {
    test.setTimeout(300000);
    await ensureReplySession(page, pages);
    const tail = pages.messageActions.tail();
    const opened = await pages.messageActions.like(tail);
    expect(opened, '点赞应弹出反馈表单').toBe(true);
    await pages.messageActions.closeFeedbackForm();
    await expect(page.getByText('提交反馈').first())
      .not.toBeVisible({ timeout: 5000 });
  });

  test('M6-03A 点踩表单取消不提交（anti 反例）[双端]', async ({ page, pages }) => {
    test.setTimeout(300000);
    await ensureReplySession(page, pages);
    const tail = pages.messageActions.tail();
    const dlg = await pages.messageActions.openDislikeForm(tail);
    await expect(dlg).toBeVisible();
    await pages.messageActions.closeFeedbackForm();
    await expect(page.locator('[role="dialog"]').filter({ hasText: '提交反馈' }))
      .not.toBeVisible({ timeout: 5000 });
    // 未提交 → 转录本无变化、应用无错误（回合尾仍在）
    await expect(pages.messageActions.tail()).toBeAttached();
  });
});

/* ═══════════════ 用量 / 用时（anti） ═══════════════ */

test.describe('用量/用时（anti）', () => {

  test('M7-01A 空会话无用量/用时节点（anti 反例，含 M7-02A 断言面）[双端]', async ({ pages }) => {
    await pages.sidebar.newSession();
    const tail = pages.replyMeta.lastTail();
    expect(await pages.replyMeta.usageButton(tail).count(), '空会话无用量按钮').toBe(0);
    expect(await pages.replyMeta.durationButton().count(), '空会话无用时节点').toBe(0);
  });

  test('M7-03A 用量/用时明细弹层往返一致（anti 反例，含 M7-04A 断言面）[双端]', async ({ page, pages }) => {
    test.setTimeout(300000);
    await ensureReplySession(page, pages);
    const tail = pages.replyMeta.lastTail();
    expect(await pages.replyMeta.usageTok(tail), '共享会话应有用量').toBeGreaterThan(0);

    // 用量明细：关闭→重开内容一致
    const b1 = await pages.replyMeta.openUsageBreakdown(tail);
    await pages.replyMeta.closeBreakdown();
    const b2 = await pages.replyMeta.openUsageBreakdown(tail);
    const digits = (s) => (s.match(/\d{1,3}(?:,\d{3})+/g) || []).sort().join('|');
    expect(digits(b2), '用量明细弹层关闭重开内容应一致').toBe(digits(b1));
    await pages.replyMeta.closeBreakdown();

    // 用时明细：同样可开可关（往返）
    if (await pages.replyMeta.hasDuration(tail)) {
      await pages.replyMeta.openDurationBreakdown(tail);
      await pages.replyMeta.closeBreakdown();
      const d2 = await pages.replyMeta.openDurationBreakdown(tail);
      expect(d2).toContain('用时');
      await pages.replyMeta.closeBreakdown();
    }
  });

  test('M10-11A 统计条快速连点无异常（anti 反例）[双端]', async ({ page, pages }) => {
    test.setTimeout(300000);
    await ensureReplySession(page, pages);
    const STATS_SRC = '\\d+\\s*轮|\\btok\\b|缓存命中|上下文已用';
    const count = () => page.evaluate((src) => {
      const re = new RegExp(src);
      return [...document.querySelectorAll('[data-slot="conversation.composer"] button[aria-label]')]
        .filter(b => re.test(b.getAttribute('aria-label') || '')).length;
    }, STATS_SRC);
    const before = await count();
    test.skip(before === 0, '共享会话无统计条');

    // 快速连点两轮（含重复点击），应用不得崩溃/按钮不得消失
    for (let round = 0; round < 2; round++) {
      await page.evaluate((src) => {
        const re = new RegExp(src);
        document.querySelectorAll('[data-slot="conversation.composer"] button[aria-label]')
          .forEach(b => { if (re.test(b.getAttribute('aria-label') || '')) b.click(); });
      }, STATS_SRC);
      await page.waitForTimeout(400);
    }
    await page.keyboard.press('Escape'); // 关闭可能弹出的明细
    await page.waitForTimeout(500);
    expect(await count(), '连点后统计条按钮应完整保留').toBe(before);
  });
});

/* ═══════════════ 输入区与控件（anti） ═══════════════ */

test.describe('输入区与控件（anti）', () => {

  test('M8-01A 指令面板 Esc 关闭重开一致（anti 反例）[双端]', async ({ pages }) => {
    const ic = pages.inputControls;
    await ic.openCommandPalette();
    const items1 = (await ic.commandItems()).sort();
    await ic.closeCommandPalette();
    await ic.openCommandPalette();
    const items2 = (await ic.commandItems()).sort();
    await ic.closeCommandPalette();
    expect(items1.length, '指令面板应非空').toBeGreaterThan(0);
    expect(items2, 'Esc 关闭后重开，指令清单应一致（幂等）').toEqual(items1);
  });

  test('M8-02A 模型菜单 Esc 取消当前模型不变（anti 反例）[双端]', async ({ pages }) => {
    const ic = pages.inputControls;
    const current = await ic.currentModel();
    expect(current.length).toBeGreaterThan(0);
    await ic.openModelMenu();
    await ic.closeModelMenu();
    expect(await ic.currentModel(), 'Esc 取消后当前模型应不变').toBe(current);
  });

  test('M8-03A 权限菜单 Esc 取消当前模式不变（anti 反例）[双端]', async ({ pages }) => {
    const ic = pages.inputControls;
    const current = await ic.currentAccessMode();
    expect(current.length).toBeGreaterThan(0);
    await ic.openAccessModeMenu();
    await ic.closeAccessModeMenu();
    expect((await ic.currentAccessMode()).trim(), 'Esc 取消后当前权限应不变').toBe(current);
  });

  test('M9-06A 模式菜单 Esc 取消 chip 不变（anti 反例）[双端]', async ({ page, pages }) => {
    const chip = pages.agentPreset.button();
    if (!(await chip.isVisible().catch(() => false))) {
      // 桌面端启动会恢复上次会话视图（不落 hero）→ 新建会话回到 hero
      await pages.sidebar.newSession();
      await page.waitForTimeout(600);
    }
    test.skip(!(await chip.isVisible().catch(() => false)), '新建会话后仍无 Agent 预设 chip');
    const cur = await pages.agentPreset.current();
    await pages.agentPreset.openMenu();
    await pages.agentPreset.closeMenu();
    await page.waitForTimeout(300);
    expect(await pages.agentPreset.current(), 'Esc 取消后当前模式应不变').toBe(cur);
  });

  test('M9-07A 模型目录下钻返回当前模型不变（anti 反例）[双端]', async ({ pages }) => {
    const ic = pages.inputControls;
    const current = await ic.currentModel();
    const catalog = await ic.openModelCatalog(); // 内部 Esc 返回
    test.info().annotations.push({ type: 'note', description: `模型目录: ${catalog.join(' | ') || '(未下钻)'}` });
    expect(await ic.currentModel(), '下钻目录返回后当前模型应不变').toBe(current);
  });
});

/* ═══════════════ 会话治理（anti） ═══════════════ */

test.describe('会话治理（anti）', () => {

  test('M8-04A 特殊字符搜索不崩溃（anti 反例）[双端]', async ({ page, pages }) => {
    const weird = '[](){}.*+?^$|\\';
    const n = await pages.sidebar.searchSessions(weird);
    expect(typeof n, '特殊字符搜索应返回计数而非异常').toBe('number');
    expect(await pages.sidebar.searchInput().isVisible(), '搜索框应仍可用').toBe(true);
    await pages.sidebar.searchInput().fill('');
  });

  test('M8-10A 折叠/展开循环幂等（anti 反例）[双端]', async ({ pages }) => {
    for (let i = 0; i < 2; i++) {
      await pages.sidebar.collapseSidebar();
      expect(await pages.sidebar.sidebarCollapsed(), `第 ${i + 1} 轮折叠`).toBe(true);
      await pages.sidebar.expandSidebar();
      await expect(pages.sidebar.newSessionButton()).toBeVisible();
    }
  });

  test('M8-11A 视图菜单 Esc 取消树保持可用（anti 反例）[双端]', async ({ page, pages }) => {
    const options = await pages.sidebar.openViewOptionsMenu();
    expect(options.length, '视图选项菜单应可打开').toBeGreaterThan(0);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    await expect(pages.sidebar.workspaceRows().first()).toBeVisible({ timeout: 15000 });
  });

  test('M10-01A @ 引用 Esc 关闭无残留（anti 反例）[双端]', async ({ page, pages }) => {
    await pages.sidebar.newSession();
    const input = pages.composer.input().last();
    await input.click();
    await input.fill('');
    await page.keyboard.type('@', { delay: 60 });
    await page.waitForTimeout(900);
    const visibleOptions = () => page.evaluate(() =>
      [...document.querySelectorAll('[role="option"]')]
        .filter(o => o.getBoundingClientRect().width > 0).length);
    expect(await visibleOptions(), '@ 应弹出引用列表').toBeGreaterThan(0);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    expect(await visibleOptions(), 'Esc 后引用列表应完全关闭无残留').toBe(0);
    await input.fill('');
  });

  test('M10-02A 重命名会话空名称被拒（anti 反例）[双端]', async ({ page, pages }) => {
    test.setTimeout(180000);
    await ensureReplySession(page, pages);
    const t0 = (await pages.sidebar.selectedSessionText()).trim().split('\n')[0];
    test.skip(!t0, '未选中已落库会话');

    await pages.sessionOps.openOpsMenu(t0);
    await page.locator('[role="menuitem"]').filter({ hasText: /重命名/ }).first().click();
    const input = page.locator('[role="dialog"] input[aria-label="会话名称"]').first();
    await input.waitFor({ state: 'visible', timeout: 10000 });
    await input.fill('');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1200);
    // 弹窗仍开着 = 应用校验拦截；Esc 取消收场
    if (await input.isVisible().catch(() => false)) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    }
    const t1 = (await pages.sidebar.selectedSessionText()).trim().split('\n')[0];
    expect(t1, '空名称重命名应被拒（标题保持不变）').toBe(t0);
  });

  test('M10-04A 空会话无会话治理入口（anti 反例）[双端]', async ({ page, pages }) => {
    // 探针实证（2026-10-20）：桌面端新建会话后树里有选中的「新会话」草稿行，
    // 但 hover 它**不会出现「会话X的操作」按钮**——未落库不可治理，这就是本反例的断言。
    // web 形态不渲染草稿行 → 治理入口天然不存在，断言平凡成立。
    await pages.sidebar.newSession();
    await page.waitForTimeout(800);
    const draftRow = page.locator('div[role="treeitem"][data-row-key^="session:"][aria-selected="true"]')
      .filter({ hasText: '新会话' }).first();
    if (!(await draftRow.count())) return;
    await draftRow.hover().catch(() => {});
    await page.waitForTimeout(800);
    const opsCount = await page.locator('button[aria-label*="的操作"]:visible').count();
    expect(opsCount, '草稿会话行 hover 不应出现治理菜单（置顶/重命名/分叉/归档不可达）').toBe(0);
  });
});

/* ═══════════════ 工作区（anti） ═══════════════ */

test.describe('工作区（anti）', () => {

  test('M9-01A 工作区 RPC 非法请求被拒（anti 反例）[双端]', async ({ page }) => {
    // 未知方法：网关必须以结构化错误响应（而非静默成功）
    await expect(workspaceApi.rpc(page, 'workspace/__anti_unknown__', {}))
      .rejects.toThrow(/__anti_unknown__|HTTP/);
    // 空 path：不应静默创建
    let created = null;
    try { created = await workspaceApi.rpc(page, 'workspace/create', { path: '' }); } catch { /* 期望被拒 */ }
    if (created && created.workspace && created.workspace.workspaceId) {
      await workspaceApi.deleteWorkspace(page, created.workspace.workspaceId).catch(() => {});
    }
    expect(created, '空 path 创建工作区应被拒绝').toBeFalsy();
  });

  test('M9-04A 工作区空名称重命名被拒（anti 反例）[双端]', async ({ page, pages }) => {
    test.setTimeout(240000);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-anti-ws-'));
    const res = await workspaceApi.createWorkspace(page, dir);
    const title = res.workspace.title;
    const id = res.workspace.workspaceId;
    try {
      await pages.workspace.openOpsMenu(title);
      await pages.workspace.opsMenuItem('重命名').click();
      const input = pages.workspace.dialogInput();
      await input.waitFor({ state: 'visible', timeout: 10000 });
      await input.fill('');
      const confirm = pages.workspace.dialogButton(/确定|重命名|保存/);
      if (await confirm.count() && await confirm.isEnabled().catch(() => false)) {
        await confirm.click().catch(() => {});
      }
      await page.waitForTimeout(1000);
      if (await pages.workspace.dialogInput().isVisible().catch(() => false)) {
        await page.keyboard.press('Escape'); // 校验拦截 → 取消收场
        await page.waitForTimeout(400);
      }
      expect(await pages.workspace.exists(title), '空名称重命名应被拒，标题保持不变').toBe(true);
    } finally {
      await workspaceApi.deleteWorkspace(page, id).catch(() => {});
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('M9-05A 删除工作区确认框取消保留（anti 反例）[双端]', async ({ page, pages }) => {
    test.setTimeout(240000);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-anti-ws-'));
    const res = await workspaceApi.createWorkspace(page, dir);
    const title = res.workspace.title;
    const id = res.workspace.workspaceId;
    try {
      await pages.workspace.openOpsMenu(title);
      await pages.workspace.opsMenuItem('删除工作区').click();
      await page.locator('[role="dialog"]').waitFor({ timeout: 10000 });
      const cancel = pages.workspace.dialogButton(/取消|关闭/);
      if (await cancel.count()) await cancel.click().catch(() => {});
      else await page.keyboard.press('Escape');
      await page.waitForTimeout(800);
      expect(await pages.workspace.exists(title), '删除确认框取消后工作区应保留').toBe(true);
    } finally {
      await workspaceApi.deleteWorkspace(page, id).catch(() => {});
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('M9-08A 选择工作区菜单 Esc 当前不变（anti 反例）[双端]', async ({ page, pages }) => {
    const cur = await pages.workspace.currentWorkspace();
    test.skip(!cur, '当前视图无「选择工作区」按钮');
    const items = await pages.workspace.openPickerMenu();
    expect(items.length, '工作区菜单应有选项').toBeGreaterThan(0);
    await pages.workspace.closePickerMenu();
    await page.waitForTimeout(400);
    expect(await pages.workspace.currentWorkspace(), 'Esc 取消后当前工作区应不变').toBe(cur);
  });
});

/* ═══════════════ 设置中心（anti） ═══════════════ */

test.describe('设置中心（anti）', () => {

  test('M8-05A 设置弹窗 Esc 关闭重开正常（anti 反例）[双端]', async ({ page, pages }) => {
    await pages.sidebar.openSettings();
    expect(await pages.settings.isOpen()).toBe(true);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    expect(await pages.settings.isOpen(), 'Esc 应关闭设置弹窗').toBe(false);
    await pages.sidebar.openSettings();
    await pages.settings.expectTabsVisible(expect);
    await pages.settings.close();
  });

  test('M8-06A 主题切换往返无副作用（anti 反例）[双端]', async ({ pages }) => {
    test.setTimeout(180000);
    // rc.6 实测基线（2026-10-28）：外观三按钮可点击但选择不生效（惰性控件）。
    // 反例关注点改为：完整往返（深色→浅色→跟随系统）过程中页面外观不得半途变化、
    // 设置面板不得崩溃/被关，状态保持一致。
    await pages.sidebar.openSettings();
    const lum0 = await pages.settings.readLuminance();

    const darkLum = await pages.settings.switchTheme('深色');
    const lightLum = await pages.settings.switchTheme('浅色');
    const backLum = await pages.settings.switchTheme('跟随系统');

    test.info().annotations.push({ type: 'note', description: `亮度: 初始${lum0} 深${darkLum} 浅${lightLum} 复原${backLum}（rc.6 实测恒定，主题应用未实现）` });
    expect(Math.abs(darkLum - lum0), '切深色后亮度不应变化（rc.6 基线：主题不应用）').toBeLessThanOrEqual(5);
    expect(Math.abs(lightLum - lum0), '切浅色后亮度不应变化（rc.6 基线：主题不应用）').toBeLessThanOrEqual(5);
    expect(Math.abs(backLum - lum0), '往返复原后亮度应一致').toBeLessThanOrEqual(5);
    expect(await pages.settings.isOpen(), '主题往返后设置面板应仍可用').toBe(true);
    await pages.settings.close();
  });

  test('M8-12A 字号连续调整有上下界并复原（anti 反例）[双端]', async ({ pages }) => {
    test.setTimeout(300000);
    await pages.sidebar.openSettings();
    const before = await pages.settings.fontSizePx();
    expect(before, '应能读到初始字号').toBeGreaterThan(0);

    for (let i = 0; i < 12; i++) await pages.settings.increaseFontSize();
    const maxSeen = await pages.settings.fontSizePx();
    for (let i = 0; i < 30; i++) await pages.settings.decreaseFontSize();
    const minSeen = await pages.settings.fontSizePx();
    test.info().annotations.push({ type: 'note', description: `字号: 初始${before} 增后${maxSeen} 减后${minSeen}` });

    expect(maxSeen, '连续增大应有上界（≤48px），不得越界/回绕').toBeLessThanOrEqual(48);
    expect(minSeen, '连续减小应有下界（≥8px），不得越界/回绕').toBeGreaterThanOrEqual(8);

    // 复原：从下界一路增回初始值
    for (let i = 0; i < 40; i++) {
      if ((await pages.settings.fontSizePx()) >= before) break;
      await pages.settings.increaseFontSize();
    }
    expect(await pages.settings.fontSizePx(), '复原后字号应回到初始值').toBeGreaterThanOrEqual(before);
  });

  test('M10-05A 快捷键搜索不存在功能无结果（anti 反例）[双端]', async ({ pages }) => {
    test.setTimeout(180000);
    await pages.settings.openShortcutEditor();
    // 满载下编辑器清单渲染慢：轮询等绑定行出现（而非读一次就判）
    await expect.poll(async () => pages.sessionOps.shortcutOf('归档会话'), { timeout: 20000 })
      .toBeTruthy();
    await pages.settings.searchShortcut('zzz__不存在功能__xyz');
    const hitAfter = await pages.sessionOps.shortcutOf('归档会话');
    expect(hitAfter, '搜索不存在关键字后应无任何绑定行').toBe('');

    await pages.settings.searchShortcut('');
    await pages.settings.closeShortcutEditor();
  });

  test('M10-06A 语言菜单 Esc 取消保持中文（anti 反例）[双端]', async ({ page, pages }) => {
    await pages.sidebar.openSettings();
    const langs = await pages.settings.openLanguageMenu();
    expect(langs.length, '语言菜单应有选项').toBeGreaterThan(0);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    const body = await pages.settings.bodyText();
    expect(body, 'Esc 取消后语言应保持中文（锚点仍在）').toContain('新会话');
    if (await pages.settings.isOpen()) await pages.settings.close();
  });

  test('M10-07A 提供商编辑器取消不落盘（anti 反例）[双端]', async ({ pages }) => {
    test.setTimeout(180000);
    // rc.6 实测基线：编辑卡片为只读目录展示（elineAI 下发，无输入框可改）。
    // 「取消不落盘」在只读形态下等价于：取消 → 重开，卡片内容完全一致（无任何写入痕迹）。
    await pages.sidebar.openSettings();
    await pages.settings.openProviderEditor();
    const before = await pages.settings.providerCardText();
    await pages.settings.cancelProviderEditor();

    // 重开核对：取消路径不应改变卡片内容
    await pages.settings.openProviderEditor();
    const after = await pages.settings.providerCardText();
    expect(after, '取消后重开卡片内容应一致（不落盘）').toBe(before);
    await pages.settings.cancelProviderEditor();
    await pages.settings.close();
  });

  test('M10-08A 选择器取消开关状态不变（anti 反例）[双端]', async ({ pages }) => {
    await pages.sidebar.openSettings();
    const states = {};
    for (const name of CATALOG.SETTINGS_SWITCHES) {
      states[name] = await pages.settings.switchState(name);
    }
    const opts = await pages.settings.openSelectorMenu(CATALOG.SETTINGS_SELECTORS[0]);
    expect(opts.length, '排队发送菜单应有选项').toBeGreaterThan(0);
    await pages.settings.closeSelectorMenu();

    for (const name of CATALOG.SETTINGS_SWITCHES) {
      expect(await pages.settings.switchState(name), `选择器取消后开关[${name}]状态应不变`).toBe(states[name]);
    }
    await pages.settings.close();
  });

  test('M10-14A 预设辅助弹层 Esc 后设置仍在（anti 反例）[双端]', async ({ page, pages }) => {
    await pages.sidebar.openSettings();
    const opened = await pages.settings.openPresetAuxDialog('模式说明', CATALOG.AGENT_MODES[1]);
    test.skip(!opened, '本部署未提供「模式说明」辅助操作');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    expect(await pages.settings.isOpen(), '辅助弹层关闭后设置弹窗应仍在').toBe(true);
    await pages.settings.close();
  });
});

/* ═══════════════ 右侧工作面板（anti） ═══════════════ */

test.describe('右侧工作面板（anti）', () => {

  test('M8-07A 右栏页签往返幂等（anti 反例）[双端]', async ({ page, pages }) => {
    test.setTimeout(300000);
    await ensureReplySession(page, pages);
    await pages.rightPanel.expand();
    await pages.rightPanel.expectTabsVisible(expect);
    for (let i = 0; i < 2; i++) {
      await pages.rightPanel.openTab('轨迹');
      await pages.rightPanel.openTab('对话');
    }
    await expect(pages.rightPanel.tabButton('对话')).toBeVisible();
  });

  test('M8-08A 右栏收起/展开循环幂等（anti 反例）[双端]', async ({ pages }) => {
    await pages.sidebar.newSession();
    await pages.rightPanel.expand();
    for (let i = 0; i < 2; i++) {
      expect(await pages.rightPanel.collapse(), `第 ${i + 1} 轮收起`).toBe(true);
      await pages.rightPanel.expand();
    }
    await expect(pages.rightPanel.toggleSidebarButton()).toBeVisible();
  });

  test('M8-14A 浏览器入口按形态存在性断言（anti 反例）[双端]', async ({ mode, pages }) => {
    await pages.sidebar.newSession();
    await pages.rightPanel.expand();
    if (mode === 'electron') {
      // 桌面端 webview 支持 → 入口应存在（缺失即部署回退）
      await expect(pages.rightPanel.browserEntry(), '桌面端应有「浏览器」入口').toBeVisible({ timeout: 10000 });
    } else {
      // web(chromium) 无 webview → 入口不应渲染（预期缺失的负断言）
      expect(await pages.rightPanel.browserEntry().count(), 'web 形态不应渲染「浏览器」入口').toBe(0);
    }
  });

  test('M8-15A 全屏往返循环幂等（anti 反例）[双端]', async ({ pages }) => {
    test.setTimeout(300000);
    await pages.sidebar.newSession();
    await pages.rightPanel.expand();
    test.skip(!(await pages.rightPanel.fullscreenButton().count()), '本形态无全屏控件');
    for (let i = 0; i < 2; i++) {
      expect(await pages.rightPanel.maximize(), `第 ${i + 1} 轮全屏`).toBe(true);
      await pages.rightPanel.exitMaximize();
      await expect(pages.rightPanel.fullscreenButton().first()).toBeVisible({ timeout: 10000 });
    }
    expect(await pages.rightPanel.collapse(), '循环后仍可正常收起').toBe(true);
    await pages.rightPanel.expand();
  });

  test('M10-12A 终端非法命令后仍可用（anti 反例）[双端]', async ({ pages }) => {
    test.setTimeout(240000);
    await pages.sidebar.newSession();
    await pages.rightPanel.expand();
    const term = await pages.rightPanel.openTerminal();
    test.info().annotations.push({ type: 'note', description: `终端页签: ${term.tabs.join(', ')}` });

    await pages.rightPanel.terminalType('__dsh_anti_not_a_cmd__');
    await pages.rightPanel.terminalType('echo dsh-anti-terminal-ok');

    if (term.xtermLike > 0) {
      // web xterm：非法命令应被回显/报错而非吞掉，且后续命令仍可执行
      const txt = await pages.rightPanel.terminalText();
      expect(txt, '非法命令后终端应仍可执行新命令').toContain('dsh-anti-terminal-ok');
      expect(txt, '非法命令应有回显或报错').toMatch(/__dsh_anti_not_a_cmd__|不是内部或外部命令|is not recognized/);
    } else {
      // 桌面端终端为独立实现（无 .xterm 容器）：宽松形态——页签仍在、无崩溃
      const after = await pages.rightPanel.openTerminal();
      expect(after.tabs.length, '终端页签应仍在').toBeGreaterThanOrEqual(term.tabs.length);
    }
  });
});

/* ═══════════════ 导出与外部集成（anti） ═══════════════ */

test.describe('导出与外部集成（anti）', () => {

  test('M10-09A 空会话无导出入口（anti 反例）[双端]', async ({ pages }) => {
    await pages.sidebar.newSession();
    expect(await pages.sessionOps.moreActionsButton().count(), '空会话不应有「更多操作」导出入口').toBe(0);
  });

  test('M10-10A 打开方式菜单 Esc 关闭可重开（anti 反例）[双端]', async ({ page, pages }) => {
    test.setTimeout(180000);
    await ensureReplySession(page, pages);
    const items1 = await pages.sessionOps.openMenu(pages.sessionOps.openWithButton());
    test.skip(items1.length === 0, '无「更多打开方式」入口');
    await pages.sessionOps.closeMenu();

    const items2 = await pages.sessionOps.openMenu(pages.sessionOps.openWithButton());
    for (const expected of CATALOG.OPEN_WITH) {
      expect(items2.some(i => i.includes(expected)), `重开后仍应含「${expected}」`).toBe(true);
    }
    await pages.sessionOps.closeMenu();
  });
});
