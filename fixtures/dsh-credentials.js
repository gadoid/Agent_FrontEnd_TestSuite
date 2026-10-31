// @ts-check
/**
 * 官方版 DeepSeek Harness 的登录态构造（离线，不依赖服务启动顺序）
 *
 * 机制（2026-10 逆向 asar + 实测复现）：
 *   - cookie 名  `dsh-auth-` + base64url(sha256("<host>:<port>"))，**按端口区分**
 *   - cookie 值  `v1.<body>.<sig>`，body = base64url(JSON(payload))，
 *                sig  = base64url(HMAC_SHA256(secret, **body 字符串本身**))
 *                注意签名对象是 body 那段 base64url 文本，不是 JSON、不是 "v1."+body
 *   - payload    {version:1, authority, issuedAt, expiresAt}（键顺序即签名内容）
 *   - 服务端校验 payload.authority === Host 头、issuedAt <= now < expiresAt、
 *                expiresAt - issuedAt <= 30d
 *   - 签名密钥持久化在 $DSH_HOME/.credentials.yaml；默认目录按部署更名，sparkseed 为 ~/.sparkseed），**跨重启稳定不轮换**
 *
 * 实测（127.0.0.1:3180）：伪造 cookie → 200；无 cookie → 401；
 * `?token=` 流程种下的 cookie 与本模块构造的名字逐字符一致。
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

/** base64url 编码（无填充） */
function b64u(buf) {
  return Buffer.from(buf).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** DSH_HOME：环境变量优先。默认目录**按部署更名**：sparkseed 实测 `~/.sparkseed`
 *  （ElineAI 时代为 `~/.eline`，官方 dsh 文档写 `~/.dsh`）；只影响离线 cookie 构造的
 *  读路径，sparkseed 密钥不落盘本就走 token 兜底，改错仅表现为降级。 */
function dshHome() {
  return process.env.DSH_HOME || process.env.E2E_DSH_HOME || path.join(os.homedir(), '.sparkseed');
}

/** 凭据存储文件路径 */
function credentialsFile(home = dshHome()) {
  return path.join(home, '.credentials.yaml');
}

/**
 * 读取 cookie 签名密钥（32 字节）。
 *
 * 窄解析：定位 `client-connection/browser-session` 段内的 secret 字段。
 * 该文件由应用自己写入、结构稳定（version/records/<key>/kind/payload），
 * 但**不是正式接口**——因此解析后硬校验长度，解析失败立即报错，
 * 而不是产出一个永远 401 的 cookie 让人误以为是认证问题。
 */
function readSecret(home = dshHome()) {
  const file = credentialsFile(home);
  if (!fs.existsSync(file)) {
    throw new Error(`找不到凭据文件: ${file}（可用 DSH_HOME 覆盖默认 ~/.dsh）`);
  }
  const text = fs.readFileSync(file, 'utf8');
  const key = 'client-connection/browser-session';
  const at = text.indexOf(key);
  if (at < 0) throw new Error(`凭据文件缺少记录 "${key}": ${file}`);

  // 从记录起始往后取一段，匹配其中的 secret
  const block = text.slice(at, at + 800);
  const m = block.match(/secret:\s*"?([A-Za-z0-9_\-]+)"?/);
  if (!m) throw new Error(`凭据记录 "${key}" 中未找到 secret 字段: ${file}`);

  const secret = Buffer.from(m[1], 'base64url');
  if (secret.length !== 32) {
    throw new Error(`已识别的 secret 长度异常（${secret.length} 字节，应为 32）: ${file}`);
  }
  return secret;
}

/** 脱敏摘要，供日志/annotation 使用（绝不输出密钥本身） */
function secretFingerprint(secret) {
  return crypto.createHash('sha256').update(secret).digest('hex').slice(0, 8);
}

/** 从 URL 取 authority（"host:port"；端口缺省时只留 host） */
function authorityOf(url) {
  const u = new URL(url);
  return u.port ? `${u.hostname}:${u.port}` : u.hostname;
}

/** cookie 名（由 authority 派生，端口变了名字就变） */
function cookieName(authority) {
  return 'dsh-auth-' + b64u(crypto.createHash('sha256').update(authority).digest());
}

/**
 * 构造登录 cookie。
 * @param {{authority: string, secret: Buffer, ttlMs?: number}} opts
 *        ttlMs 建议 29 天（服务端硬上限 30 天）
 */
function buildCookie({ authority, secret, ttlMs = 29 * 24 * 3600 * 1000 }) {
  const now = Date.now();
  const payload = {
    version: 1,
    authority,
    issuedAt: now - 60_000, // 容忍轻微时钟偏移
    expiresAt: now + ttlMs,
  };
  const body = b64u(JSON.stringify(payload));
  const sig = b64u(crypto.createHmac('sha256', secret).update(body).digest());
  return {
    name: cookieName(authority),
    value: `v1.${body}.${sig}`,
    expiresAt: payload.expiresAt,
  };
}

/** 组装 Playwright storageState（cookie 为 host-only，domain 用主机名） */
function buildStorageState({ url, secret, ttlMs } = {}) {
  const authority = authorityOf(url);
  const cookie = buildCookie({ authority, secret: secret || readSecret(), ttlMs });
  return {
    cookies: [{
      name: cookie.name,
      value: cookie.value,
      domain: new URL(url).hostname,
      path: '/',
      expires: Math.floor(cookie.expiresAt / 1000),
      httpOnly: true,
      secure: false,
      sameSite: 'Strict',
    }],
    origins: [],
  };
}

/**
 * 写出 `.auth/dsh-state.json`，并落一份 authority 侧车
 * （端口/主机变了要无条件重建，不靠启浏览器试）。
 */
function writeStorageState({ url, statePath, authorityPath, secret, ttlMs } = {}) {
  const state = buildStorageState({ url, secret, ttlMs });
  const authority = authorityOf(url);
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
  if (authorityPath) {
    fs.writeFileSync(authorityPath, JSON.stringify({
      authority,
      generatedAt: new Date().toISOString(),
      expiresAt: new Date(state.cookies[0].expires * 1000).toISOString(),
    }, null, 2));
  }
  return { state, authority };
}

module.exports = {
  b64u,
  dshHome,
  credentialsFile,
  readSecret,
  secretFingerprint,
  authorityOf,
  cookieName,
  buildCookie,
  buildStorageState,
  writeStorageState,
};
