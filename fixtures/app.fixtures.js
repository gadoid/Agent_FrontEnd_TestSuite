// @ts-check
/**
 * 双模式测试夹具：同一套 spec 同时支持 web 与 electron
 *
 * - web 模式（默认）：chromium + storageState（由 tests/auth.setup.js 用 token 换取的 auth cookie）
 * - electron 模式：playwright._electron 启动桌面客户端，取第一个窗口作为 page；
 *   未设置 DSH_ELECTRON_PATH 时自动跳过（skip 而非 fail）。
 *
 * 用法（spec 内）：
 *   const { test, expect } = require('../fixtures/app.fixtures');
 *   test('...', async ({ page, mode, electronApp }) => { ... });
 *
 * electron 项目在 playwright.config.js 中声明 use: { mode: 'electron' }。
 */
const { test: base, expect, _electron } = require('@playwright/test');
const { createPages } = require('../pages');
const { ensureCleanRuntimeState, isServiceDown, servicePort } = require('./runtime-state');
const { loadEnv } = require('./env');

// 机器相关配置统一走 .env（见 .env.example），命令行/CI 环境变量优先
loadEnv();

/** 桌面客户端常见安装位置（DSH_ELECTRON_PATH 未设置时自动探测） */
const ELECTRON_PROBE_PATHS = [
  process.env.DSH_ELECTRON_PATH,
  'D:/eline-ai/Eline AI Desktop/Eline AI Desktop.exe',
  `${process.env.LOCALAPPDATA || ''}/Programs/eline-ai/Eline AI Desktop/Eline AI Desktop.exe`,
  `${process.env.PROGRAMFILES || 'C:/Program Files'}/eline-ai/Eline AI Desktop/Eline AI Desktop.exe`,
].filter(Boolean);

/** 探测第一个真实存在的桌面客户端 exe（env 指定的路径优先） */
function detectElectronPath() {
  const fs = require('fs');
  const fromEnv = process.env.DSH_ELECTRON_PATH;
  const hit = ELECTRON_PROBE_PATHS.find(p => { try { return fs.existsSync(p); } catch { return false; } });
  if (hit && !fromEnv) console.log(`[electron] 未设置 DSH_ELECTRON_PATH，自动探测到: ${hit}`);
  return hit || null;
}

/** electron 可执行文件路径（打包后的桌面客户端 exe）。
 *  Windows 下 Playwright 以 shell:true 启动，反斜杠路径会被 cmd 吃掉导致
 *  "Process failed to launch!"——统一归一化为正斜杠（Windows API 两种都接受）。 */
const ELECTRON_PATH = (detectElectronPath() || '').replace(/\\/g, '/');
/** 传给 electron 主进程的额外参数，空格分隔，可选 */
const ELECTRON_ARGS = (process.env.DSH_ELECTRON_ARGS || '').split(/\s+/).filter(Boolean);

/** web 模式下应用地址（与 playwright.config.js 的 baseURL 一致即可） */
const APP_URL = process.env.DSH_URL || 'http://127.0.0.1:3080';

const test = base.extend({
  /** 当前模式，由项目的 use.mode 注入，默认 web */
  mode: ['web', { option: true }],

  /** electron 模式下的应用实例（web 模式或未配置路径时为 undefined） */
  electronApp: [async ({ mode }, use, testInfo) => {
    if (mode !== 'electron' || !ELECTRON_PATH) return use(undefined);
    // 桌面实例探测到 3080 已有 runtime 会「依附并退出自己」，Playwright 无法接管
    // ——须与 web 服务分开跑。检测到服务运行时整组 skip 并说明，而非逐条失败。
    if (!(await isServiceDown(servicePort()))) {
      testInfo.skip(true, `检测到 dsh 服务运行中（:${servicePort()}）：桌面实例会依附现有服务退出，Playwright 无法接管。请先停止 web 服务（客户端退出）再单独跑 electron 项目（用例会自管 runtime）。`);
    }
    // dsh 启动会读 .dsh-desktop-runtime.json：存在即判定上次异常退出并走恢复流程。
    // 服务未运行时若残留该文件，先删除再启动。
    await ensureCleanRuntimeState({ logger: (m) => console.log(`[runtime-state] ${m}`) });
    const app = await _electron.launch({
      executablePath: ELECTRON_PATH,
      args: ELECTRON_ARGS.length ? ELECTRON_ARGS : undefined,
    });
    await use(app);
    // 打包客户端 close 可能挂住（退出确认/托盘常驻），限时后强杀进程兜底；
    // 残留进程会占住单实例锁，导致后续用例 launch 即退
    await Promise.race([
      app.close(),
      new Promise(r => setTimeout(r, 15000)),
    ]).catch(() => {});
    try {
      if (app.process().exitCode === null) app.process().kill('SIGKILL');
    } catch {}
  }, { auto: true }],

  /** 覆盖默认 page：electron 模式返回应用首个窗口 */
  page: async ({ page, mode, electronApp }, use, testInfo) => {
    if (mode !== 'electron') {
      // web 模式：直接使用带 storageState 的默认 page（配置注入）
      await use(page);
      return;
    }
    if (!ELECTRON_PATH || !electronApp) {
      // 优雅跳过而不是失败
      testInfo.skip(true, '未设置 DSH_ELECTRON_PATH，跳过 Electron 用例（设置后重跑: DSH_ELECTRON_PATH=<exe路径>）');
    }
    const win = await electronApp.firstWindow({ timeout: 60000 });
    // 桌面客户端内置认证，等 UI 就绪即可
    await win.getByRole('button', { name: '新建会话' }).last().waitFor({ timeout: 30000 }).catch(() => {});
    await use(win);
  },

  /** 页面组件组合（组合根注入，spec 不自建组件） */
  pages: async ({ page, mode }, use) => {
    await use(createPages(page, mode));
  },
});

module.exports = { test, expect, APP_URL, ELECTRON_PATH };
