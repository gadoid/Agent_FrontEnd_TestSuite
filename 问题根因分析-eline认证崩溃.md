# 根因分析：eline 桌面端启动「Web authentication failed」崩溃

| 项目 | 内容 |
|---|---|
| 日期 | 2026-10-26 |
| 被测对象 | ElineAI 桌面客户端 `D:\ElineAI\eline.exe`（官方 DeepSeek Harness 基座，版本 **0.2.0-rc.6**，Electron 44 / Node 24.18.1 / win32 x64） |
| 测试套件 | `D:\Agent_FrontEnd_TestSuite`（Playwright，`--project=electron`，每条用例独立拉起一次应用） |
| 现象签名 | 启动即崩，崩溃日志错误恒为 `Error: desktop welcome: Web authentication failed`（`app.asar/lib/main.js:8080`） |
| **最终根因** | **host 每次启动签发唯一随机名的 `dsh-auth-<random>` cookie，Chromium cookie 罐只增不减；启动握手携带全部历史 cookie，累计 ~71 个（≈15.7KB）时 Cookie 请求头超过 Node 默认 16KB 上限，host 拒绝请求 → 握手非 2xx → 应用硬崩溃** |
| 误判澄清 | 与「认证站点（elineai.21eline.com）重启」**无因果关系**，时间上巧合 |
| 确定性 | **状态确定性缺陷，非概率问题**：给定 cookie 数量，100% 复现；清理后 100% 恢复 |

---

## 1. 问题概述

自动化测试轮（`--project=electron`，101 条用例，串行）在运行中途突然进入「每条用例秒败」状态，
eline 桌面端此后**每次启动都崩溃**，崩溃对话框提示：

> The application could not start or stopped unexpectedly.
> desktop welcome: Web authentication failed
> Diagnostic report: `C:\Users\<user>\AppData\Roaming\eline\logs\crash-*-host.log`
> If application files are missing or damaged, close the application and reinstall it. …

同日两次测试轮均在 **约 50-60 次应用启动后** 触发同一崩溃；清空 Chromium cookie 罐后立即恢复，
且 **登录态（`.credentials.yaml`）不受影响**。最终定位为 cookie 累积导致请求头超限，
与认证服务器状态无关。

---

## 2. 影响范围

| 维度 | 影响 |
|---|---|
| 自动化测试 | 两轮 electron 轮次报废：第一轮 35 通过 / 46 失败 / 13 未执行；第二轮 52 通过后反例段全灭（每条 1.3 分钟连续失败） |
| 真实用户 | **每个用户都必然走向此崩溃**：每次重启应用 +1~2 个 cookie，按日常使用强度数天到数周内达到 ~72 个阈值；触发后应用无法启动，应用内无自救路径 |
| 数据安全 | 无数据损失。会话数据在 `~/.eline/sessions`，删除 cookie 罐不影响登录态与业务数据 |
| 恢复成本 | 手动删除一个文件（`%APPDATA%\eline\Network\Cookies`）后重启应用重新登录即可；应用崩溃对话框给出的「重装应用」建议远重于必要 |

---

## 3. 时间线（2026-10-26，本地时间）

| 时间 | 事件 |
|---|---|
| 12:26 | 启动全量测试（web 轮），12:47 改为只跑桌面端 |
| ~12:50 | 桌面端轮 A 启动，11 条通过，因「插件市场」反馈暂停（该问题另行结论：本构建无「易链市场」属设计变更，见 §9） |
| ~13:10 | 桌面端轮 B 启动（完整轮） |
| ~13:33 | 轮 B 进行至 55 条时用户报告用例失败；检查发现第 58 条起**全部亚秒级（0.6-0.8s）失败** |
| ~13:40 | 用户反馈「重启了认证用的站点」→ 初步误判为认证侧会话失效（见 §6） |
| 13:44–14:02 | 崩溃日志 10 条（`crash-2026-10-26T05:44Z`～`06:02Z`），签名完全一致 |
| 13:55 | 轮 B 停止。小计：35 通过 / 1 flaky / 6 按设计跳过 / 13 串行未执行 / 46 失败 |
| 14:05 | 清除 Electron cookie 罐（备份为 `Cookies.bak-20261026`）；同时期已备份移除 `.credentials.yaml`（`​.credentials.yaml.bak-20261026`，事后证明该步非必需） |
| 14:06 | 启动应用 → **不再崩溃**，正常显示登录欢迎页 |
| 14:22–14:23 | 用户完成浏览器授权登录；`.credentials.yaml` 重写为完整三段（browser-session / platform-device / platform-token） |
| 14:30 | 轮 C 启动（全新登录态重跑） |
| 14:30–14:55 | 轮 C 连续 52 条通过（含 M1-M7 全部、M8/M9/M10 大部） |
| **14:55:54** | **崩溃再次出现**（cookie 库中最后一个 cookie 写入时刻 = 第一条新崩溃日志 `crash-2026-10-26T06:55:54Z` 时刻，精确到秒） |
| 14:55–15:06 | 崩溃日志 9 条，间隔恒定 ~77 秒（= 每条反例用例「拉起→失败」节奏）；反例段每条 1.3 分钟失败 |
| 15:10 | 轮 C 停止；cookie 库取证：**71 个 `dsh-auth-*`，合计 16117 字节 ≈ 15.7KB** |
| 15:2x | 测试夹具修复（每次拉起前清理），轮 D 重跑 |

---

## 4. 根因链（完整机制）

### 4.1 启动握手流程（逆向自 `D:\ElineAI\resources\app.asar` → `lib/main.js`）

```
start()                                                  // main.js:11337 附近
 ├─ host.start()                    // 拉起内置 Desktop Host 子进程，得到 ready.url
 ├─ authenticateWebHost(ready.url)  // main.js:7425：裸 fetch，期望 303 + set-cookie
 │                                  // ✔ 此步始终成功（失败会报另一错误 "Desktop Host authentication failed"）
 └─ connectDesktopWelcome(ready.url, net.fetch)          // main.js:8077
      ├─ const authenticated = await send(authenticatedUrl, { credentials: "include" });
      └─ if (!authenticated.ok) throw new Error("desktop welcome: Web authentication failed");
         // ↑ main.js:8080 —— 唯一崩溃点，且无重试、无降级、无登录引导
```

关键点：`credentials: "include"` 使这次 fetch **携带 Electron 会话 cookie 罐中 127.0.0.1 的全部 cookie**。

### 4.2 cookie 无限累积

- host 每次启动签发的认证 cookie 名字带**唯一随机后缀**（实测样本 `dsh-auth-lix1HBvSQ19zJkJVuHvyMkBfrmY9yJe74CZIruqkBAA`，名称段 52 字符、值段 173 字符）；
- Chromium cookie 罐按「名字+域」覆盖旧值——名字每次都不同 → **永不覆盖、只增不减**；
- 所有 cookie 域均为 `127.0.0.1` → 后续对 host 的每个请求都会携带**全部**历史 cookie。

### 4.3 超限与拒绝

| 度量 | 实测值 |
|---|---|
| 崩溃时刻 cookie 数 | 71 个 |
| 单 cookie 开销 | name(52) + value(173) + 分隔 ≈ 227 字节 |
| Cookie 头合计 | **16117 字节 ≈ 15.7KB** |
| Node.js `maxHeaderSize` 默认值 | **16384 字节（16KB）** |

加上 UA 等其他请求头即越过 16KB 上限，host 侧 HTTP 解析器拒绝该请求
（推断为 400/431 类拒绝；崩溃日志未记录状态码，属产品可观测性缺陷，见 §7）。
`net.fetch` 拿到非 2xx → `!authenticated.ok` → throw → 应用以 `exitCode=0` 退出。

> 注：同一签名在两轮中的 Playwright 失败时长不同（上午亚秒级 / 下午 ~75-78 秒），
> 差异源于进程退出与 Playwright 附加的时序，不影响根因判定。

### 4.4 决定性证据（下午二次崩溃）

下午轮 C 使用**全新登录态**（14:23 凭据三段齐全）、站点全程健康（探针 200 / 0.15s）、
cookie 罐 14:05 刚清空——在 ~50-60 次启动后于 14:55:54 **再次崩溃**。
「认证站点会话失效」假设无法解释此现象；cookie 计数假设完美解释（见 §5、§6）。

---

## 5. 排查过程与实验记录

| # | 实验 | 结果 | 当时推断 | 事后修正 |
|---|---|---|---|---|
| 1 | 崩溃日志分析（`%APPDATA%\eline\logs\crash-*-host.log`） | 全部同一签名 `connectDesktopWelcome → Web authentication failed` | 认证失败 | ✓ 但「认证失败」的原因当时判断错误 |
| 2 | 认证站点探针 `GET /`、`GET /health` | 均 200，延迟正常 | 站点活着，但怀疑桌面专用接口坏 | 站点全程无关 |
| 3 | `dsh web` CLI 全链路（token→303→cookie→200） | 完全正常 | 「web 形态健康，桌面握手特殊」 | 部分误导：web 形态不经过 Electron cookie 罐，天然不受累积影响 |
| 4 | 删除 `.credentials.yaml` 后启动 | **仍崩**（05:53Z） | 误判为「服务端会话失效，重登录也无济于事」 | 该文件本就不是死因 |
| 5 | 崩溃对话框点「Restart」 | **仍崩**（05:52Z） | 排除应用内自救 | Restart 不清 cookie，必然无效 |
| 6 | 清空 Electron cookie 罐（`Network\Cookies`）后启动 | **成功**，直达登录欢迎页 | 当时仍解读为「清掉了失效会话」 | 真实原因：cookie 计数归零，请求头退回阈值以下 |
| 7 | 全新浏览器授权登录后重跑轮 C | 52 条通过后于 14:55:54 再次崩溃 | —— | **决定性反证**：站点健康+新会话仍崩，指向本地随启动次数增长的状态 |
| 8 | cookie 库取证（`node:sqlite` 读 `Network\Cookies`） | 71 个 `dsh-auth-*`，名字唯一、只增不减，合计 16117B；最后一个 cookie 时刻 = 第一条崩溃日志时刻（精确到秒） | —— | **根因实锤** |
| 9 | 阈值核算 | 71×227B=16117B，+其他头越 16384B（Node `maxHeaderSize` 默认） | —— | 机制闭环 |

> 上午崩溃时的 cookie 库内容已被清理无法直接取证，但上午与下午两次崩溃的
> 「距上次清空的应用启动次数」规模一致（~55 与 ~50-60），且下午数据为实测。

---

## 6. 误判分析：为什么最初认定是认证站点

1. **时间强相关**：崩溃级联开始前数分钟，用户确实重启了认证站点；
2. **错误信息误导**：`Web authentication failed` 字面上指向认证；且当时已知「删凭据文件无效」（实验 #4），自然滑向「服务端会话被作废」的解释——该解释与实验 #4 表面吻合；
3. **第一个恢复实验的二义性**：清 cookie 后恢复，既可以解释为「清掉失效会话」，也可以解释为「cookie 计数归零」——当时选择了前一种叙事；
4. **破局点**：下午在「站点健康 + 全新登录」条件下二次崩溃（实验 #7），单一假设（站点失效）无法容纳，转而寻找「随启动次数单调增长的状态变量」，cookie 罐即命中。

**方法论教训**：时间相关性 + 语义贴合的错误文案极易构造出自洽的错误假设；
对「运行一段时间后必然出现/突然出现」的缺陷，应尽早排查**单调累积的本地状态**
（缓存、cookie、日志、句柄、临时文件），并设计「保持其余条件不变、只重置该变量」的对照实验。

---

## 7. 修复建议

### 7.1 产品侧（eline / dsh-desktop-host）

| 优先级 | 建议 | 说明 |
|---|---|---|
| **P0** | 修复 cookie 生命周期 | 三选一：① host 使用**固定** cookie 名（Chromium 按名覆盖，罐子自限）；② 应用启动握手前清理 127.0.0.1 下的历史 `dsh-auth-*`；③ host 提升 `maxHeaderSize` 并对超长 Cookie 头自愈（取最新一条有效会话） |
| **P0** | 启动认证失败降级 | `connectDesktopWelcome` 非 2xx 时区分场景：带 cookie 被拒 → **清失效会话 cookie 并转登录页**（现版本「未认证」路径本来就能优雅到达登录页，只差这一步降级）；至少崩溃对话框应提供「重置会话并重新登录」按钮，而非建议重装 |
| P2 | 可观测性 | 崩溃日志记录握手失败的 HTTP 状态码、请求头大小、cookie 数量——本次排查中若有状态码可少走弯路 |

### 7.2 测试套件侧（已实施）

- `fixtures/app.fixtures.js` 新增 `purgeAccumulatedAuthCookies()`：electron 夹具每次拉起前，
  用 Node 内置 `node:sqlite` 删除 `Network\Cookies` 中 `dsh-auth-%` 行（应用未运行时操作，实测 71→0），
  使测试轮 100+ 次启动与该崩溃彻底解耦；
- 登录态存放于 `~/.eline/.credentials.yaml`，不受清理影响（实测验证）；
- README「工程化细节」已补充该机制记录。

### 7.3 用户/运维侧临时恢复方案（官方修复前）

```bat
taskkill /IM eline.exe /F
ren "%APPDATA%\eline\Network\Cookies" Cookies.bak
```

重启应用 → 走登录页重新授权即可。只需删这一个文件；无需重装应用。

---

## 8. 遗留与后续

1. 轮 D（cookie 修复后）结果待出。已知的**真实缺陷候选**（在健康环境下稳定复现，待取证）：
   - M8-06 主题切换（亮度阈值断言，两轮×两次尝试全挂）
   - M8-12 字号增大/减小即时生效（同上）
   - M9-07 模型选择（当前模型与可选列表，同上）
   - M10-06 语言切换（按目录往返，同上；其失败导致 M10 后续用例串行跳过）
   - 另有 M8-09、M9-04、M10-04、M10-05 等首试失败但重试通过（偶发，retries 兜底）；
2. **42 条反例用例（11-anti-cases）至今未在健康环境下执行过**——两轮均在反例段开始前后被崩溃级联吞掉，轮 D 是首次有效执行；
3. 上轮误报为失败的用例（如 M10-01 @ 引用）在健康轮已通过，证实为事故误伤。

---

## 9. 其他发现（非本次故障原因）

- **「插件市场」缺失属设计变更，非缺陷**：本 eline 构建（官方 DSH 基座）已移除社区版的「易链市场」弹窗，插件管理收敛为侧栏「插件」页（官方 8 个插件：智能体团队、自动授权审查、自动化任务、语音输入、终端、Agent 循环、子智能体、网页搜索）。实测「正常启动」与「测试拉起」的插件加载完全一致（8 行 + 4 条分组说明项 + 工具栏完整），自动化用例 M4 与实际形态吻合。

---

## 附录 A：证据清单

| 证据 | 路径 / 位置 |
|---|---|
| 崩溃日志（两批，签名一致） | `%APPDATA%\eline\logs\crash-2026-10-26T05:44Z ～ 06:02Z`、`06:55:54Z ～ 07:06:11Z` |
| 崩溃代码位置 | `D:\ElineAI\resources\app.asar` → `lib/main.js:8080`（throw 点）、`11337`（start 调用）、`7425`（authenticateWebHost）；用 `node scripts/asar-read.js cat lib/main.js` 提取 |
| cookie 库 | `%APPDATA%\eline\Network\Cookies`（SQLite；`SELECT name, creation_utc FROM cookies WHERE name LIKE 'dsh-auth-%'`） |
| 登录凭据（三段结构） | `~/.eline/.credentials.yaml`（browser-session / deepseek-account-platform/device / deepseek-account-platform/default） |
| 本次清理的备份 | `~/.eline/.credentials.yaml.bak-20261026`、`%APPDATA%\eline\Network\Cookies.bak-20261026` |
| 测试轮日志 | 本会话 Playwright 输出（轮 B/C 的 list reporter 记录，HTML 报告 `playwright-report/`） |
| 夹具修复 | `fixtures/app.fixtures.js` → `purgeAccumulatedAuthCookies()`；`README.md` 工程化细节 |
