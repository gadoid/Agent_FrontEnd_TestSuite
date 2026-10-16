// @ts-check
/**
 * web 形态登录态准备（项目 `setup`）
 *
 * 官方版认证机制（逆向 asar + 实测复现）：
 *   `?token=` 一次性链接 → 303 → 种下 HttpOnly cookie `dsh-auth-*`（30 天、SameSite=Strict）。
 *   签名密钥**明文持久化**在 `<DSH_HOME>/.credentials.yaml`，且**跨重启稳定不轮换**
 *   ——因此本套件直接离线构造 cookie，不再依赖「服务启动时打印的 token」。
 *
 * 这解决了社区版时代反复卡住的老问题：token 每次服务重启都轮换，而 cookie 不行。
 *
 * 降级链（依次尝试，全部失败才报错）：
 *   1. 离线构造（主路径，不需要服务、不需要 token）
 *   2. 服务启动时捕获的 token（.runtime/web-server.json，由 web-server 项目写入）
 *   3. E2E_TOKEN 显式给出
 */
const { test: setup, request: apiRequest } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { loadEnv } = require('../fixtures/env');
const { servicePort } = require('../fixtures/ports');
const { writeStorageState, secretFingerprint, readSecret } = require('../fixtures/dsh-credentials');
const { readServerInfo } = require('../fixtures/web-server');

loadEnv();

const STATE_FILE = path.join(__dirname, '..', '.auth', 'dsh-state.json');
const AUTHORITY_FILE = path.join(__dirname, '..', '.auth', 'dsh-authority.json');
const BASE_URL = `http://127.0.0.1:${servicePort()}`;

/** 用已写出的 storageState 直接请求首页，验证登录态真的可用（不启浏览器） */
async function verifyState(state) {
  const ctx = await apiRequest.newContext({ baseURL: BASE_URL, storageState: state });
  try {
    const resp = await ctx.get('/');
    return { ok: resp.status() === 200, status: resp.status() };
  } catch (e) {
    return { ok: false, status: -1, error: e.message };
  } finally {
    await ctx.dispose();
  }
}

/** 从侧车读已记录的 authority（端口/主机变了就该无条件重建） */
function readAuthoritySidecar() {
  try { return JSON.parse(fs.readFileSync(AUTHORITY_FILE, 'utf8')); } catch { return null; }
}

setup('prepare web auth state (offline cookie)', async () => {
  setup.setTimeout(90000);
  const expectedAuthority = `127.0.0.1:${servicePort()}`;

  // 0. 侧车 authority 一致且 state 仍在 → 直接验证复用，不重建
  const sidecar = readAuthoritySidecar();
  if (sidecar && sidecar.authority === expectedAuthority && fs.existsSync(STATE_FILE)) {
    const existing = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    const v = await verifyState(existing);
    if (v.ok) {
      setup.info().annotations.push({ type: 'note', description: `复用现有登录态（authority=${expectedAuthority}）` });
      return;
    }
    setup.info().annotations.push({ type: 'note', description: `现有登录态不可用（HTTP ${v.status}），重建` });
  }

  // 1. 离线构造
  const failures = [];
  try {
    const secret = readSecret();
    const { state, authority } = writeStorageState({
      url: BASE_URL, statePath: STATE_FILE, authorityPath: AUTHORITY_FILE, secret,
    });
    const v = await verifyState(state);
    if (v.ok) {
      setup.info().annotations.push({
        type: 'note',
        description: `离线构造登录态成功（authority=${authority}，密钥指纹=${secretFingerprint(secret)}）`,
      });
      return;
    }
    failures.push(`离线构造的 cookie 未通过验证（HTTP ${v.status}）`);
  } catch (e) {
    failures.push(`离线构造失败: ${e.message}`);
  }

  // 2. 服务启动时捕获的 token
  const tokenFromServer = (readServerInfo() || {}).token;
  const token = tokenFromServer || process.env.E2E_TOKEN || '';
  if (token) {
    const source = tokenFromServer ? '服务启动输出' : 'E2E_TOKEN';
    const ctx = await apiRequest.newContext({ baseURL: BASE_URL });
    try {
      const resp = await ctx.get(`/?token=${token}`);
      if (resp.status() >= 400) {
        failures.push(`${source} 的 token 登录失败（HTTP ${resp.status()}）`);
      } else {
        // 让 Playwright 从重定向链里吸收 cookie 后落盘
        await ctx.storageState({ path: STATE_FILE });
        fs.writeFileSync(AUTHORITY_FILE, JSON.stringify({
          authority: expectedAuthority, generatedAt: new Date().toISOString(), source,
        }, null, 2));
        const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
        const v = await verifyState(state);
        if (v.ok) {
          setup.info().annotations.push({ type: 'note', description: `token 登录态就绪（来源: ${source}）` });
          return;
        }
        failures.push(`token 流程拿到的 cookie 未通过验证（HTTP ${v.status}）`);
      }
    } catch (e) {
      failures.push(`${source} 的 token 流程异常: ${e.message}`);
    } finally {
      await ctx.dispose();
    }
  } else {
    failures.push('没有可用的 token（.runtime/web-server.json 与 E2E_TOKEN 均为空）');
  }

  throw new Error([
    '无法建立 web 登录态，依次尝试均失败：',
    ...failures.map((f, i) => `  ${i + 1}) ${f}`),
    '',
    '排查建议：',
    `  · 服务是否在跑：${BASE_URL}`,
    '  · 凭据文件是否可读：<DSH_HOME>/.credentials.yaml（记录 client-connection/browser-session 的 secret）',
    '  · cookie 按端口区分，E2E_URL 的端口必须与 E2E_WEB_PORT 一致',
  ].join('\n'));
});
