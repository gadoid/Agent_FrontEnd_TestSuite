# DSH 客户端（外贸赋能中心 / DeepSeek Harness）测试用例设计

> 目标服务：`http://127.0.0.1:3080`（`dsh web` 启动，token 认证）
> 覆盖形态：**Web**（chromium）与 **Electron 桌面端**（`DSH_ELECTRON_PATH` 指定 exe）
> 命名约定：`M<模块>-<序号>`；`[web]` 仅 web、`[electron]` 仅桌面、`[双端]` 两种形态都跑

---

## 模块总览

| 模块 | 主题 | 用例数 | 真实 LLM | 说明 |
|------|------|--------|----------|------|
| M1 | 安装/启动 | 3 | 否 | 服务健康、资源加载、客户端 UI 就绪 |
| M2 | 登录/认证 | 3 | 否 | token 换 cookie、无凭证拦截、认证态可用 |
| M3 | 对话 | 3 | 是 | 收发消息、多轮上下文、会话留存 |
| M4 | 插件安装 | 3 | 否 | 市场可见、目录安装、启停切换（市场入口缺失时自动 skip） |
| M5 | 知识库命中 | 2 | 是 | 附件上传、随机标记问答验证命中 |
| M6 | 消息操作 | 4 | 是 | 复制、点赞、点踩反馈表单、分支 |
| M7 | 用量/用时 | 5 | 是 | 回合用量解析、用时、明细弹层、会话统计条 |
| M8 | 其他 UI 功能 | 8 | 部分 | 指令面板、模型选择、访问模式、搜索、设置、主题、右侧栏 |

---

## M1 安装 / 启动

| ID | 标题 | 前置 | 步骤 | 预期 | 形态 |
|----|------|------|------|------|------|
| M1-01 | Web 服务可达且返回客户端页面 | `dsh web` 已启动 | GET `/`（带认证态） | 200；HTML 含 `__ModuleLoader__` / `__DSH_BOOT__` | web |
| M1-02 | 未认证访问被拦截 | 无 | 无 cookie 请求 `/` | 401/403，提示 authentication required | web |
| M1-03 | 客户端启动，关键 UI 就绪 | M1-01 | 打开页面/启动桌面端，检查标题与侧边栏 | 标题含 `DeepSeek`；新建会话/设置/搜索可见；版本号可读。市场入口为部署级开关：存在则一并验证，缺失仅记录 | 双端 |
| M1-04 | 桌面端进程启动 | `DSH_ELECTRON_PATH` 有效 | `_electron.launch` 取首个窗口 | 60s 内出现窗口且渲染出侧边栏 | electron |

## M2 登录 / 认证

| ID | 标题 | 前置 | 步骤 | 预期 | 形态 |
|----|------|------|------|------|------|
| M2-01 | token 登录换 auth cookie | 拿到 `dsh web` 打印的 token | 干净上下文访问 `/?token=...` | 303→`/`；种下 HttpOnly 的 `dsh-auth-*`；UI 渲染 | web |
| M2-02 | 无凭证访问被拒 | 无 | 裸请求 `/` | 401 且响应体含 auth 字样 | web |
| M2-03 | 认证态开箱可用 | M2-01 / 桌面内置认证 | 直接进入应用 | 侧边栏可用，工作区名称非空 | 双端 |

## M3 对话

| ID | 标题 | 前置 | 步骤 | 预期 | 形态 |
|----|------|------|------|------|------|
| M3-01 | 发送消息并收到回复 | 已登录 | 新会话→输入→发送 | 用户消息上屏；回复正文（`hWmORq_body`）非空（≤180s） | 双端 |
| M3-02 | 多轮上下文保持 | M3-01 | 追问「本会话第一条用户消息末尾圆括号里的字符串」 | 回复包含该随机串 | 双端 |
| M3-03 | 会话留存侧边栏 | M3-01 | 发送后检查侧边栏 | 出现 `会话“*”的操作` 条目 | 双端 |

## M4 插件安装（易链市场）

> 「易链市场」入口由**部署级配置**控制，部分部署不提供（插件管理收敛至 设置 → 插件）。
> 模块前置会探测入口，缺失时整组 skip 并注明原因，不判为产品缺陷。

| ID | 标题 | 前置 | 步骤 | 预期 | 形态 |
|----|------|------|------|------|------|
| M4-01 | 市场页签与目录可见 | 市场入口存在 | 打开易链市场 | 插件目录/已安装/刷新目录可见；已安装列表非空 | 双端 |
| M4-02 | 从目录安装插件 | M4-01 | 记录安装前已安装集合→目录点「安装」 | 安装按钮消失或已安装列表差集非空 | 双端 |
| M4-03 | 已安装插件启停切换 | M4-01 | 停用一个运行中插件→再启用 | 停用后出现「启用」，启用后恢复「停用」。注：web 端启停控件恒为禁用态（插件生命周期由桌面端管理），仅 electron 可执行 | electron |

## M5 知识库命中

| ID | 标题 | 前置 | 步骤 | 预期 | 形态 |
|----|------|------|------|------|------|
| M5-01 | 上传知识文件 | 已登录、新会话 | 「添加附件」上传 `kb-sample.md` | 输入区出现 `kb-sample.md` 附件 chip | 双端 |
| M5-02 | 提问命中文件内容 | M5-01 | 提问「文件里的机密代号是什么」 | 回复包含一次性随机标记 `ZKB-MARKER-7F3A9C`（仅文件可知） | 双端 |

## M6 消息操作

> 操作按钮位于每回合尾部容器 `[data-chat-flow-kind="turn-tail"]`：复制 / 好的回答（点赞）/ 有问题的回答（点踩）/ 在新对话中分支。
> 模块 serial 执行（同一会话连续操作）。

| ID | 标题 | 前置 | 步骤 | 预期 | 形态 |
|----|------|------|------|------|------|
| M6-01 | 复制回复到剪贴板 | 存在至少一条回复 | 点「复制」→读剪贴板 | 剪贴板内容与回复正文一致（需 context 授予 clipboard 权限） | 双端 |
| M6-02 | 点赞出现感谢反馈 | 同上 | 点「好的回答」 | 出现含「感谢」的 toast 反馈 | 双端 |
| M6-03 | 点踩提交反馈表单 | 同上 | 点「有问题的回答」→弹出表单→选「其他」→提交 | dialog 出现且提交后关闭 | 双端 |
| M6-04 | 在新对话中分支 | 同上 | 点「在新对话中分支」 | 跳转新会话，输入区（composer）仍可用 | 双端 |

## M7 用量统计 / 用时检查

> 用量/用时按钮无 aria-label，按文本前缀定位（`用量 9.8K tok` / `用时 3秒`），位于 turn-tail 内。
> 解析规则：`9.8K`→9800、`1.2M`→1.2e6；明细弹层展示千分位精确值（如 `9,792 tok`）。

| ID | 标题 | 前置 | 步骤 | 预期 | 形态 |
|----|------|------|------|------|------|
| M7-01 | 回合展示用量，tok 数可解析且 > 0 | 存在回复回合 | 读「用量」按钮文本并解析 | 解析值 > 0 | 双端 |
| M7-02 | 回合展示用时，秒数 ≥ 0 | 同上 | 读「用时」按钮文本并解析 | 秒数 ≥ 0 | 双端 |
| M7-03 | 用量明细弹层展示精确 token 数 | 同上 | 点「用量」 | 弹层文本含千分位精确值 `/\d{1,3}(,\d{3})+\s*tok/` | 双端 |
| M7-04 | 用时明细弹层可打开 | 同上 | 点「用时」 | 弹层文本含该回合原文片段 | 双端 |
| M7-05 | 会话统计条展示轮次与缓存命中 | 同一多轮会话 | 读会话统计条 | 文本匹配 `/轮.*步/` 且含 tok/s | 双端 |

## M8 其他 UI 功能

| ID | 标题 | 前置 | 步骤 | 预期 | 形态 |
|----|------|------|------|------|------|
| M8-01 | 指令面板打开与关闭 | 已登录 | 点「指令」按钮 | 面板列出至少一个指令；Esc 关闭 | 双端 |
| M8-02 | 模型选择器展示当前模型与可选列表 | 已登录 | 读当前模型→打开模型菜单 | 菜单包含当前模型（如 `deepseek-v4-pro`） | 双端 |
| M8-03 | 访问模式菜单展示当前模式与选项 | 已登录 | 读当前模式→打开访问模式菜单 | 选项含 仅可查看/工作区内修改/完全权限，含当前模式 | 双端 |
| M8-04 | 会话搜索过滤 | 至少一个会话 | 搜索已有会话关键字→搜索不存在串 | 关键字命中 > 0；不存在串命中 0 | 双端 |
| M8-05 | 设置四个页签切换正常 | 已登录 | 打开设置→逐个切页签 | 通用设置/模型/插件/Agent 预设 均可切换，弹窗保持 | 双端 |
| M8-06 | 主题切换背景亮度变化 | 已登录 | 深色→浅色，采样 body 背景灰度 | 深色 < 80，浅色 > 150 | 双端 |
| M8-07 | 右侧栏页签切换 | 会话中已发消息 | 展开右侧栏→切 对话/轨迹/（系统提示词） | 常驻页签 对话/轨迹 可见可切；上下文页签（系统提示词/文件）存在则可切 | 双端 |
| M8-08 | 右侧栏布局按钮可见 | 同上 | 展开右侧栏 | 新标签页/分栏/全屏 按钮可见 | 双端 |

---

## 目录结构（POM 组件化）

```
Agent_FrontEnd_TestSuite/
├── playwright.config.js        # setup / web-chromium / electron 三项目
├── TEST-CASES.md               # 本文档
├── fixtures/
│   ├── app.fixtures.js         # 双模式夹具：mode/page/electronApp/pages（组合根）
│   └── test-data/kb-sample.md  # 知识库样本（含随机标记）
├── pages/                      # 页面组件封装（POM，一组件一文件）
│   ├── index.js                #   组合根 createPages(page, mode) → pages 对象
│   ├── BasePage.js             #   基类：openApp/waitForReady/bodyText
│   ├── SidebarPage.js          #   侧边栏：新建会话/市场/设置/搜索/工作区
│   ├── ChatComposerPage.js     #   输入区：输入/发送/附件（兼容发送前后两种 aria-label）
│   ├── ChatTranscriptPage.js   #   消息区：回复定位/waitForReplyContaining 轮询断言
│   ├── SettingsDialogPage.js   #   设置弹窗：四页签/主题切换亮度采样
│   ├── MarketDialogPage.js     #   易链市场：目录/已安装/安装/启停
│   ├── MessageActionsPage.js   #   消息操作：复制/点赞/点踩表单/分支（turn-tail）
│   ├── ReplyMetaPage.js        #   回合元信息：用量/用时按钮与解析、明细弹层
│   ├── InputControlsPage.js    #   输入区周边控件：指令面板/模型选择/访问模式
│   └── RightPanelPage.js       #   右侧栏：页签（对话/轨迹/系统提示词）+布局按钮
├── tests/
│   ├── auth.setup.js           # web 登录态（state 有效直接复用，否则 token→cookie）
│   ├── 01-install-launch.spec.js
│   ├── 02-login-auth.spec.js
│   ├── 03-chat-conversation.spec.js
│   ├── 04-plugin-install.spec.js
│   ├── 05-knowledge-base.spec.js
│   ├── 06-message-actions.spec.js
│   ├── 07-usage-duration.spec.js
│   └── 08-ui-features.spec.js
└── scripts/                    # 一次性探测脚本（选择器考古用）
```

### 分层约定

- **spec 只表达业务步骤**：断言与操作全部经由 `pages.*` 组件方法，不自建 locator（选择器变更只改 pages 一处）。
- **组合根**：`fixtures` 调 `createPages(page, mode)` 注入 `pages` 对象；spec 之间共享同一组件语义。
- **组件自治**：每个 Page 类自带该区域的选择器考古注释（实测 DOM 结构、aria-label 陷阱）。
- **跨组件等待**：流式回复等不稳定断言封装为轮询方法（`waitForReplyContaining`），带 `baselineCount` 防误读旧回合。

## 运行方式

```bash
# 机器相关配置写在 .env（从 .env.example 复制）：DSH_TOKEN / DSH_ELECTRON_PATH / DSH_URL

# Web 形态：需要 dsh web 服务已运行（客户端启动后自动监听 127.0.0.1:3080）
npm run test:web

# 桌面形态：需要 web 服务【已停止】——桌面实例探测到已有 runtime 会依附退出，
# Playwright 无法接管（夹具检测到服务运行会整组 skip 并说明）。
# 服务停止时用例自管 runtime：启动前自动清理异常退出残留的 .dsh-desktop-runtime.json
npm run test:electron   # 未配路径时自动探测常见安装位置；探测不到则 skip

npm run report          # HTML 报告
```

> **双端编排**：web 与 electron 分开跑（`npm test` 同跑时 electron 检测到 web 服务的 runtime 会整组 skip，不会失败）。

## 迁移到其他 PC

项目已做通用化适配，机器相关配置**全部收敛到 `.env`**（零硬编码）：

| 步骤 | 操作 |
|------|------|
| 1. 环境准备 | 安装 Node ≥ 20；项目目录执行 `npm install` + `npx playwright install chromium` |
| 2. 安装被测应用 | 安装 dsh 桌面客户端（Eline AI Desktop）并启动一次，确认 `dsh web` 服务监听（默认 3080） |
| 3. 写配置 | `cp .env.example .env`，填入 `DSH_TOKEN`（客户端启动时打印的 `/?token=xxx`）；如桌面端不在默认探测路径，再填 `DSH_ELECTRON_PATH`；服务端口非 3080 时改 `DSH_URL` |
| 4. 验证 | `npm run test:web` 首跑会用 token 换 cookie 存 `.auth/dsh-state.json`（30 天有效，之后无需 token） |

通用化设计要点：

- **token**：仅从 `DSH_TOKEN`（env / .env）读取，无硬编码默认值；缺失且无有效 cookie 时给出明确指引报错。token 每次服务重启轮换，cookie 才是长效登录态。
- **服务地址/端口**：所有端口探测（runtime-state 清理、auth.setup 健康检查）从 `DSH_URL` 派生，改端口无需改代码。
- **Electron 路径**：`DSH_ELECTRON_PATH` 优先；未设置时自动探测常见安装位置（D:\eline-ai、%LOCALAPPDATA%\Programs 等），探测到打日志、探测不到优雅 skip。路径正反斜杠均可（fixture 归一化）。
- **优先级**：命令行/CI 环境变量 > `.env` 文件 > 代码默认值。
- **`.env`、`.auth/` 已列入 `.gitignore`**（token 与登录态不入库）。

### Electron 桌面端实测要点

- **桌面客户端**：`Eline AI Desktop.exe`（dsh-desktop v0.5.14，Electron 打包），窗口加载的仍是本地 3080 服务，内置认证。
- **路径必须归一化为正斜杠**：Playwright 在 Windows 下以 `shell:true` 启动 exe，反斜杠路径会被 cmd 吃掉报 `Process failed to launch!`（fixtures 已自动处理）。
- **单实例锁**：客户端有 `requestSingleInstanceLock`，多实例并行时后者直接退出 → electron 项目必须 `workers: 1`。
- **`.dsh-desktop-runtime.json` 异常退出残留清理**：dsh 启动时读 `~/.bruc3van-dsh-desktop/dsh/.dsh-desktop-runtime.json`，文件存在即判定「上次异常退出」进入恢复流程（依附退出、市场入口缺失等异常行为）。运行期间该文件由 dsh 维护属正常状态。fixtures/runtime-state.js 的 `ensureCleanRuntimeState()` 在每次启动前探测：**服务未运行且文件存在 → 删除**；服务运行中 → 保留。已挂到 electron 夹具（launch 前）与 auth.setup（服务探测失败时报错并清残留）。
- **teardown 强杀兜底**：托盘常驻应用 `app.close()` 可能挂住；fixture 限时 15s 后 `kill('SIGKILL')`，避免残留进程占锁。
- **单用例超时 180s**：每条用例冷启动一次桌面端（约 10-15s）+ 真实 LLM 回复。
- **electron 项目依赖 web 项目先跑**（`dependencies: ['web-chromium']`）：electron 用例自行起停 3080 runtime，与 web 依赖的常驻服务互扰，不能并行。

## 已知约束与维护提示

1. **token 生命周期**：`dsh web` 每次重启会打印新 token，旧 token 失效。setup 优先复用 `.auth/dsh-state.json`（cookie 30 天有效），仅 state 失效时才走 token。
2. **真实 LLM 用例**（M3/M5/M6/M7）超时放宽至 180~420s；模型偶发行为波动由 `retries: 1` 兜底（CI 下 2 次）。
3. **并发限制**：`workers: 2`。用例打真实 LLM 后端，高并发易触发服务限流导致连锁超时。
4. **视口与语言**：`locale: zh-CN`（否则界面变英文、中文选择器全失配）；`viewport 1440x900`（1280x720 下右侧栏/统计条被响应式隐藏）。
5. **市场入口为部署级开关**：当前部署可能不提供「易链市场」入口，M4 会自动 skip 并注明；M1-03 不将其列为核心 UI。
6. **测试数据残留**：M3/M5/M6/M7 会在工作区产生真实会话（每轮全量运行约 +20 个），如需清理请手动删除。
7. **M4 安装是真实安装**，会改动本地插件状态；用例用「已安装集合差集」断言，不回滚（生产验证语义）。
8. **Electron 路径**：`_electron.launch({ executablePath })` 需指向 Electron 打包的桌面 exe；未设置时用例优雅 skip。
9. **剪贴板权限**：M6-01 需 context 级 `clipboard-read/clipboard-write` 权限（已在 config `use.permissions` 配置）。
