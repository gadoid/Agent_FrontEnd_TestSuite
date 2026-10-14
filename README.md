# DSH 客户端自动化测试套件

对 [DSH 客户端](https://github.com/bruc3van/dsh-desktop)（DeepSeek Harness /「外贸赋能中心」）的 Playwright 端到端测试套件，**同一套用例支持 Web 与 Electron 桌面双形态**，覆盖真实 LLM 对话全链路。

## 覆盖范围（8 模块 / 31 用例）

| 模块 | 主题 | 亮点 |
|------|------|------|
| M1 | 安装/启动 | 服务健康、未认证拦截（401）、关键 UI 就绪 |
| M2 | 登录/认证 | token→HttpOnly cookie（30 天）、裸请求被拒 |
| M3 | 对话 | 真实 LLM 流式回复断言、多轮上下文、会话留存 |
| M4 | 插件安装 | 市场目录、安装差集断言、启停切换（electron） |
| M5 | 知识库命中 | 附件上传、随机标记问答验证命中（仅文件可知） |
| M6 | 消息操作 | 复制（剪贴板）、点赞、点踩表单、会话分支 |
| M7 | 用量/用时 | tok 解析（K/M）、秒数、明细弹层、会话统计条 |
| M8 | 其他 UI | 指令面板、模型选择、访问模式、搜索、主题、右侧栏 |

完整用例表与选择器考古记录见 [TEST-CASES.md](./TEST-CASES.md)。

## 快速开始

```bash
npm install
npx playwright install chromium

# 机器相关配置（token / 桌面端路径 / 服务地址）
cp .env.example .env   # 填入 DSH_TOKEN（客户端启动时打印的 /?token=xxx）

npm run test:web        # Web 形态（需 dsh web 服务已运行，默认 127.0.0.1:3080）
npm run test:electron   # 桌面形态（需 web 服务已停止，用例自管 runtime）
npm run report          # HTML 报告
```

> 双端分开跑：3080 服务运行时桌面实例会依附现有服务退出，electron 夹具检测到会整组 skip 说明原因。

## 架构（POM 组件化）

```
fixtures/          # 双模式夹具（web/electron）+ .env 加载 + runtime 状态管理
pages/             # 11 个页面对象（一组件一文件，spec 零自建 locator）
tests/             # 8 个模块 spec + auth.setup
```

- **组合根**：fixtures 注入 `pages` 组合对象，选择器变更只改 pages 一处
- **双端同构**：`mode` 夹具区分 web（chromium+storageState）/ electron（`_electron.launch` 首窗口）
- **工程化细节**：`.dsh-desktop-runtime.json` 异常退出残留自动清理、token/cookie 生命周期管理、真实 LLM 波动的 retries 兜底、workers 限流防服务端连锁超时
