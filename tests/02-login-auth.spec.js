// @ts-check
/**
 * 模块二：登录 / 认证
 * M2-01 token 兑换的 cookie 可认证；篡改/伪造 cookie 被拒（正负例）[web]
 * M2-02 无凭证被拒 [web]
 * M2-03/M2-04 认证态开箱可用 [双端]
 *
 * eline 实测（2026-10）：cookie 签名密钥**不落盘**（.credentials.yaml 里的密钥对不上，
 * 离线构造必 401），登录态只能走 `dsh web` 启动输出的 token 兑换（auth.setup 已备好）。
 * 因此正例改为「token 兑换的 cookie 可用」，负例保留「篡改/伪造被拒」。
 */
const { test, expect, APP_URL } = require('../fixtures/app.fixtures');
const { request: bareRequest } = require('@playwright/test');
const apiRequest = require('@playwright/test').request;
const fs = require('fs');
const path = require('path');

const STATE_FILE = path.join(__dirname, '..', '.auth', 'dsh-state.json');

/** 读 auth.setup 准备好的登录态里的 dsh-auth cookie */
function readAuthCookie() {
  const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  const cookie = (state.cookies || []).find(c => c.name.startsWith('dsh-auth-'));
  if (!cookie) throw new Error(`登录态里没有 dsh-auth-* cookie: ${STATE_FILE}`);
  return cookie;
}

/** 把 cookie 转成 Playwright storageState 的一项 */
function cookieToState(cookie, domain) {
  return {
    name: cookie.name,
    value: cookie.value,
    domain,
    path: '/',
    expires: cookie.expires ? Math.floor(cookie.expires) : Math.floor(Date.now() / 1000) + 86400,
    httpOnly: true,
    secure: false,
    sameSite: 'Strict',
  };
}

test.describe('M2 登录/认证', () => {

  test('M2-01 token 兑换的 cookie 可认证，篡改/伪造被拒 [web]', async ({ mode }) => {
    test.skip(mode !== 'web', 'web 专属用例');
    const authority = new URL(APP_URL).host;
    const domain = authority.split(':')[0];
    const cookie = readAuthCookie();

    // 1) token 兑换的合法 cookie → 200
    const ok = await apiRequest.newContext({
      baseURL: APP_URL,
      storageState: { cookies: [cookieToState(cookie, domain)], origins: [] },
    });
    expect((await ok.get('/')).status(), 'token 兑换的 cookie 应被接受').toBe(200);
    await ok.dispose();

    // 2) 篡改 cookie 值（签名段改一字符）→ 401
    const tampered = cookie.value.slice(0, -1) + (cookie.value.endsWith('A') ? 'B' : 'A');
    const bad = await apiRequest.newContext({
      baseURL: APP_URL,
      storageState: { cookies: [cookieToState({ ...cookie, value: tampered }, domain)], origins: [] },
    });
    expect((await bad.get('/')).status(), '篡改后的 cookie 应被拒').toBe(401);
    await bad.dispose();

    // 3) 同名伪造 cookie（乱值）→ 401
    const fake = await apiRequest.newContext({
      baseURL: APP_URL,
      storageState: { cookies: [cookieToState({ ...cookie, value: 'v1.zm9v.YmFy' }, domain)], origins: [] },
    });
    expect((await fake.get('/')).status(), '伪造 cookie 应被拒').toBe(401);
    await fake.dispose();

    test.info().annotations.push({ type: 'note', description: `authority=${authority}，cookie 名=${cookie.name}` });
  });

  test('M2-02 无 token/cookie 直接访问被拒 [web]', async ({ mode }) => {
    test.skip(mode !== 'web', 'web 专属用例');
    const ctx = await bareRequest.newContext({
      baseURL: APP_URL,
      storageState: { cookies: [], origins: [] },
    });
    const resp = await ctx.get('/');
    expect([401, 403]).toContain(resp.status());
    expect((await resp.text()).toLowerCase()).toContain('auth');
    await ctx.dispose();
  });

  test('M2-03/M2-04 认证态下应用完整可用 [双端]', async ({ pages }) => {
    test.setTimeout(120000);
    await pages.sidebar.openApp();

    await expect(pages.sidebar.newSessionButton()).toBeVisible();
    // eline 侧栏为工作区树（hero 另有常驻「选择工作区」按钮，M9-08 专测），
    // 这里断言树中至少有一个工作区节点
    const wsTitles = await pages.workspace.titles();
    expect(wsTitles.length, '工作区树应至少有一个工作区').toBeGreaterThan(0);
    test.info().annotations.push({ type: 'note', description: `工作区（${wsTitles.length} 个）: ${wsTitles.slice(0, 4).join(', ')}` });
  });
});
