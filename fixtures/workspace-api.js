// @ts-check
/**
 * 工作区 RPC 助手 —— 绕过原生目录选择器的 API 通道
 *
 * 背景（2026-10 探测实测）：UI「添加工作区…」会 POST /api/directoryPicker/pick，
 * 由服务端拉起 OS 级目录选择窗口，Playwright 无法驱动；但工作区的本质是
 * 「采用一个本地文件夹」，dsh 网关暴露 workspace/* RPC（client-request 信封），
 * 在应用页面内同源 fetch 即可调用（web 模式带 cookie / electron 模式内置认证，双端通用）。
 *
 * 信封格式：POST /api/workspace/<method>
 *   {type:'client-request', rpcId, method:'workspace/<method>', payload:{args:{request:{...}}}}
 *
 * 已验证方法（v0.5.14 服务端）：
 *   workspace/create  {path}            → 幂等「创建或解析」，返回 {workspace:{workspaceId,title,...},created}
 *   workspace/rename  {workspaceId,title} → workspace
 *   workspace/delete  {workspaceId}     → {deleted:true}
 */
const crypto = require('crypto');

/** 在应用页面内发起一次 workspace RPC，失败抛带网关错误码的 Error */
async function rpc(page, method, request) {
  return page.evaluate(async ({ method, request, rpcId }) => {
    const res = await fetch('/api/' + method, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'client-request', rpcId, method, payload: { args: { request } } }),
    });
    const body = await res.json().catch(() => null);
    if (!body || !body.result) throw new Error(`${method} → HTTP ${res.status}`);
    if (!body.result.ok) {
      const err = body.result.error || {};
      throw new Error(`${method} 失败: ${err.code || '?'}: ${err.message || ''}`);
    }
    return body.result.value;
  }, { method, request, rpcId: crypto.randomUUID() });
}

/** 创建（或幂等解析）工作区：path 为本机已存在目录的绝对路径 */
function createWorkspace(page, path) {
  return rpc(page, 'workspace/create', { path });
}

/** 重命名工作区 */
function renameWorkspace(page, workspaceId, title) {
  return rpc(page, 'workspace/rename', { workspaceId, title });
}

/** 删除工作区 */
function deleteWorkspace(page, workspaceId) {
  return rpc(page, 'workspace/delete', { workspaceId });
}

module.exports = { rpc, createWorkspace, renameWorkspace, deleteWorkspace };
