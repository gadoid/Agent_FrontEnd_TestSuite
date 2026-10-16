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
 * M9-06 Agent 预设切换（标准 ↔ 极简 往返）
 * M9-07 模型选择（当前模型与可选列表）
 */
const { test, expect } = require('../fixtures/app.fixtures');
const { createWorkspace, deleteWorkspace } = require('../fixtures/workspace-api');
const fs = require('fs');
const os = require('os');
const path = require('path');

test.describe.configure({ mode: 'serial' });

test.describe('M9 工作区', () => {
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

  test('M9-06 Agent 预设切换（标准 ↔ 极简 往返）[双端]', async ({ pages }) => {
    test.setTimeout(120000);
    const ap = pages.agentPreset;
    // Agent 预设 chip 只在首页 hero 态渲染，先回首页
    await pages.sidebar.newSession();
    await pages.sidebar.openApp();

    const original = await ap.current();
    const presets = await ap.openMenu();
    await ap.closeMenu();
    expect(presets.length, '预设菜单应列出多种预设').toBeGreaterThan(1);

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

    // 部署仅一个模型时无从切换，记录后跳过切换段（与既有优雅 skip 同策略）
    const others = models.filter(m => m !== current);
    test.skip(others.length === 0, `当前部署仅一个模型（${current}），无切换对象`);
    test.info().annotations.push({ type: 'note', description: `可选模型: ${models.join(', ')}` });
  });
});
