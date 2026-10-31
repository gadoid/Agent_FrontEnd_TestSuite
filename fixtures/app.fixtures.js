// @ts-check
/**
 * 双模式测试夹具：同一套 spec 同时支持 web 与 electron（被测应用 = SparkSeed 桌面客户端）
 *
 * - web 模式（默认）：chromium + storageState（登录态由 tests/auth.setup.js 准备）
 * - electron 模式：playwright._electron 启动 sparkseed 桌面客户端，取 dsh-app:// 主窗口作为 page
 *
 * SparkSeed（D:\sparkseed\sparkseed.exe，官方 DeepSeek Harness v0.2.0-rc.7，2026-10 实测）：
 *   · 前身 ElineAI（rc.2 定制构建）已更名 SparkSeed；dsh-app://app/ 主窗口、内部
 *     dsh host、~/.dsh 业务数据布局均延续。
 *   · **桌面内部 host 不再硬编码 19387**（改随机端口）——「是否已有实例」按映像名
 *     查进程判定（Electron requestSingleInstanceLock 单实例锁仍硬性，抢不到即 quit）。
 *   · 欢迎流程重做：file://welcome.html 登录/API Key 引导（无旧版「预览版说明」弹窗）；
 *     凭据在 ~/.dsh/.credentials.yaml，已登录状态下启动直达主窗口。
 *   · **cookie 离线构造不可用**（与 eline 相同）：web 登录态走 token 流程
 *     （`dsh web` 启动输出 ?token=…，web-server 夹具自动捕获）。
 *   · 启动会读当前工作目录的 .env，命中 DSH_ 前缀即抛错退出 → 必须给中性 cwd。
 *
 * 用法（spec 内）：
 *   const { test, expect } = require('../fixtures/app.fixtures');
 *   test('...', async ({ page, mode, pages }) => { ... });
 */
const { test: base, expect, _electron } = require('@playwright/test');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createPages } = require('../pages');
const { loadEnv, readEnv, llmEnv } = require('./env');
const { desktopAppRunning, desktopImageName, desktopExe } = require('./ports');
const { describeTitle } = require('./test-data/case-catalog');

// 机器相关配置统一走 .env（见 .env.example），命令行/CI 环境变量优先
loadEnv();

/** 桌面客户端常见安装位置（E2E_DSH_EXE 未设置时自动探测） */
const ELECTRON_PROBE_PATHS = [
  readEnv('E2E_DSH_EXE', ['DSH_ELECTRON_PATH']),
  'D:/sparkseed/sparkseed.exe',
  `${process.env.LOCALAPPDATA || ''}/Programs/sparkseed/sparkseed.exe`,
  `${process.env.LOCALAPPDATA || ''}/Programs/DeepSeek Harness/DeepSeek Harness.exe`,
].filter(Boolean);

/** 探测第一个真实存在的桌面客户端 exe（env 指定的路径优先） */
function detectElectronPath() {
  const fromEnv = readEnv('E2E_DSH_EXE', ['DSH_ELECTRON_PATH']);
  const hit = ELECTRON_PROBE_PATHS.find(p => { try { return fs.existsSync(p); } catch { return false; } });
  if (hit && !fromEnv) console.log(`[electron] 未设置 E2E_DSH_EXE，自动探测到: ${hit}`);
  if (!hit && fromEnv) {
    console.warn(`[electron] ⚠ E2E_DSH_EXE=${fromEnv} 不存在——应用可能升级后更换了安装位置，请更新 .env`);
  }
  return hit || null;
}

/** electron 可执行文件路径。
 *  Windows 下 Playwright 以 shell:true 启动，反斜杠路径会被 cmd 吃掉导致
 *  "Process failed to launch!"——统一归一化为正斜杠。 */
const ELECTRON_PATH = (detectElectronPath() || '').replace(/\\/g, '/');
/** 传给 electron 主进程的额外参数，空格分隔，可选 */
const ELECTRON_ARGS = (readEnv('E2E_ELECTRON_ARGS', ['DSH_ELECTRON_ARGS']) || '').split(/\s+/).filter(Boolean);

/** web 模式下应用地址 */
const APP_URL = process.env.E2E_URL || 'http://127.0.0.1:3080';

/** 中性 cwd：官方版若以项目根为 cwd 会读到 .env 里的 DSH_ 前缀键并启动失败 */
const RUNTIME_CWD = path.join(os.tmpdir(), 'dsh-e2e-cwd');

/** 用例结束后的窗口停留时长：保持页面/桌面实例存活，供人工对着最终画面快速审查。
 *  实际等待位置见下方 page 夹具（必须在拆卸之前，否则窗口已关、看不到东西）。 */
const TEST_PAUSE_MS = 10_000;

/** 快用例的最短观测时长（ms）：用例执行完到结束截图不足该时长时补足等待——
 *  太短的自动化执行一闪而过，截图前多停一会便于观察过程、也等 UI 动画收敛。
 *  仅对「通过」的用例生效（失败/超时立即截图出报告，不拖延）；0 = 关闭。
 *  实际等待位置见下方 page 夹具。 */
const MIN_TEST_DURATION_MS = Number(readEnv('E2E_MIN_TEST_MS') ?? 6000) || 0;

/**
 * 等待并返回应用主窗口。
 *
 * 不能用 firstWindow()：主窗口是 show=false 后异步创建的，且未登录等状态会先弹
 * 欢迎引导窗口（rc.7 为 file://welcome.html），firstWindow() 可能拿到它。
 * 这里按 URL 前缀挑 dsh-app:// 的窗口。
 */
async function waitForAppWindow(app, timeout = 90000) {
  const seen = new Set();
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    for (const w of app.windows()) {
      const u = w.url();
      if (!seen.has(u)) {
        seen.add(u);
        console.log(`[electron] 窗口出现: ${u}`);
      }
      if (u.startsWith('dsh-app://')) return w;
    }
    await new Promise(r => setTimeout(r, 1000));
  }
  const urls = app.windows().map(w => w.url());
  throw new Error(`等待 dsh-app:// 主窗口超时（${timeout}ms）。已出现的窗口: ${urls.join(', ') || '(无)'}`);
}

const test = base.extend({
  /** 当前模式，由项目的 use.mode 注入，默认 web */
  mode: ['web', { option: true }],

  /**
   * 报告增强①——用例描述：按用例标题里的 ID（M8-01 / M3-01A…）到 TEST-CASES.md
   * 取「标题；前置；步骤；预期」写入报告注解，HTML 报告用例详情页显示「用例描述」。
   */
  caseDescription: [async ({ }, use, testInfo) => {
    const desc = describeTitle(testInfo.title);
    if (desc) testInfo.annotations.push({ type: '用例描述', description: desc });
    await use();
  }, { auto: true }],

  /** electron 模式下的应用实例（web 模式或未配置路径时为 undefined） */
  electronApp: [async ({ mode }, use, testInfo) => {
    if (mode !== 'electron' || !ELECTRON_PATH) return use(undefined);

    // SparkSeed 单实例锁是硬性的（Electron requestSingleInstanceLock）：已有实例在跑时，
    // 新进程会直接 quit()，Playwright 接不到窗口。rc.7 起内部 host 改随机端口、19387
    // 硬编码已移除，因此按映像名查进程判定，而不是按端口。
    if (await desktopAppRunning()) {
      testInfo.skip(true, `检测到桌面实例已在运行（${desktopImageName()} 进程存活）。`
        + 'SparkSeed 有硬性单实例锁，请先彻底退出 SparkSeed 桌面应用再跑 electron 项目。');
    }

    // 历史：这里曾在每次拉起前清理累积的 dsh-auth-* cookie（旧版 host 无限签发
    // 唯一随机名 cookie 顶到 16KB 请求头上限，welcome 握手被拒启动即崩）。
    // 该问题应用侧已修复（2026-10-31），套件不再清理 cookie，勿再引入。

    fs.mkdirSync(RUNTIME_CWD, { recursive: true });
    const app = await _electron.launch({
      executablePath: ELECTRON_PATH,
      cwd: RUNTIME_CWD,                    // 中性 cwd：避开项目根 .env（DSH_ 前缀会让应用启动失败）
      args: ELECTRON_ARGS.length ? ELECTRON_ARGS : undefined,
      env: { ...process.env, ...llmEnv() },   // 注入 LLM 凭据（deepseek-account 路由读 DEEPSEEK_API_KEY）
      timeout: 60000,
    });

    // 启动后 2s 复查：抢不到锁 / .env 中毒 都会表现为「起来就退」
    await new Promise(r => setTimeout(r, 2000));
    if (app.process().exitCode !== null) {
      throw new Error(`桌面进程启动后立即退出（exitCode=${app.process().exitCode}）。`
        + `最常见原因：① 单实例锁被占用（已有 ${desktopImageName()} 进程在跑）；`
        + '② 启动时的 cwd 下 .env 含 DSH_/XDG_ 等前缀键（应用会读 .env 并抛错退出）。');
    }

    await use(app);
    await closeDesktopApp(app);
  }, { auto: true }],

  /**
   * 覆盖默认 page：electron 模式返回应用主窗口。
   *
   * 用例结束后的报告增强动作放在**这里**（而不是一个 auto 夹具）：
   * 本夹具依赖 page/electronApp，拆卸顺序在它们**之前**，因此这段时间里窗口仍然开着
   * ——结束截图与人工审查停留都需要窗口存活；放在 auto 夹具里的话，它声明在最前、
   * 拆卸在最后，等到那时窗口早已关闭。
   */
  page: async ({ page, mode, electronApp }, use, testInfo) => {
    let target = page;
    if (mode === 'electron') {
      if (!ELECTRON_PATH || !electronApp) {
        testInfo.skip(true, '桌面端 exe 不可用：E2E_DSH_EXE 未配置、或配置的路径不存在'
          + '（应用升级可能更换了安装位置），也未能在常见位置探测到。'
          + '请更新 .env 的 E2E_DSH_EXE 后重跑。');
      }
      target = await waitForAppWindow(electronApp);
      // 桌面端内置认证；等 UI 就绪（新建会话按钮在首页与会话页都存在）
      await target.getByRole('button', { name: '新建会话' }).last().waitFor({ timeout: 30000 }).catch(() => {});

      // rc.7 起 dock 页签布局按会话持久化到 localStorage（dsh.sidebar-right.v1.*），
      // 终端页签另有全局绑定（dsh.terminal.binding.v1.*）：先前用例开的终端/文件页签
      // 会在新一轮启动时恢复，顶掉会话的 对话/轨迹 视图与「开始」落地页。
      // 每次拉起清一次并重载，恢复「每个用例干净 dock」的隔离假设。
      try {
        const cleared = await target.evaluate(() => {
          const kill = [];
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (/^dsh\.sidebar-right\.v1\.|^dsh\.terminal\.binding\.v1\.|^dsh\.terminal\.close\.v1\./.test(k)) kill.push(k);
          }
          kill.forEach(k => localStorage.removeItem(k));
          return kill.length;
        });
        if (cleared > 0) {
          console.log(`[electron] 已清理 ${cleared} 个 dock/终端绑定 localStorage 键并重载窗口（rc.7 dock 持久化隔离）`);
          await target.reload();
          await target.getByRole('button', { name: '新建会话' }).last().waitFor({ timeout: 30000 }).catch(() => {});
        }
      } catch (e) {
        console.warn(`[electron] 清理 dock 持久化键失败（忽略，不影响用例）: ${e.message}`);
      }

      // 防御性兜底：个别部署首载会弹全屏遮罩（如命令行安装确认），不关会拦住点击。
      // rc.7 已无「预览版说明」弹窗，正常情况下这里不会命中。
      const cont = target.getByRole('button', { name: '继续', exact: true }).first();
      if (await cont.isVisible().catch(() => false)) await cont.click({ timeout: 5000 }).catch(() => {});
    }

    await use(target);

    // —— 报告增强②——快用例补足最短观测时长：
    // 执行时间不足 MIN_TEST_DURATION_MS 的用例（失败/超时除外）等到阈值再截图，
    // 避免「一闪而过」的执行拍不出有意义的最终画面。
    if (testInfo.status === 'passed' && MIN_TEST_DURATION_MS > 0) {
      const elapsed = Date.now() - new Date(testInfo.startTime).getTime();
      if (elapsed < MIN_TEST_DURATION_MS) {
        await new Promise(r => setTimeout(r, MIN_TEST_DURATION_MS - elapsed));
      }
    }

    // —— 报告增强③——结束截图：不论成败都把「执行完毕时」的画面附进报告
    // （失败场景另有 Playwright 自带的失败截图，两张互补）。绝不因截图失败影响用例结果。
    try {
      const file = testInfo.outputPath('结束截图.png');
      await target.screenshot({ path: file, timeout: 10_000 });
      await testInfo.attach('结束截图', { path: file, contentType: 'image/png' });
    } catch (e) {
      console.warn(`[report] 「${testInfo.title}」结束截图失败（不影响用例结果）: ${e.message}`);
    }

    // 窗口仍存活，先停 10s 供人工查看最终状态，再交给上层夹具拆卸
    await new Promise(r => setTimeout(r, TEST_PAUSE_MS));
  },

  /** 页面组件组合（组合根注入，spec 不自建组件） */
  pages: async ({ page, mode, electronApp }, use) => {
    // 把 electronApp 一并注入：桌面端有些能力（如读剪贴板）只能经 Electron 主进程模块拿到
    await use(createPages(page, mode, { electronApp }));
  },
});

/**
 * 分级关闭桌面实例——全程有界、绝不抛错。
 *
 * 加固原因：社区版时代出现过「worker 拆卸超时 180s」导致后续 18 条用例被整体跳过。
 * 应用会 spawn detached 的子 host，只杀父进程会留孤儿，进而让下一轮 launch 撞单实例锁。
 */
async function closeDesktopApp(app) {
  const pid = (() => { try { return app.process().pid; } catch { return null; } })();

  // 1) 优雅关闭
  await Promise.race([app.close().catch(() => {}), new Promise(r => setTimeout(r, 8000))]);
  if (pid && !alive(app)) return;

  // 2) app.exit(0)：绕过 before-quit/托盘常驻的阻挠
  await Promise.race([
    app.evaluate(({ app: a }) => a.exit(0)).catch(() => {}),
    new Promise(r => setTimeout(r, 5000)),
  ]);
  if (pid && !alive(app)) return;

  // 3) 树杀：清掉 detached 的子 host
  if (pid) {
    await new Promise((resolve) => {
      const { spawn } = require('child_process');
      const p = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
      p.on('exit', resolve); p.on('error', resolve);
    });
    await new Promise(r => setTimeout(r, 2000));
  }

  // 4) 复查：确认没有残留的同名进程（占着单实例锁会让下一轮 launch 直接 quit）
  if (await desktopAppRunning()) {
    console.warn(`[electron] ⚠ 关闭后仍有 ${desktopImageName()} 进程存活，可能有残留桌面进程，下一轮 launch 会撞单实例锁`);
  }
}

function alive(app) {
  try { return app.process().exitCode === null; } catch { return false; }
}

module.exports = { test, expect, APP_URL, ELECTRON_PATH, RUNTIME_CWD };
