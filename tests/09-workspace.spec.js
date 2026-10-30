// @ts-check
/**
 * 模块九：工作区
 *
 * 官方版工作区模型与社区版**根本不同**（2026-10 真机探测）：
 *   社区版：侧栏底部常驻「选择工作区」按钮 → 点开菜单选工作区
 *   官方版：**没有该按钮**。侧栏是工作区树（data-row-key="workspace:<uuid>"），
 *           点击工作区行只是展开/折叠；「当前工作区」不体现在树上，
 *           而是「在哪个工作区里新建会话」——官方版为此新增了
 *           button[aria-label="在“<title>”中新建会话"]。
 *
 * 因此本模块不再有「读取当前工作区」这类断言，改用三个稳定信号：
 *   树行文本 / 「在 X 中新建会话」/ 「工作区“X”的操作」（重命名·删除）
 *
 * 「添加工作区」的 UI 会拉起目录选择器（OS 级或应用内），自动化仍走
 * fixtures/workspace-api 的同源 RPC 创建，再用树断言确认。
 *
 * M9-01 添加工作区（RPC 创建 → 工作区树出现）
 * M9-02 在指定工作区中新建会话（会话归属该工作区）
 * M9-03 新工作区内发消息（消息上屏）
 * M9-04 重命名工作区（操作菜单 → 弹窗表单）
 * M9-05 删除工作区（操作菜单 → 确认弹窗 → 树中消失）
 * M9-06 Agent 预设切换（eline 五模式：外贸专家/标准/PTC/极简/创造）
 * M9-07 模型选择（当前模型与可选列表）
 * M9-08 选择工作区按钮（eline 恢复的常驻选择器：当前工作区/菜单/添加工作区入口）
 * M9-09 工作区树按目录层级嵌套渲染（父/子目录各加为工作区 → 树形缩进）
 */
const { test, expect } = require('../fixtures/app.fixtures');
const { createWorkspace, deleteWorkspace } = require('../fixtures/workspace-api');
const CATALOG = require('../fixtures/test-data/ui-catalog');
const fs = require('fs');
const os = require('os');
const path = require('path');

test.describe.configure({ mode: 'serial' });

test.describe('工作区', () => {
  const STAMP = Date.now().toString(36);
  let WS_TITLE = `ws-autotest-${STAMP}`;   // 工作区标题 = 所采用文件夹名
  let RENAMED_TITLE = `${WS_TITLE}-renamed`;
  let wsDir = '';
  let wsId = '';

  test.beforeAll(() => {
    wsDir = fs.mkdtempSync(path.join(os.tmpdir(), `dsh-ws-${STAMP}-`));
  });

  test.afterAll(async ({ browser }) => {
    // RPC 兜底清理：UI 删除用例若失败中断，仍保证工作区不残留
    if (wsId) {
      try {
        const ctx = await browser.newContext({ storageState: path.join(__dirname, '..', '.auth', 'dsh-state.json') });
        const p = await ctx.newPage();
        await p.goto('/', { waitUntil: 'domcontentloaded' }).catch(() => {});
        await deleteWorkspace(p, wsId).catch(() => {});
        await ctx.close();
      } catch { /* electron 形态无独立 browser/服务，跳过 */ }
    }
    try { fs.rmSync(wsDir, { recursive: true, force: true }); } catch {}
  });

  test.beforeEach(async ({ pages }) => {
    await pages.sidebar.openApp();
  });

  test('M9-01 添加工作区（RPC 创建 → 工作区树出现）[双端]', async ({ pages }) => {
    const w = pages.workspace;
    const created = await createWorkspace(pages.sidebar.page, wsDir);
    wsId = created.workspace.workspaceId;
    WS_TITLE = (created.workspace.title || WS_TITLE).trim();
    RENAMED_TITLE = `${WS_TITLE}-renamed`;

    await expect.poll(() => w.exists(WS_TITLE), { timeout: 20000 })
      .toBe(true);
    test.info().annotations.push({ type: 'note', description: `工作区: ${WS_TITLE}` });
  });

  test('M9-02 在指定工作区中新建会话（会话归属该工作区）[双端]', async ({ pages }) => {
    test.setTimeout(120000);
    const w = pages.workspace;

    await w.newSessionIn(WS_TITLE);
    // 该工作区内应出现一个会话行（官方版为「在 X 中新建会话」直接落库到该工作区）
    await expect.poll(() => w.sessionRows().count(), { timeout: 20000 }).toBeGreaterThan(0);

    await w.newSessionIn(WS_TITLE).catch(() => {});
    test.info().annotations.push({ type: 'note', description: `已在「${WS_TITLE}」中新建会话` });
  });

  test('M9-03 新工作区内发消息（消息上屏）[双端]', async ({ pages }) => {
    test.setTimeout(150000);
    const w = pages.workspace;
    await w.newSessionIn(WS_TITLE);

    const MSG = `工作区用例消息(${STAMP})`;
    await pages.composer.send(MSG);
    // 用户消息上屏即证明会话归属新工作区（不等待 LLM 回复，M3 已覆盖回复链路）
    await expect(pages.transcript.userBubble(MSG)).toBeVisible({ timeout: 20000 });
  });

  test('M9-04 重命名工作区 [双端]', async ({ pages }) => {
    const w = pages.workspace;
    await w.renameViaUi(WS_TITLE, RENAMED_TITLE);

    await expect.poll(() => w.exists(RENAMED_TITLE), { timeout: 20000 }).toBe(true);
    expect(await w.exists(WS_TITLE), '旧标题应消失').toBe(false);
    test.info().annotations.push({ type: 'note', description: `${WS_TITLE} → ${RENAMED_TITLE}` });
  });

  test('M9-05 删除工作区 [双端]', async ({ pages }) => {
    const w = pages.workspace;
    await w.deleteViaUi(RENAMED_TITLE);

    await expect.poll(() => w.exists(RENAMED_TITLE), { timeout: 20000 }).toBe(false);
    // 应用应仍然可用（删除不应把界面打崩）
    await expect(pages.sidebar.newSessionButton()).toBeVisible();
    wsId = ''; // UI 已删除，afterAll 无需再清
  });

  test('M9-06 Agent 预设切换（按目录往返）[双端]', async ({ pages }) => {
    test.setTimeout(120000);
    const ap = pages.agentPreset;
    // Agent 预设 chip 只在首页 hero 态渲染，先回首页
    await pages.sidebar.newSession();
    await pages.sidebar.openApp();

    const original = await ap.current();
    const presets = await ap.openMenu();
    await ap.closeMenu();
    // 数据驱动：目录中的模式（外贸专家/标准/PTC/极简/创造）应全部出现
    for (const mode of CATALOG.AGENT_MODES) {
      expect(presets.some(p => p.includes(mode)), `预设菜单应含「${mode}」`).toBe(true);
    }

    const target = presets.find(p => p !== original) || presets[0];
    await ap.switchTo(target);
    expect(await ap.current(), '切换后应显示新预设').toBe(target);

    await ap.switchTo(original);
    expect(await ap.current(), '应可切回原预设').toBe(original);
    test.info().annotations.push({ type: 'note', description: `往返: ${original} → ${target} → ${original}` });
  });

  test('M9-07 模型选择（当前模型与可选列表）[双端]', async ({ pages }) => {
    const ic = pages.inputControls;
    const current = await ic.currentModel();
    expect(current, '当前模型名可读').toBeTruthy();

    const models = await ic.openModelMenu();
    await ic.closeModelMenu();
    expect(models, '模型菜单应包含当前模型').toContain(current);

    // 下钻模型目录拿可选清单（数据驱动：目录显示名与 trigger 名无干净映射，比对 ui-catalog.MODEL_CATALOG）
    const catalog = await ic.openModelCatalog().catch(() => []);
    test.info().annotations.push({ type: 'note', description: `当前: ${current}；目录: ${catalog.join(', ') || '(未取到)'}` });
    for (const model of CATALOG.MODEL_CATALOG) {
      expect(catalog.some(c => c.toLowerCase().replace(/[^a-z0-9]/g, '').includes(model.toLowerCase().replace(/[^a-z0-9]/g, ''))),
        `模型目录应含「${model}」`).toBe(true);
    }
    test.skip(catalog.length <= 1, '当前部署模型目录仅一个可选模型，无切换对象');
  });

  test('M9-08 选择工作区按钮（当前工作区 / 菜单 / 添加工作区入口）[双端]', async ({ pages }) => {
    const w = pages.workspace;
    // 选择器是首页 hero 的常驻控件；先回首页
    await pages.sidebar.newSession();
    await pages.sidebar.openApp();

    const current = await w.currentWorkspace();
    test.info().annotations.push({ type: 'note', description: `当前工作区: ${current || '(按钮未渲染)'}` });
    expect(current, '选择工作区按钮应显示当前工作区名').toBeTruthy();

    // 菜单：工作区列表 + 「添加工作区…」入口
    const items = await w.openPickerMenu();
    test.info().annotations.push({ type: 'note', description: `菜单项: ${items.join(' | ')}` });
    expect(items.some(i => i.includes(current)), '菜单应包含当前工作区').toBe(true);
    expect(items.some(i => /添加工作区/.test(i)), '菜单应提供「添加工作区…」入口').toBe(true);
    await w.closePickerMenu();

    // 选中当前工作区（幂等操作，应用不应报错、按钮文本不变）
    await w.openPickerMenu();
    await w.pickWorkspace(current);
    expect(await w.currentWorkspace(), '重新选中后按钮文本应不变').toBe(current);
  });

  test('M9-09 工作区树按目录层级嵌套渲染（父/子目录工作区）[双端]', async ({ page, pages }) => {
    test.setTimeout(120000);
    const w = pages.workspace;

    // 工作树语义：父目录加为工作区，其内的子目录也加为工作区 →
    // 「按工作区树」应把子工作区渲染成父级的下一层（子行缩进一级且紧跟父行、父级展开）；
    // 「按工作区」则同层扁平作对照。层级由渲染层用缩进/顺序表达——
    // 实测（2026-10 探针）DOM 上两行仍是兄弟节点，不能按 DOM 祖先断言。
    const parentDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-wstree-p-'));
    const childDir = path.join(parentDir, `dsh-wstree-c-${Date.now().toString(36)}`);
    fs.mkdirSync(childDir, { recursive: true });
    const parent = await createWorkspace(pages.sidebar.page, parentDir);
    const child = await createWorkspace(pages.sidebar.page, childDir);
    const pId = parent.workspace.workspaceId;
    const cId = child.workspace.workspaceId;

    /** 工作区树快照：key / 缩进(px) / 展开态 / 树中顺序 */
    const snap = () => page.evaluate(() =>
      [...document.querySelectorAll('div[role="tree"] div[role="treeitem"][data-row-key^="workspace:"]')]
        .map((el) => ({
          key: el.getAttribute('data-row-key'),
          indent: parseInt(getComputedStyle(el).paddingLeft, 10) || 0,
          expanded: el.getAttribute('aria-expanded'),
        })));

    try {
      // 切到「按工作区树」分组（正则精确匹配，防 hasText 前缀误命中「按工作区树/按工作区」）
      await pages.sidebar.openViewOptionsMenu();
      await pages.sidebar.pickViewOption(/^按工作区树$/);
      await expect(pages.sidebar.workspaceRows().first()).toBeVisible({ timeout: 15000 });

      const rows = await snap();
      const pRow = rows.find((r) => r.key === `workspace:${pId}`);
      const cRow = rows.find((r) => r.key === `workspace:${cId}`);
      expect(pRow, '父工作区行应出现').toBeTruthy();
      expect(cRow, '子工作区行应出现').toBeTruthy();
      expect(pRow.expanded, '父工作区应自动展开以显示子级').toBe('true');
      expect(rows.indexOf(cRow) - rows.indexOf(pRow), '子行应紧跟父行渲染').toBe(1);
      expect(cRow.indent, '子工作区应比父级缩进一层（树形渲染）').toBeGreaterThan(pRow.indent);
      test.info().annotations.push({ type: 'note', description: `树形分组缩进: 父${pRow.indent}px / 子${cRow.indent}px` });

      // 对照：「按工作区」分组下父子同层扁平，不表达目录层级
      await pages.sidebar.openViewOptionsMenu();
      await pages.sidebar.pickViewOption(/^按工作区$/);
      await expect(pages.sidebar.workspaceRows().first()).toBeVisible({ timeout: 15000 });
      const flat = await snap();
      const fp = flat.find((r) => r.key === `workspace:${pId}`);
      const fc = flat.find((r) => r.key === `workspace:${cId}`);
      expect(!!fp && !!fc && fc.indent === fp.indent, '按工作区分组下父子应同层（无层级缩进）').toBe(true);
    } finally {
      // RPC 兜底清理：先删子再删父（父删除对子级的行为未定义，避免连带）；临时目录随父一并删
      if (cId) await deleteWorkspace(pages.sidebar.page, cId).catch(() => {});
      if (pId) await deleteWorkspace(pages.sidebar.page, pId).catch(() => {});
      try { fs.rmSync(parentDir, { recursive: true, force: true }); } catch { /* 忽略 */ }
    }
  });
});
