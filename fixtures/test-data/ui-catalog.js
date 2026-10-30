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
/**
 * 主题选项（2026-10-28 eline v0.2.0-rc.6 实测基线）：
 * 外观控件为「惰性」——浅色/深色/跟随系统三按钮可点击、不报错，但选择不生效
 * （aria-pressed 不变、body 背景亮度恒 255、无 localStorage 写入）。
 * 因此不再断言亮度阈值（expect 留空 = 仅断言按钮存在且可操作，亮度只作记录）。
 * 产品后续若恢复主题应用，在本文件补回阈值即可（用例体零改动）。
 */
exports.THEMES = [
  { name: '深色', expect: {} },
  { name: '浅色', expect: {} },
];
/** role=switch 功能开关（翻转后必须复原）。
 *  rc.6 实测「在使用官方模型 API 时上传 Session Log」开关已随部署移除，
 *  通用设置仅剩「显示代码工作视图」一个真开关。 */
exports.SETTINGS_SWITCHES = ['显示代码工作视图'];
/** 下拉选择器（非开关，仅断言菜单可开）。rc.6 另有 权限/语言/工作步骤展示/网页链接/性能用量 等下拉，按需扩充 */
exports.SETTINGS_SELECTORS = ['排队发送'];
/**
 * 语言项（2026-10-28 rc.6 实测基线）：语言菜单提供 中文/English 且选择被接受，
 * 但当前构建不即时应用——UI 文案/html@lang 均不变，故不设 absent/present 锚点
 * （= 仅断言「选择可执行且应用保持稳定」）。
 */
exports.LANGUAGES = [
  { name: 'English', expect: {} },
  { name: '中文', expect: {} },
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
/** 模型目录显示名（2026-10-28 rc.6 易链中转实测：下发为小写裸模型 ID，不再有品牌化显示名） */
exports.MODEL_CATALOG = ['glm-5.3', 'deepseek-v4-pro', 'glm-5.3-flash', 'deepseek-v4-flash'];

/* ---------- 导出与外部集成 ---------- */
/** 「更多打开方式」菜单项（不点击外部程序） */
exports.OPEN_WITH = ['文件资源管理器', 'VS Code'];

/* ---------- 插件能力（侧栏插件页 + 设置→内置插件） ---------- */
/** 安装表单「安装源」选择器可选值（rc.6 实测；仅断言选择器存在，不切换不提交） */
exports.PLUGIN_INSTALL_REGISTRIES = ['默认安装源', 'npm 官方源', '中国大陆镜像源', '自定义地址'];
/** 安装引导中的示例包名 */
exports.PLUGIN_INSTALL_EXAMPLE = 'eline-plugin-whale-pet';
/** 设置→内置插件 只读清单的分组名（rc.6 实测） */
exports.BUILTIN_PLUGIN_GROUPS = ['会话插件', '全局插件'];
/** 插件/组件运行状态词（详情页组件行；缺失的词随部署优雅跳过） */
exports.PLUGIN_PART_PHASES = ['运行中', '已停用', '未运行', '异常'];
