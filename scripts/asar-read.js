// @ts-check
/**
 * 只读 asar 工具：列出/读取打包后的文件，不落盘解包。
 * 用法：
 *   node scripts/asar-read.js <asar> list [prefix]
 *   node scripts/asar-read.js <asar> cat <path>
 */
const fs = require('fs');

function openAsar(p) {
  const fd = fs.openSync(p, 'r');
  const b = Buffer.alloc(16);
  fs.readSync(fd, b, 0, 16, 0);
  const headerSize = b.readUInt32LE(12);
  const hb = Buffer.alloc(headerSize);
  fs.readSync(fd, hb, 0, headerSize, 16);
  const header = JSON.parse(hb.toString('utf8'));
  const dataOffset = 16 + headerSize;
  return { fd, header, dataOffset };
}

function resolve(header, path) {
  const parts = path.split('/').filter(Boolean);
  let node = header;
  for (const part of parts) {
    if (!node.files || !node.files[part]) return null;
    node = node.files[part];
  }
  return node;
}

function readFile(fd, dataOffset, entry) {
  const buf = Buffer.alloc(entry.size);
  fs.readSync(fd, buf, 0, entry.size, dataOffset + parseInt(entry.offset, 10));
  return buf;
}

const [, , asarPath, cmd, arg] = process.argv;
const { fd, header, dataOffset } = openAsar(asarPath);

if (cmd === 'list') {
  const root = arg ? resolve(header, arg) : header;
  if (!root) { console.error('not found:', arg); process.exit(1); }
  for (const [k, v] of Object.entries(root.files || {})) {
    console.log(v.files ? `${k}/` : `${k}\t${v.size}`);
  }
} else if (cmd === 'cat') {
  const entry = resolve(header, arg);
  if (!entry || entry.files) { console.error('not a file:', arg); process.exit(1); }
  process.stdout.write(readFile(fd, dataOffset, entry));
} else {
  console.error('usage: list [prefix] | cat <path>');
  process.exit(1);
}
fs.closeSync(fd);
