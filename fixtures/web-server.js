// @ts-check
/**
 * web 形态服务生命周期：套件自行拉起/关闭官方版 `dsh web`
 *
 * 与社区版的差别：社区版要用户先启动客户端、再由客户端在 3080 起服务；官方版可直接
 * 用 CLI 起（`dsh web`，默认 3080），因此套件自管，不再依赖人工前置步骤。
 *
 * 关键实现点：
 *   1. **直接调 cli.js**，不走 `dsh.cmd` —— 安装路径含空格，绕开 cmd.exe 的引号地狱；
 *      等价于 dsh.cmd 内部做的 `ELECTRON_RUN_AS_NODE=1 <exe> --expose-internals <cli.js>`。
 *   2. **中性 cwd** —— 官方版会读当前工作目录的 .env，命中 DSH_ 前缀就抛错退出（见 env.js）。
 *   3. **就绪判定优先看 stdout** 的 `dsh web: <url>` 行（顺带拿到 ?token= 兜底凭证），
 *      端口监听作为兜底（未认证 GET / 返回 401 也算就绪，不能只看 2xx）。
 *   4. **关闭必须杀进程树** —— 官方版会 spawn 子 host 且 detached，只杀父会留孤儿占端口。
 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { loadEnv, readEnv, llmEnv, dshChildEnv } = require('./env');
const { portInUse, waitForPortInUse, waitForPortFree, servicePort, serviceHost, desktopExe, desktopAppRunning } = require('./ports');

loadEnv();

/** 运行期文件目录（不能放 test-results/——Playwright 每轮会清空它） */
const RUNTIME_DIR = path.join(__dirname, '..', '.runtime');
const PIDFILE = path.join(RUNTIME_DIR, 'web-server.json');

/** 中性 cwd：让官方版读不到项目根的 .env */
const RUNTIME_CWD = path.join(os.tmpdir(), 'dsh-e2e-cwd');

function isSkipRequested() {
  return !!process.env.E2E_SKIP_SERVER_START;
}

/** 官方版 `dsh web` 的 CLI 入口（resources/app.asar 内的 desktop-host cli.js） */
function cliEntry() {
  const exe = desktopExe();
  if (!exe) throw new Error('未配置桌面端路径（E2E_DSH_EXE），无法定位 dsh web CLI');
  const installDir = path.dirname(exe.replace(/\//g, path.sep));
  return path.join(installDir, 'resources', 'app.asar', 'dsh', 'node_modules',
    '@deepseek-ai', 'dsh-desktop-host', 'lib', 'cli.js');
}

function readServerInfo() {
  try {
    return JSON.parse(fs.readFileSync(PIDFILE, 'utf8'));
  } catch {
    return null;
  }
}

function writeServerInfo(info) {
  fs.mkdirSync(RUNTIME_DIR, { recursive: true });
  fs.writeFileSync(PIDFILE, JSON.stringify(info, null, 2));
}

function clearServerInfo() {
  try { fs.rmSync(PIDFILE, { force: true }); } catch {}
}

/** 杀进程树（Windows）。只杀父会留下 detached 的子 host 占端口。 */
function killTree(pid) {
  return new Promise((resolve) => {
    if (!pid) return resolve(false);
    if (process.platform === 'win32') {
      const p = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
      p.on('exit', () => resolve(true));
      p.on('error', () => resolve(false));
    } else {
      try { process.kill(-pid, 'SIGKILL'); resolve(true); } catch { resolve(false); }
    }
  });
}

/**
 * 启动 web 服务并等待就绪。
 * @returns {Promise<{pid:number|null, port:number, url:string, token:string|null, external:boolean}>}
 */
async function startWebServer({ logger = console.log } = {}) {
  const port = servicePort();
  const host = serviceHost();

  if (isSkipRequested()) {
    logger(`[web-server] E2E_SKIP_SERVER_START=1，跳过启动，直接使用现有服务`);
    const info = readServerInfo();
    return { pid: null, port, url: `http://${host}:${port}`, token: info && info.token, external: true };
  }

  // 残留服务处理：默认杀掉重建，保证干净基线
  const stale = readServerInfo();
  if (stale && stale.pid) {
    const alive = await portInUse(stale.port || port, host);
    if (alive && process.env.E2E_REUSE_SERVER) {
      logger(`[web-server] 复用残留服务 pid=${stale.pid} :${stale.port}`);
      return { ...stale, external: true };
    }
    if (alive) {
      logger(`[web-server] 清理残留服务 pid=${stale.pid}`);
      await killTree(stale.pid);
      await waitForPortFree(stale.port || port, { host });
    }
    clearServerInfo();
  }

  // 端口被别人占着（不是我们起的）——不要盲目杀别人的进程
  if (await portInUse(port, host)) {
    throw new Error([
      `端口 ${host}:${port} 已被占用，但不是本套件启动的服务。`,
      `请确认并释放后重跑，或设 E2E_SKIP_SERVER_START=1 直接复用现有服务。`,
      `排查：netstat -ano | findstr :${port}`,
    ].join('\n'));
  }

  const exe = desktopExe();
  if (!exe) throw new Error('未配置 E2E_DSH_EXE（SparkSeed 可执行文件路径）');
  const entry = cliEntry();
  // 注意：入口位于 resources/app.asar 内部。asar 是**文件**不是目录，Node 的 fs 无法
  // 穿越它（只有 Electron 运行时自己会解析 asar 路径），因此这里绝不能做 existsSync 检查。
  if (!entry.includes('app.asar') && !fs.existsSync(entry)) {
    throw new Error(`未找到 dsh web CLI 入口: ${entry}`);
  }

  fs.mkdirSync(RUNTIME_CWD, { recursive: true });

  const args = ['--expose-internals', entry, 'web', '--no-open', '--host', host, '--port', String(port)];
  logger(`[web-server] 启动: ${exe} ${path.basename(entry)} web --port ${port}`);

  // 输出重定向到文件而不是管道：管道挂在父（worker）进程上，worker 一退出
  // 子进程就会被一并带走——而 web 服务必须活过 web-server 这个 project 的用例。
  // 配合 detached + unref，服务完全脱离 worker 生命周期，由 teardown 项目按 pid 收。
  fs.mkdirSync(RUNTIME_DIR, { recursive: true });
  const logFile = path.join(RUNTIME_DIR, 'web-server.log');
  fs.writeFileSync(logFile, '');
  const fd = fs.openSync(logFile, 'a');

  const child = spawn(exe, args, {
    cwd: RUNTIME_CWD,                    // 中性 cwd：避开项目根 .env
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', ...llmEnv(), ...dshChildEnv() },
    stdio: ['ignore', fd, fd],
    detached: true,                      // 建独立进程组：既能脱离父进程，也能整组杀
  });
  child.unref();
  fs.closeSync(fd);

  const readLog = () => { try { return fs.readFileSync(logFile, 'utf8'); } catch { return ''; } };
  const parseToken = (text) => {
    const m = text.match(/dsh web:\s*(\S+)/);
    if (!m) return null;
    const t = m[1].match(/[?&]token=([^&\s]+)/);
    return t ? t[1] : null;
  };

  // 就绪判定：优先日志里的 `dsh web:` 行（顺带拿 token），兜底端口监听。
  // rc.2 实测（2026-10）：服务**先监听端口、后打印 token 行**，因此端口就绪后
  // 还要再给日志一个出现窗口，否则 token 永远捕获不到（auth.setup 将无 token 可用）。
  let token = null;
  let exited = false;
  child.on('exit', (code) => { exited = true; logger(`[web-server] 进程退出 code=${code}`); });

  const deadline = Date.now() + 120000;
  let portUpAt = 0;
  while (Date.now() < deadline) {
    token = parseToken(readLog());
    if (token) break;
    if (exited) {
      throw new Error(`dsh web 启动失败（进程已退出）。输出:\n${readLog().slice(-3000)}`);
    }
    if (await portInUse(port, host)) {
      if (!portUpAt) portUpAt = Date.now();
      if (Date.now() - portUpAt > 8000) break;   // 端口已起且 token 行 8s 仍未出现 → 走兜底
    }
    await new Promise(r => setTimeout(r, 500));
  }
  if (!token) logger('[web-server] 日志中未出现 "dsh web:" 行（token 缺失，将走离线 cookie）');

  if (!(await waitForPortInUse(port, { host, timeout: 30000 }))) {
    throw new Error(`等待 ${host}:${port} 监听超时。输出:\n${readLog().slice(-3000)}`);
  }

  // 若桌面实例也在跑给出提示（两者可共存，但共享业务数据目录（sparkseed 为 ~/.sparkseed），web 轮可能被干扰）
  if (await desktopAppRunning()) {
    logger('[web-server] 注意：检测到桌面实例进程在跑（与 web 服务共享业务数据目录（sparkseed 为 ~/.sparkseed））');
  }

  const info = { pid: child.pid, port, url: `http://${host}:${port}`, token, startedAt: new Date().toISOString() };
  writeServerInfo(info);
  logger(`[web-server] 就绪 pid=${info.pid} ${info.url}${token ? ' （已捕获 token）' : ''}`);
  return { ...info, external: false };
}

/** 关闭 web 服务（杀进程树 + 确认端口释放） */
async function stopWebServer({ logger = console.log } = {}) {
  const info = readServerInfo();
  if (!info || !info.pid) {
    if (info && info.external) logger('[web-server] 外部服务不由本套件管理，跳过关闭');
    clearServerInfo();
    return;
  }
  logger(`[web-server] 关闭 pid=${info.pid}`);
  await killTree(info.pid);
  const freed = await waitForPortFree(info.port, { host: serviceHost(), timeout: 15000 });
  if (!freed) logger(`[web-server] ⚠ 端口 ${info.port} 仍被占用，请手工排查残留进程`);
  clearServerInfo();
}

module.exports = { startWebServer, stopWebServer, readServerInfo, RUNTIME_DIR, PIDFILE, RUNTIME_CWD, killTree };
