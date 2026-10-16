// @ts-check
/**
 * 双模式测试夹具：同一套 spec 同时支持 web 与 electron（被测应用 = 官方版 DeepSeek Harness）
 *
 * - web 模式（默认）：chromium + storageState（登录态由 tests/auth.setup.js 离线构造）
 * - electron 模式：playwright._electron 启动官方版桌面客户端，取 dsh-app:// 主窗口作为 page
 *
 * 官方版与社区版的关键差别（决定了下面这些实现）：
 *   · 桌面 GUI 硬编码内部 host 端口 19387，窗口加载 `dsh-app://app/`（不是 http://127.0.0.1:3080）
 *   · 单实例锁是硬性的：抢不到锁的实例直接 app.quit()，Playwright 拿不到窗口
 *   · **没有任何 runtime 状态文件**（社区版那套「异常退出残留清理」是死代码，已删）
 *   · 启动会读当前工作目录的 .env，命中 DSH_ 前缀即抛错退出 → 必须给中性 cwd
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
const { DESKTOP_HOST_PORT, portInUse, desktopExe } = require('./ports');

// 机器相关配置统一走 .env（见 .env.example），命令行/CI 环境变量优先
loadEnv();

/** 桌面客户端常见安装位置（E2E_DSH_EXE 未设置时自动探测） */
const ELECTRON_PROBE_PATHS = [
  readEnv('E2E_DSH_EXE', ['DSH_ELECTRON_PATH']),
  `${process.env.LOCALAPPDATA || ''}/Programs/DeepSeek Harness/DeepSeek Harness.exe`,
  `${process.env.LOCALAPPDATA || ''}/Programs/deepseek-harness/DeepSeek Harness.exe`,
  `${process.env.PROGRAMFILES || 'C:/Program Files'}/DeepSeek Harness/DeepSeek Harness.exe`,
].filter(Boolean);

/** 探测第一个真实存在的桌面客户端 exe（env 指定的路径优先） */
function detectElectronPath() {
  const fromEnv = readEnv('E2E_DSH_EXE', ['DSH_ELECTRON_PATH']);
  const hit = ELECTRON_PROBE_PATHS.find(p => { try { return fs.existsSync(p); } catch { return false; } });
  if (hit && !fromEnv) console.log(`[electron] 未设置 E2E_DSH_EXE，自动探测到: ${hit}`);
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

/**
 * 等待并返回应用主窗口。
 *
 * 不能用 firstWindow()：官方版主窗口是 show=false 后异步创建的，且某些状态会先弹
 * onboarding/预览版说明窗口（URL 是 file: 或独立 dialog），firstWindow() 可能拿到它。
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

  /** electron 模式下的应用实例（web 模式或未配置路径时为 undefined） */
  electronApp: [async ({ mode }, use, testInfo) => {
    if (mode !== 'electron' || !ELECTRON_PATH) return use(undefined);

    // 官方版单实例锁是硬性的：已有实例在跑时，新进程会直接 quit()，Playwright 接不到窗口。
    // 用 19387（桌面 host 的硬编码端口）判定，而不是按进程名找——后者会误伤用户手动开的实例。
    if (await portInUse(DESKTOP_HOST_PORT)) {
      testInfo.skip(true, `检测到桌面实例已在运行（127.0.0.1:${DESKTOP_HOST_PORT} 被占用）。`
        + '官方版有硬性单实例锁，请先彻底退出 DeepSeek Harness 桌面应用再跑 electron 项目。');
    }

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
        + `最常见原因：① 单实例锁被占用（127.0.0.1:${DESKTOP_HOST_PORT} 已被别的实例监听）；`
        + '② 启动时的 cwd 下 .env 含 DSH_/XDG_ 等前缀键（官方版会读 .env 并抛错退出）。');
    }

    await use(app);
    await closeDesktopApp(app);
  }, { auto: true }],

  /**
   * 覆盖默认 page：electron 模式返回应用主窗口。
   *
   * 用例结束后的 10s 停留放在**这里**（而不是一个 auto 夹具）：
   * 本夹具依赖 page/electronApp，拆卸顺序在它们**之前**，因此这段时间里窗口仍然开着
   * ——目的是让人能对着最终画面快速审查。放在 auto 夹具里的话，它声明在最前、拆卸在最后，
   * 等到那时窗口早已关闭，屏幕上看不到任何东西。
   */
  page: async ({ page, mode, electronApp }, use, testInfo) => {
    let target = page;
    if (mode === 'electron') {
      if (!ELECTRON_PATH || !electronApp) {
        testInfo.skip(true, '未配置 E2E_DSH_EXE，跳过 Electron 用例（设置后重跑: E2E_DSH_EXE=<exe路径>）');
      }
      target = await waitForAppWindow(electronApp);
      // 桌面端内置认证；等 UI 就绪（新建会话按钮在首页与会话页都存在）
      await target.getByRole('button', { name: '新建会话' }).last().waitFor({ timeout: 30000 }).catch(() => {});
    }

    await use(target);

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
 * 官方版会 spawn detached 的子 host，只杀父进程会留孤儿占住 19387，
 * 进而让下一轮 launch 撞单实例锁。
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

  // 4) 复查桌面 host 端口
  if (await portInUse(DESKTOP_HOST_PORT)) {
    console.warn(`[electron] ⚠ 关闭后 ${DESKTOP_HOST_PORT} 仍在监听，可能有残留桌面进程`);
  }
}

function alive(app) {
  try { return app.process().exitCode === null; } catch { return false; }
}

module.exports = { test, expect, APP_URL, ELECTRON_PATH, RUNTIME_CWD };
