// @ts-check
/**
 * 端口探测工具
 *
 * 历史：这里原本是 fixtures/runtime-state.js，管理社区版的
 * `~/.dsh/.dsh-desktop-runtime.json`（「上次异常退出」残留清理）。
 * **官方版完全没有该文件**（asar 内 childPid/desktopPid/processIdentity 均 0 命中），
 * 那套机制对官方版是死代码，已删除；只保留端口相关的通用能力。
 *
 * SparkSeed（v0.2.0-rc.7）变更：桌面内部 host 不再硬编码 19387（改随机端口），
 * 判定「桌面实例是否在跑」改为按映像名查进程（desktopAppRunning）。
 */
const { execFile } = require('child_process');
const net = require('net');
const path = require('path');
const { loadEnv, readEnv } = require('./env');

loadEnv();

/** 桌面应用映像名（取 E2E_DSH_EXE 的文件名，如 sparkseed.exe） */
function desktopImageName(exe = desktopExe()) {
  if (!exe) return '';
  return path.basename(exe.replace(/\//g, path.sep));
}

/** 是否已有桌面应用实例在跑（Windows 按映像名 tasklist 查询）。
 *  SparkSeed 的单实例锁是 Electron requestSingleInstanceLock（按 userData 命名锁），
 *  已有实例（无论谁起的）时新进程直接 quit()，因此跑用例前必须确认无实例存活。 */
function desktopAppRunning(exe = desktopExe()) {
  const image = desktopImageName(exe);
  if (!image) return Promise.resolve(false);
  if (process.platform !== 'win32') {
    // 非 Windows 没有映像名查询需求（套件当前只在 Windows 跑），保守返回 false
    return Promise.resolve(false);
  }
  return new Promise((resolve) => {
    execFile('tasklist', ['/FI', `IMAGENAME eq ${image}`, '/FO', 'CSV', '/NH'],
      { windowsHide: true }, (err, stdout) => {
        if (err) return resolve(false);
        resolve(String(stdout).toLowerCase().includes(`"${image.toLowerCase()}"`));
      });
  });
}

/** 从 E2E_URL 派生服务端口（迁移到非默认端口部署时无需改代码） */
function servicePort() {
  try {
    return Number(new URL(process.env.E2E_URL || 'http://127.0.0.1:3080').port) || 3080;
  } catch {
    return 3080;
  }
}

/** 服务主机（默认 127.0.0.1） */
function serviceHost() {
  try {
    return new URL(process.env.E2E_URL || 'http://127.0.0.1:3080').hostname;
  } catch {
    return '127.0.0.1';
  }
}

/** 探测端口是否被占用（能绑上 = 空闲） */
function portInUse(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => resolve(true));   // 绑定失败 → 端口被占
    srv.once('listening', () => srv.close(() => resolve(false)));
    srv.listen(port, host);
  });
}

/** 轮询等待端口开始监听（服务就绪的兜底信号） */
async function waitForPortInUse(port, { host = '127.0.0.1', timeout = 90000, interval = 500 } = {}) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await portInUse(port, host)) return true;
    await new Promise(r => setTimeout(r, interval));
  }
  return false;
}

/** 轮询等待端口释放（关闭服务后确认） */
async function waitForPortFree(port, { host = '127.0.0.1', timeout = 15000, interval = 300 } = {}) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (!(await portInUse(port, host))) return true;
    await new Promise(r => setTimeout(r, interval));
  }
  return false;
}

/** 桌面端可执行文件路径（E2E_DSH_EXE 优先，兼容旧的进程环境变量名） */
function desktopExe() {
  return readEnv('E2E_DSH_EXE', ['DSH_ELECTRON_PATH']);
}

module.exports = {
  desktopImageName,
  desktopAppRunning,
  servicePort,
  serviceHost,
  portInUse,
  waitForPortInUse,
  waitForPortFree,
  desktopExe,
};
