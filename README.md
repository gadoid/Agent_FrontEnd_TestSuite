# DSH 客户端自动化测试套件

对 [DeepSeek Harness](https://download.deepseek.com/dsh-desk/)（官方版桌面客户端）的 Playwright 端到端测试套件，**同一套用例支持 Web 与 Electron 桌面双形态**，覆盖真实 LLM 对话全链路。

> 本套件已从社区版 `Eline AI Desktop` v0.5.14 **迁移到官方版 `DeepSeek Harness` v0.2.0-rc.2**。
> 迁移带来的机制差异见下方「官方版与社区版的关键差异」。

## 覆盖范围（9 模块 / 38 用例）

| 模块 | 主题 | 亮点 |
|------|------|------|
| M1 | 安装/启动 | 服务健康、未认证拦截（401）、关键 UI 就绪 |
| M2 | 登录/认证 | 离线构造签名 cookie、裸请求被拒 |
| M3 | 对话 | 真实 LLM 流式回复断言、多轮上下文、会话留存 |
| M4 | 插件管理 | 侧栏插件页、条目清单（安装/启停控件随部署） |
| M5 | 知识库命中 | 附件上传、随机标记问答验证命中（仅文件可知） |
| M6 | 消息操作 | 复制（剪贴板）、点赞、点踩表单、会话分支 |
| M7 | 用量/用时 | tok 解析（K/M）、秒数、明细弹层、会话统计条 |
| M8 | 其他 UI | 指令面板、模型选择、访问模式、搜索、主题、右侧栏 |
| M9 | 工作区 | 工作区树、重命名/删除、会话归属、Agent 预设、模型 |

完整用例表见 [TEST-CASES.md](./TEST-CASES.md)。

## 快速开始

```bash
npm install
npx playwright install chromium

# 机器相关配置
cp .env.example .env   # 填 E2E_DSH_EXE 与 E2E_LLM_API_KEY
```

> ⚠️ **`.env` 只能用 `E2E_` 前缀**。官方版启动时会读取**当前工作目录**的 `.env`，命中
> `DSH_` / `XDG_` / `DYLD_` / `BASH_FUNC_` 前缀（或 `PATH`/`NODE_OPTIONS`/`*_PROXY` 等）就
> **直接抛错退出**，表现为应用根本起不来。`fixtures/env.js` 的 `assertEnvFileSafe()` 会
> 在加载时拦截并给出明确报错。

```bash
npm run test:web        # Web 形态（套件自动拉起/关闭 dsh web 服务）
npm run test:electron   # 桌面形态（须先彻底退出桌面应用：官方版有硬性单实例锁）
npm test                # 串行跑两轮
npm run report          # HTML 报告
```

## 官方版与社区版的关键差异（迁移要点）

| 维度 | 社区版 Eline AI Desktop | 官方版 DeepSeek Harness |
|---|---|---|
| 桌面窗口加载 | `http://127.0.0.1:3080`（子进程起的服务） | `dsh-app://app/`，后端服务固定 **19387** |
| web 服务 | 由客户端实例托管在 3080 | `dsh web`，默认 3080，**可独立于桌面端共存** |
| runtime 状态文件 | `~/.dsh/.dsh-desktop-runtime.json`（异常退出标记） | **完全没有** |
| 登录态 | token → cookie，**token 每次重启轮换** | 同机制，但签名密钥持久化在 `~/.dsh/.credentials.yaml`，**可离线构造 cookie，不轮换** |
| 单实例锁 | 有 | 有，且**硬性**（抢占失败即 `app.quit()`） |
| 品牌/插件 | 「外贸赋能中心」「易链市场」「审单工作台」 | `deepseek HARNESS`；插件页在侧栏；上述社区概念全库 0 命中 |
| 工作区模型 | 侧栏常驻「选择工作区」按钮 + 菜单 | **工作区树**（`data-row-key="workspace:<uuid>"`），无常驻选择器 |
| 数据目录 | 同上（共用 `~/.dsh`） | `~/.dsh`（DSH_HOME）+ `%APPDATA%\@deepseek-ai\dsh-desktop` |

### 认证：为什么不再需要 token

官方版把 cookie 签名密钥明文持久化在 `<DSH_HOME>/.credentials.yaml`
（`records["client-connection/browser-session"].payload.secret`），且**跨重启稳定**。
`fixtures/dsh-credentials.js` 据此离线构造合法 cookie：

```
name  = "dsh-auth-" + base64url(sha256("<host>:<port>"))     # 按端口区分
value = "v1." + body + "." + base64url(HMAC_SHA256(secret, body))   # 签名对象是 body 本身
body  = base64url(JSON.stringify({version:1, authority, issuedAt, expiresAt}))
```

因此服务重启导致的 token 轮换不再影响测试。读不到密钥时自动回退到 token 流程。

### LLM 凭据

官方版默认模型走 `deepseek-account` 路由，凭据解析顺序为「凭据服务 → 启动环境变量」。
套件通过 `E2E_LLM_API_KEY`（.env）注入为 `DEEPSEEK_API_KEY`，**无需改动应用的凭据存储**。
未配置时用例会收到 `MISSING_CREDENTIAL`，属环境问题而非产品缺陷。

## 架构（POM 组件化）

```
fixtures/          # 双模式夹具 + env 加载（含 .env 守卫）+ 端口工具 + web 服务生命周期 + 离线认证
pages/             # 11 个页面对象（一组件一文件，spec 零自建 locator）
tests/             # 9 个模块 spec + web-server / auth 两个 setup
```

- **组合根**：fixtures 注入 `pages` 组合对象，选择器变更只改 pages 一处
- **双端同构**：`mode` 夹具区分 web（chromium+storageState）/ electron（`_electron.launch` 取 `dsh-app://` 主窗口）
- **项目依赖图保证两轮分离**：`web-server`（起 `dsh web`）→ `setup`（认证）→ `web-chromium`；`electron` 不声明依赖，故 `--project=electron` 不会启动 web 服务
- **选择器只用语义钩子**：官方版广泛使用 `data-slot`、`data-row-key`、`data-chat-flow-kind`、`aria-label`，套件已全部改挂这些，**不再依赖构建产物 hash 类名**
- **工程化细节**：中性 cwd（规避 .env 陷阱）、桌面实例端口探测（规避单实例锁）、分级有界关闭（防 worker 拆卸超时拖垮后续用例）、用例间 10s 缓冲、真实 LLM 波动的 retries 兜底
