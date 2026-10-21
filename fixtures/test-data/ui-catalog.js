// @ts-check
/**
 * UI 预期数据目录（数据驱动的唯一数据源）
 *
 * 用例体内不再硬编码「预期有哪些页签/开关/选项/模式」——全部从这里取。
 * 产品新增一个页签/开关/指令选项 = 在这里加一行数据，用例体零改动。
 *
 * ⚠️ 部署相关数据（模型目录、Agent 预设、指令清单）按当前 eline 部署实测记录；
 *    换部署时改本文件即可，不要改用例。
 */

/* ---------- 设置中心 ---------- */
/** 设置导航页签 */
exports.SETTINGS_TABS = ['通用设置', '模型', '内置插件', 'Agent 预设'];
/** 主题与亮度断言阈值（0-255） */
exports.THEMES = [
  { name: '深色', expect: { luminanceAtMost: 80 } },
  { name: '浅色', expect: { luminanceAtLeast: 150 } },
];
/** role=switch 功能开关（翻转后必须复原） */
exports.SETTINGS_SWITCHES = ['在使用官方模型 API 时上传 Session Log', '显示代码工作视图'];
/** 下拉选择器（非开关，仅断言菜单可开） */
exports.SETTINGS_SELECTORS = ['排队发送'];
/** 语言项（语言名以原生名显示；expect 锚点用可见文本——侧栏按钮可见文本为「新会话」，aria 的「新建会话」不出现在 innerText） */
exports.LANGUAGES = [
  { name: 'English', expect: { absent: '新会话' } },
  { name: '中文', expect: { present: '新会话' } },
];
/** 快捷键编辑器中应能读到绑定的功能名 */
exports.SHORTCUT_FEATURES = ['归档会话', '重命名会话', '分叉会话'];

/* ---------- 输入区与控件 ---------- */
/** 指令面板选项 */
exports.COMMAND_OPTIONS = ['文件', '目标', '计划', '反馈', '压缩', '权限', '模型', '下载日志'];
/** 访问模式（权限）三档 */
exports.ACCESS_MODES = ['仅可查看', '工作区内修改', '完全权限'];

/* ---------- 会话治理 ---------- */
/** 视图分组选项（分组切换往返用） */
exports.VIEW_GROUPS = ['按工作区树', '按工作区'];
/** 归档过滤三档 */
exports.ARCHIVE_FILTERS = ['仅显示已归档', '隐藏已归档'];
/** 会话行操作菜单项（hover「会话X的操作」） */
exports.SESSION_OPS_MENU = ['置顶会话', '重命名', '分叉会话', '归档会话'];

/* ---------- 右侧工作面板 ---------- */
/** 会话视图常驻页签 */
exports.TRANSCRIPT_TABS = ['对话', '轨迹'];
/** dock 布局按钮 */
exports.LAYOUT_BUTTONS = ['新标签页', '分栏', '全屏'];
/** 「开始」落地页功能入口（浏览器仅桌面端 webview 有，见 BROWSER_NOTE） */
exports.DOCK_FUNCTIONS = ['工作区文件', '新建终端'];

/* ---------- Agent 预设 / 模型（部署相关） ---------- */
/** Agent 预设（模式）清单：外贸专家模式为 eline 部署 persona */
exports.AGENT_MODES = ['外贸专家模式', '标准模式', 'PTC 模式', '极简模式', '创造模式'];
/** 模型目录显示名（易链中转实测；与 trigger 全名无干净映射，仅作清单比对） */
exports.MODEL_CATALOG = ['DeepSeek-V4-Pro', 'DeepSeek-V41-Flash'];

/* ---------- 导出与外部集成 ---------- */
/** 「更多打开方式」菜单项（不点击外部程序） */
exports.OPEN_WITH = ['文件资源管理器', 'VS Code'];
