# SparkSeed 客户端自动化测试套件

对 **SparkSeed 桌面客户端**（`D:\sparkseed\sparkseed.exe`，官方 DeepSeek Harness
v0.2.0-rc.8）的 Playwright 端到端测试套件，**同一套用例支持 Web 与 Electron 桌面双形态**，
覆盖真实 LLM 对话全链路与完整 UI 功能面。

> 套件历史：社区版 `Eline AI Desktop` v0.5.14 → ElineAI 定制构建（rc.2）→ 现为
> **SparkSeed**（官方构建 v0.2.0-rc.8，2026-10 更名迁移）。三者共享同一 dsh 代码基座，
> 选择器以 sparkseed 实测为准；ElineAI 时代的部署差异（易链中转、外贸专家模式等）随部署移除。

## 覆盖范围（9 模块 / 47 用例）

| 模块 | 主题 | 亮点 |
|------|------|------|
| M1 | 安装/启动 | 服务健康、未认证拦截（401）、关键 UI 就绪 |
| M2 | 登录/认证 | token 换 cookie、裸请求被拒、认证态可用 |
| M3 | 对话 | 真实 LLM 流式回复断言、多轮上下文、会话留存 |
| M4 | 插件管理/插件能力 | 侧栏插件页、清单、启停（随部署）、说明指引、插件详情组件清单、安装引导与安装源、设置-内置插件只读清单 |
| M5 | 知识库命中 | 附件上传、随机标记问答验证命中 |
| M6 | 消息操作 | 复制（剪贴板）、点赞、点踩表单、会话分支 |
| M7 | 用量/用时 | tok 解析（K/M）、秒数、明细弹层、会话统计条 |
| M8 | UI 功能面 | 指令面板、模型/思考程度、权限、搜索、设置应用、主题、**切换会话、侧栏折叠、视图分组、右栏分栏/最大化/收起、工作区文件/终端/浏览器** |
| M9 | 工作区 | **选择工作区按钮**、添加（RPC）/重命名/删除、会话归属、模式切换（外贸专家/标准/PTC/极简/创造） |

完整用例表见 [TEST-CASES.md](./TEST-CASES.md)。

## 快速开始

```bash
npm install
npx playwright install chromium

# 机器相关配置
cp .env.example .env   # 填 E2E_DSH_EXE（默认已指向 D:/sparkseed/sparkseed.exe）
```

> ⚠️ **`.env` 只能用 `E2E_` 前缀**。sparkseed 与官方版同款启动守卫：读**当前工作目录**的 `.env`，
> 命中 `DSH_` / `XDG_` / `DYLD_` / `BASH_FUNC_` 前缀（或 `PATH`/`NODE_OPTIONS`/`*_PROXY` 等）就
> **直接抛错退出**。`fixtures/env.js` 的 `assertEnvFileSafe()` 会在加载时拦截并给出明确报错。

```bash
npm run test:web        # Web 形态（套件自动拉起/关闭 dsh web 服务）
npm run test:electron   # 桌面形态（须先彻底退出桌面应用：硬性单实例锁）
npm test                # 串行跑两轮
npm run report          # HTML 报告
npm run report:export   # 报告按时间戳归档到 reports/（每轮会覆盖 playwright-report/）
```

> 📖 **完整操作手册见 [docs/USAGE.md](./docs/USAGE.md)**：`.env` 配置表、单用例/单模块运行、
> 报告导出与他人打开方式、skip 原因对照表、常见故障排查。

## SparkSeed 的关键机制（适配要点）

| 维度 | 说明 | 套件应对 |
|---|---|---|
| 桌面窗口 | 加载 `dsh-app://app/`；内部 host **改随机端口**（rc.2 时代的硬编码 19387 已移除） | 夹具按 URL 前缀挑主窗口；实例检测按进程名 |
| web 服务 | `dsh web`（sparkseed.exe CLI），默认 3080，可与桌面端共存 | `web-server` 项目自管启停 |
| 登录策略 | `anonymous` / `feishu-test`；凭据持久化在 `~/.dsh/.credentials.yaml`，已登录则启动直达主窗口 | 桌面端内置认证直接可用；welcome 引导页为 `file://welcome.html` |
| **cookie 构造** | **签名密钥不落盘**，离线构造必 401 | web 登录态走 **token 流程**：`dsh web` 启动打印 `?token=…`，夹具自动捕获 |
| token 时机 | 服务**先监听端口、后打印 token 行** | `web-server.js` 端口就绪后再给日志 8s 出现窗口 |
| LLM 凭据 | 按部署而定（官方 `deepseek-account` 路由可用 `E2E_LLM_API_KEY` 注入） | `.env` 配置 key，注入启动子进程 |
| 单实例锁 | 有，且**硬性**（Electron `requestSingleInstanceLock`，抢占失败即 `app.quit()`） | `tasklist` 按映像名查进程，命中即 skip |
| `.env` 守卫 | 读 cwd 的 `.env`，`DSH_` 等前缀直接抛错退出 | `E2E_*` 键名 + `assertEnvFileSafe` + 中性 cwd |
| 品牌/模式 | 品牌 `sparkseed`；ElineAI 部署的「外贸专家模式」等 persona 已随更名移除 | 断言标题/模式列表数据源在 `fixtures/test-data/ui-catalog.js`，按部署改数据 |

### 登录/认证：为什么走 token 流程

官方版把 cookie 签名密钥持久化在 `<DSH_HOME>/.credentials.yaml`，可离线构造 cookie；
**sparkseed 同样不落盘该密钥**（实测：按官方算法构造的 cookie 名字一致但签名被 401 拒绝）。
因此 web 登录态改为 token 流程：`dsh web` 每次启动打印
`dsh web: http://127.0.0.1:3080/?token=…`，套件自起服务时自动捕获并兑换成长效 cookie
（`?token=` → 303 → HttpOnly `dsh-auth-*`，30 天）。`fixtures/dsh-credentials.js`
保留离线构造能力，验证失败后自动降级到 token。

### LLM 凭据

ElineAI 时代的「易链 AI」中转 provider 已随更名移除。sparkseed 的默认模型路由按部署而定：
官方 `deepseek-account` 路由读启动环境变量 `DEEPSEEK_API_KEY`（由 `.env` 的
`E2E_LLM_API_KEY` 注入）；未配置时应用报 `MISSING_CREDENTIAL`，属环境问题而非产品缺陷。

## 架构（POM 组件化）

```
fixtures/          # 双模式夹具 + env 加载（含 .env 守卫）+ 端口工具 + web 服务生命周期 + 凭据工具
pages/             # 13 个页面对象（一组件一文件，spec 零自建 locator）
tests/             # 12 个模块 spec + web-server / auth 两个 setup
reporters/         # case-logger：控制台用例描述打印（TEST-CASES.md 单一事实源）
scripts/           # 选择器考古用一次性探测脚本（explore-*.js / probe-*.js / asar-read.js）+ 报告归档
docs/              # 使用说明（USAGE.md）、问题根因分析、覆盖清单 xlsx
```

- **组合根**：fixtures 注入 `pages` 组合对象，选择器变更只改 pages 一处
- **双端同构**：`mode` 夹具区分 web（chromium+storageState）/ electron（`_electron.launch` 取 `dsh-app://` 主窗口）
- **项目依赖图保证两轮分离**：`web-server`（起 `dsh web`）→ `setup`（token 换 cookie）→ `web-chromium`；`electron` 不声明依赖，故 `--project=electron` 不会启动 web 服务
- **选择器只用语义钩子**：前端广泛使用 `data-slot`、`data-row-key`、`data-chat-flow-kind`、`aria-label`，套件全部挂这些，**不依赖构建产物 hash 类名**
- **部署差异优雅降级**：浏览器页签（Electron webview 专属）、推理等级切换行（模型目录下发）、dock 控件等，缺失时记录差异而非误报缺陷

## 报告增强（用例描述 / 结束截图 / 最短观测时长）

HTML 报告（`npm run report`）为每条用例补充三类信息，实现见 `fixtures/app.fixtures.js`
（描述提取见 `fixtures/test-data/case-catalog.js`）；**运行时控制台**同步打印
「ID + 标题 + 用例描述」（`reporters/case-logger.js`），与报告同源。

| 增强 | 说明 |
|------|------|
| **用例描述** | 按用例标题里的 ID（`M8-01` / `M3-01A`…）到 **TEST-CASES.md** 自动提取「标题；前置；步骤；预期」，以注解形式显示在用例详情页（标签「用例描述」）。文档是单一事实源，改 TEST-CASES.md 即改报告，无需动代码 |
| **结束截图** | 每条用例（通过/失败，web 与 electron）在夹具拆卸时、窗口仍存活时截图，以附件「结束截图」内嵌进报告；失败场景另有 Playwright 自带的失败截图与 trace 互补。纯 API 校验用例（M1-01/02、M2-01/02）无 UI 可截，不产生截图 |
| **最短观测时长** | 执行时间不足 `E2E_MIN_TEST_MS`（默认 6000，0 = 关闭）的**通过**用例补足等待后再截图——太短的自动化执行一闪而过，补等待便于观察过程、也等 UI 动画收敛。失败/超时不补，尽快出报告 |

全局兜底超时因此从默认 30s 放宽到 60s（长用例各自 `test.setTimeout` 覆盖）。

## 工程化细节

- 中性 cwd（规避 .env 陷阱）、桌面实例进程探测（规避单实例锁）、分级有界关闭（防 worker 拆卸超时拖垮后续用例）、用例间 10s 缓冲、真实 LLM 波动的 retries 兜底
- **electron 夹具每次拉起前清理累积的 `dsh-auth-*` cookie**（`%APPDATA%/sparkseed/Network/Cookies`）：host 每次启动签发唯一随机名的 cookie，Chromium 罐子只增不减，累计 ~71 个（≈15.7KB）会顶到 Node 默认 16KB 请求头上限，welcome 握手被拒 → 应用启动即崩（`desktop welcome: Web authentication failed`）。登录态在 `.credentials.yaml`，不受清理影响
- 旧版（ElineAI rc.2）首载会弹「预览版说明」遮罩；rc.7 已移除该弹窗，`BasePage.dismissOnboarding()` 与 electron 夹具保留防御性兜底（存在才点，缺失静默跳过）
- 真实 LLM 用例偶发「正在重试模型请求（n/5）」后成功，retries 已兜底
