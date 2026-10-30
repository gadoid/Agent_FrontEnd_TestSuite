# 问题根因分析：M8-09 切换会话失败 + web 形态「预览版说明」弹窗无法关闭

日期：2026-10-29　|　影响面：M8-09（已修复）；web 形态全部 UI 用例（应用侧缺陷，待修）

## 一、M8-09 失败根因（用户原始失败日志，electron 端）

```
TimeoutError: locator.click: Timeout 30000ms exceeded.
  waiting for locator('div[role="treeitem"][data-row-key^="session:"]').filter({ hasText: 'SWITCH-MVT07SW7' })
```

两个叠加原因，都与「没有使用/创建工作树结构的工作区」直接相关：

1. **被测会话全部落在共享「默认工作区」**。该分组已累积 130+ 会话，树做了按组折叠
   （「展开其余 126 个会话」按钮），目标行根本不在 DOM 里，点击无从谈起。
2. **会话标题被 LLM 改写**。回复完成后应用会用 LLM 重写标题，`SWITCH-*` 标记词被丢弃
   （实测改写成「原样输出标记词」），按标记文本 `filter({ hasText })` 永远匹配不到。

## 二、套件侧修复（tests/08-ui-features.spec.js + pages/）

- **自建专用工作区隔离被测会话**：经 `fixtures/workspace-api` 的 `workspace/create` RPC
  创建临时工作区（M9 同源通道，双端通用），两个被测会话经 `newSessionIn()` 落在其中
  ——组内仅两行、稳定渲染，不再受默认工作区的折叠/数量影响。
- **按 `data-row-key`（session:<uuid>）定位树行**：标题被改写也不变的最稳树钩子，
  取「会话 A 选中时的 key」，切走后按 key 重定位并点击，断言 `aria-selected` 移回。
- **归属校验**：在树内按文档序反向扫描会话行之前最近的 `workspace:` 行，
  断言会话 A 真的归属专用工作区——防 `newSessionIn` 点击被吞后静默落回默认工作区的假通过。
- **finally 兜底清理**：RPC 删除工作区 + 删临时目录（注意：用例被硬超时中断时 finally
  不执行，残留用 `node scripts/cleanup-leaked-workspaces.js` 清理）。
- **`BasePage.dismissOnboarding` 加固**：点「继续」后复查弹窗是否真的关掉，未关则
  「重试点击 / Esc」交替最多 5 轮，仍驻留则**快速抛错并指明根因**（不再让后续步骤
  在遮罩下空耗到用例超时——修复前单次失败空耗 2×300s）。
- **`SidebarPage.selectedSessionKey()`**：新增辅助，读当前选中会话行的 data-row-key。

验证：electron 端通过（本次修复后实测）；web 端受下述应用缺陷阻断，快速失败并给出诊断。

## 三、新发现的应用侧缺陷（web 形态，阻断全部 UI 用例）

### 现象

web 形态（`dsh web`）每次全新浏览器上下文首载都弹「预览版说明」模态，点「继续」后
弹窗**不关闭**，并显示红字「暂时无法保存确认状态，请重试。」。遮罩拦截一切点击，
openApp 后的任何 UI 操作全部超时。electron 形态不受影响（desktop 的 settings 写入正常，
弹窗可正常确认一次后就不再出现）。

### 证据链（2026-10-29 抓包 + asar 逆向）

1. 「继续」触发 `POST /api/settings/mutate`（信封 `settings/mutate`，
   `ns:"ui-settings-general"`，`ops:[{op:"set",path:["welcomeNoticeVersion"],value:"2026-10-23.1"}]`）：
   ```json
   {"result":{"ok":false,"error":{"code":"settings/rejected",
    "message":"dsh: profile reload requires the root Include entry"}}}
   ```
   HTTP 200，业务层拒绝。**所有 settings 写入都这样被拒**（弹窗、主题、字号……）。
2. 前端确认逻辑（`@deepseek-ai/dsh-client-ui-settings-models` 的 WelcomeNotice + WelcomeNoticeStore）：
   非 memory 模式下 `acknowledge()` 写入后**读回校验**（`welcomeNoticeVersion === "2026-10-23.1"`
   精确相等），读不回即置 error 态、弹窗驻留——与抓包一致。确认标记存 settings
   命名空间 `ui-settings-general.welcomeNoticeVersion`，不是 localStorage，无法在前端绕过。
3. 服务端拒绝点（app.asar 内 `reconcileProfilePatches`）：
   ```js
   const entry = bootstrapIncludes.get(ctx);
   if (entry === void 0) throw new Error(`${binName}: profile reload requires the root Include entry`);
   ```
   即 settings 写入需要协调 profile 补丁，而 web 启动路径没有挂载/记住根 Include 条目
   （`mountRootInclude` 在启动时调用并写入 `bootstrapIncludes`，web 形态该关联缺失）。
   desktop 形态正常（`profiles/desktop/cordis.patch.yml` 里有成功写入的主题补丁可证）。

### 结论与建议

- **应用侧**：修复 `dsh web`（web profile）启动路径上根 Include 条目的挂载，
  否则 web 形态所有 settings 持久化（含新手引导确认）都不可用。
- **套件侧（已做）**：`dismissOnboarding` 无法关闭弹窗时立即抛出含上述根因提示的错误，
  避免 web 轮次每个用例都空耗超时；应用修复后 web 形态无需任何用例改动即可恢复。

### 附：残留清理

用例被硬超时中断时 finally 不执行，会残留 `dsh-m8-09-*` / `dsh-ws-*` 工作区与临时目录。
清理：`node scripts/cleanup-leaked-workspaces.js`（会临时拉起 `dsh web`，跑完自动关闭；
不要在测试进行中执行）。
