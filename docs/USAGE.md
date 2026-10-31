# SparkSeed 自动化测试套件 · 使用说明

> 操作手册：环境准备 → 运行 → 报告导出 → 排错。设计背景与用例表见根目录
> [README.md](../README.md) 与 [TEST-CASES.md](../TEST-CASES.md)。

---

## 1. 环境准备

### 1.1 基础依赖

```bash
npm install
npx playwright install chromium   # web 轮需要；只跑桌面轮可跳过
```

要求 Node ≥ 18（用到 `fs.cpSync`）。Windows 下建议在 Git Bash 中执行。

### 1.2 配置 `.env`

```bash
cp .env.example .env
```

| 配置项 | 说明 | 默认 |
|---|---|---|
| `E2E_DSH_EXE` | 桌面端 exe 路径（正反斜杠均可）。不设时按常见位置自动探测（含 `D:/sparkseed/sparkseed.exe`） | 同左 |
| `E2E_URL` / `E2E_WEB_PORT` | web 形态服务地址/端口，两者必须一致（cookie 名由 host:port 派生） | `127.0.0.1:3080` |
| `E2E_LLM_API_KEY` | 仅官方 `deepseek-account` 路由需要（注入为 `DEEPSEEK_API_KEY`）；内置中转 provider 无需 | 空 |
| `E2E_MIN_TEST_MS` | 快用例最短观测时长（毫秒），0 = 关闭 | 6000 |
| `E2E_SKIP_SERVER_START` | `1` = 连接已在跑的 web 服务（需手工给 `E2E_TOKEN`） | 空 |

> ⚠️⚠️ **`.env` 键名只能用 `E2E_` 前缀**
> sparkseed 启动时会读取**当前工作目录**的 `.env`，一旦出现 `DSH_` / `XDG_` / `DYLD_` /
> `BASH_FUNC_` 前缀，或 `PATH` / `HOME` / `NODE_OPTIONS` / `*_PROXY` 等保留名，
> **应用直接抛错退出**（表现为用例全部 launch 失败）。`fixtures/env.js` 的
> `assertEnvFileSafe()` 会在加载时拦截违规键名并给出明确报错。`.env` 已 gitignore，不会入库。

### 1.3 桌面轮前置：彻底退出 SparkSeed

sparkseed 有**硬性单实例锁**（Electron `requestSingleInstanceLock`，抢占失败即 `app.quit()`）。
跑 electron 轮前必须彻底退出桌面应用（含托盘）：

```bash
taskkill //F //IM sparkseed.exe //T   # Git Bash 双斜杠转义
```

不退出不会报错——夹具检测到进程存活会让整轮用例 **skip**（跳过原因见 §5）。

---

## 2. 运行测试

```bash
npm run test:electron   # 桌面形态（当前主验证形态）
npm run test:web        # web 形态（套件自动拉起/关闭 dsh web 服务）
npm test                # 串行跑两轮
```

跑单个模块 / 单条用例（用例 ID 都在标题里，直接 `-g` 过滤）：

```bash
npx playwright test --project=electron tests/03-chat-conversation.spec.js
npx playwright test --project=electron -g "M3-01"        # 按用例 ID
npx playwright test --project=electron -g "对话"          # 按模块名
```

- electron 轮 `workers=1`（单实例锁强制串行）；web 轮 `workers=2`（真实 LLM 限流约束）。
- 真实 LLM 用例偶发模型重试，`retries=1` 自动兜底；报告里标记 flaky 的用例通常已自愈。
- **验证形态优先级：桌面端为主**。web 轮存在已知应用缺陷（settings 写入被拒等，
  见 `docs/问题根因分析-M8-09工作区隔离与web端预览版弹窗.md`），应用修复前
  web 轮失败不视为用例缺陷。

### 用例描述打印

每条用例开始时，控制台会打印 **ID + 标题 + 用例描述**（描述从 TEST-CASES.md 表格自动提取，
与 HTML 报告注解同源，实现见 `reporters/case-logger.js`）：

```
▶ 右侧工作面板 › M10-12 终端↔工作区文件联动 [双端]
  │ 终端 `echo` 建文件→切「文件」面板；面板即时可见新文件（探针后清理）
```

改 TEST-CASES.md 对应表格行即可同时更新控制台打印与 HTML 报告，无需动代码。

---

## 3. 报告查看与导出

```bash
npm run report          # 打开最近一轮 HTML 报告
npm run report:export   # 把最近一轮报告按时间戳归档到 reports/e2e-report-<时间戳>/
```

要点：

- **每轮跑完都会覆盖 `playwright-report/`**。需要留档对比时，跑完立即 `npm run report:export`。
- `playwright-report/`（及归档目录）是**自包含**的：每条用例的「结束截图」、失败截图、
  trace 全部内嵌。发给他人 = 直接压缩整个目录；接收方两种打开方式：
  ```bash
  npx playwright show-report <解压后的目录>
  # 或任意静态服务器打开其中的 index.html
  ```
- 单条失败用例的 trace 单独回放：
  ```bash
  npx playwright show-trace "test-results/<用例目录>/trace.zip"
  ```
- CI 解析用 JSON/JUnit（会覆盖默认 reporter）：
  ```bash
  npx playwright test --project=electron --reporter=json > report.json
  npx playwright test --project=electron --reporter=junit > report.xml
  ```

---

## 4. 项目结构

```
Agent_FrontEnd_TestSuite/
├── playwright.config.js        # 四项目：web-server → setup → web-chromium；electron 独立
├── fixtures/                   # 双模式夹具（组合根）、.env 守卫、web 服务生命周期、数据目录
│   └── test-data/              # ui-catalog.js（部署相关 UI 预期数据）、case-catalog.js（用例描述提取）
├── pages/                      # 13 个页面对象（POM，一组件一文件，spec 零自建 locator）
├── tests/                      # 12 个模块 spec（正例 + 11-anti-cases 反例）+ 服务/认证 setup
├── reporters/
│   └── case-logger.js          # 控制台用例描述打印
├── scripts/                    # 探针/考古脚本（probe-*、explore-*）+ 报告归档 + xlsx 生成
├── docs/                       # 本文档、问题根因分析、自动化用例覆盖清单.xlsx
├── playwright-report/          # 最近一轮 HTML 报告（每轮覆盖，gitignored）
├── reports/                    # report:export 归档输出（gitignored）
└── test-results/               # 失败截图/trace 等原始产物（gitignored）
```

---

## 5. 用例被 skip 的原因对照

| 现象 | 原因 | 处理 |
|---|---|---|
| electron 轮整体 skip，提示「检测到桌面应用已在运行」 | 单实例锁：sparkseed 进程存活 | `taskkill //F //IM sparkseed.exe //T` 后重跑 |
| electron 轮整体 skip，提示「桌面端 exe 不可用 / E2E_DSH_EXE 未配置或路径不存在」 | 应用升级换了安装位置（如 rc.8 从 `D:\elineai` 迁到 `D:\sparkseed`） | 更新 `.env` 的 `E2E_DSH_EXE`，或删除该行让其自动探测 |
| 个别用例 skip：「web 专属用例（electron 轮）」 | M1-01/02、M2-01/02 等纯 web API 用例 | 正常，桌面轮合法跳过 |
| 个别用例 skip：附件链路 / 浏览器导航占位 | M5-01/02（桌面自动化边界）、M10-13（占位） | 正常，历史文档化跳过 |

skip 是**串行级联**的（serial describe 里一条 skip 会连跳后续），看到大片 skip 先找第一条的原因。

---

## 6. 常见问题排查

| 症状 | 原因与处理 |
|---|---|
| 应用启动即崩，日志 `dsh: .env sets "DSH_XXX" …` | `.env` 毒化：清掉 `E2E_` 以外的键（见 §1.2 警告框） |
| `Process failed to launch!`（偶发） | Playwright 启动窗口的瞬时噪音，retries 通常已兜底；连续出现再查 exe 路径与单实例 |
| 桌面端 welcome 握手失败 `Web authentication failed` | 历史病根是 `dsh-auth-*` cookie 无限累积顶到 16KB 请求头上限，**应用侧已修复**，套件也不再清理 cookie；若在旧版本上复现：升级应用，或手工删 `%APPDATA%/sparkseed/Network/Cookies`（登录态在 `~/.dsh/.credentials.yaml`，不受影响） |
| LLM 用例批量失败 `MISSING_CREDENTIAL` | 部署切到了官方 `deepseek-account` 路由但没给 key：`.env` 填 `E2E_LLM_API_KEY` |
| LLM 用例批量失败 `No available channel` | 模型路由/渠道问题（历史案例见 TEST-CASES.md 已知约束第 9 条），先用 web 探针区分中转故障与路由映射问题 |
| web 轮 settings 相关用例失败 | 已知应用缺陷（`profile reload requires the root Include entry`），应用修复前不视为用例缺陷；先对照桌面端行为 |
| 报告里找不到某条用例 | 被覆盖了：跑完下一轮前先 `npm run report:export` 留档 |

---

## 7. 维护指南

- **换部署 / 换版本**：UI 预期数据统一在 `fixtures/test-data/ui-catalog.js`（页签/开关/模式/
  模型目录/插件示例包名…），改数据表即可，用例体零改动。
- **选择器考古**：新区域先跑探针脚本（走 electron 同款启动方式，参考
  `scripts/probe-plugin-capability.js`），不要用 web + token 路径。
- **加用例**：先在 TEST-CASES.md 对应模块表格加一行（ID/标题/步骤/预期/形态）——它是
  用例描述的单一事实源（控制台打印与 HTML 报告自动提取），再在 spec 实现；
  反例加到 `tests/11-anti-cases.spec.js`（ID = 原 ID + `A`）。
- **覆盖清单**：`python scripts/build-coverage-xlsx.py` 重新生成 `docs/自动化用例覆盖清单.xlsx`。
- **已知历史包袱**：`~/.dsh` 为多版共用数据目录，若 `~/.dsh/profiles` 残留旧版包集会遮蔽
  运行时自带包（插件加载失败），改名让其回落自带包。
