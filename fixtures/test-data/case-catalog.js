// @ts-check
/**
 * 用例描述目录 —— 从 TEST-CASES.md 的用例表格自动提取（单一事实源，避免两处维护）。
 *
 * 提取规则：
 *   · 只认「首个单元格恰为用例 ID」的表格行：M1-01 / M1-03/04 / M3-01A…
 *     模块总览（首列是模块名）、数据驱动目录、并入正例说明等一概跳过；
 *   · 描述 = 该行其余单元格用「；」拼接（标题；前置；步骤；预期），剔除
 *     「形态」列（双端/web/electron）与纯 ID 引用单元格（如反例表的「对应用例」列）；
 *   · 简写 ID 自动展开：'M1-03/04' 同时登记 M1-03 与 M1-04。
 *
 * 消费方：fixtures/app.fixtures.js 的 auto 夹具把描述写进报告注解，
 * HTML 报告的用例详情页会显示「用例描述: …」。
 */
const fs = require('fs');
const path = require('path');

const DOC_PATH = path.join(__dirname, '..', '..', 'TEST-CASES.md');

/** 形态列取值（不进描述） */
const FORM_FACTOR_RE = /^(双端|web|electron)(（[^）]*）)?$/;
/** 纯 ID 引用单元格，如反例表的「对应用例」列（不进描述） */
const ID_REF_RE = /^[MA\d/\-、\s]*$/;
/** 单个用例 ID：M8-01 / M3-01A */
const SINGLE_ID_RE = /^M\d+-\d+[A-Z]?$/;
/** 组合用例 ID：M1-03/04 */
const COMBINED_ID_RE = /^M\d+-\d+[A-Z]?(?:\/\d+[A-Z]?)+$/;

/** 展开首格的简写 ID：'M1-03/04' → ['M1-03', 'M1-04'] */
function expandIdCell(cell) {
  const parts = cell.split('/').map(s => s.trim()).filter(Boolean);
  const prefix = (parts[0].match(/^(M\d+)-/) || [])[1];
  if (!prefix) return parts;
  return parts.map((p, i) => (i === 0 || p.startsWith('M') ? p : `${prefix}-${p}`));
}

function buildCatalog() {
  /** @type {Map<string, string>} */
  const catalog = new Map();
  let doc;
  try {
    doc = fs.readFileSync(DOC_PATH, 'utf8');
  } catch (e) {
    console.warn(`[report] 读取 ${DOC_PATH} 失败，报告将无用例描述: ${e.message}`);
    return catalog;
  }
  for (const line of doc.split(/\r?\n/)) {
    if (!line.startsWith('|')) continue;
    const cells = line.split('|').map(c => c.trim()).slice(1, -1);
    if (cells.length < 2) continue;
    const idCell = cells[0];
    if (!SINGLE_ID_RE.test(idCell) && !COMBINED_ID_RE.test(idCell)) continue;
    const desc = cells.slice(1)
      .filter(c => c && !FORM_FACTOR_RE.test(c) && !ID_REF_RE.test(c))
      .join('；');
    for (const id of expandIdCell(idCell)) {
      if (!catalog.has(id)) catalog.set(id, desc);
    }
  }
  return catalog;
}

const CATALOG = buildCatalog();

/** 从用例标题提取全部用例 ID，返回拼接描述（无匹配返回空串） */
function describeTitle(title) {
  const ids = (title || '').match(/M\d+-\d+[A-Z]?/g) || [];
  const descs = [];
  for (const id of ids) {
    const d = CATALOG.get(id);
    if (d && !descs.includes(d)) descs.push(d);
  }
  return descs.join('\n');
}

module.exports = { describeTitle };
