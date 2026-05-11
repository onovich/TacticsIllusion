项目交接文档：《幻境高地：源起》(Tactics Illusion: Origins)

1. 项目概述与命名

项目名称：《幻境高地：源起》(Tactics Illusion: Origins)

核心玩法：基于 45 度斜视角（Isometric）网格的伪 3D 开放世界战棋 RPG 游戏。致敬《最终幻想战略版》。

视觉风格：简约、扁平化的矢量 SVG 贴纸画风，通过高度差和柔和的色彩区分地形。

交互特色：全触控/鼠标自适应，无缝战场切换（大地图遭遇战），基于欧几里得距离的纯数学防误触点击判定。

2. 需求设计文档 (PRD 摘要)

2.1 游戏模式 (Modes)

游戏由一个主全局状态机 mode 驱动，分为四个互斥的模式：

EXPLORE (探索模式)：玩家（光圈角色）在大地图 (100x100) 上移动。采用点击寻路（选中主角 -> 点击高亮区域）。

COMBAT (战斗模式)：大地图遭遇敌人（👹）触发。在原坐标生成 14x14 战斗边界（光墙）。采用经典战棋回合制，战斗单位受限于地形高度差（跳跃力）。

DIALOG (对话模式)：遭遇 NPC 或建筑时触发。可以进行文本对话或购买道具。

MENU (营地模式)：角色养成与装备面板。全屏 UI，用于查看状态和镶嵌宝石。

2.2 RPG 养成与数值系统

基础属性：HP、攻击力 (Atk)、移动力 (Move)、跳跃力 (Jump)、射程 (Range)。

地形系统：水域不可通行。地形高度差限制移动（高低差 > Jump 时不可直接跨越）。高地打低地有伤害加成（猎人尤为明显）。

附魔系统：角色武器固定，每人有 2 个宝石镶嵌槽。红宝石（+Atk），绿宝石（+MaxHP）。镶嵌即时生效，可随时无损卸下。

3. 技术文档 (Architecture & Tech Stack)

3.1 技术栈

框架：React (函数式组件 + Hooks)。

渲染引擎：HTML5 <canvas> (2D Context)，手动实现渲染循环 (requestAnimationFrame)。

样式：Tailwind CSS (用于悬浮 UI 界面)。

3.2 核心数据结构与状态管理

为了保证 60FPS 的性能，状态被严格区分为“UI 状态”和“底层逻辑状态”：

React State (useState)：仅用于驱动 React UI 的显隐和更新（如金币、等级、当前模式 mode）。

高性能 Ref (useRef)：

stateRef：高频同步 useState 的值，解决 Canvas 事件监听中的闭包陷阱 (Stale Closure)。

cameraRef：记录 x, y, zoom，拖拽镜头时直接修改此 Ref 并交由 Canvas 渲染，绝不触发 React 重绘。

renderablesRef：记录当前帧渲染的所有物体及深度，用于精确碰撞检测。

3.3 关键技术与算法实现

伪 3D 坐标转换 (Isometric Projection)：
使用核心函数 toIso(x, y, z) 将逻辑网格坐标转换为屏幕像素坐标。

const toIso = (x, y, z) => ({
  cx: (x - y) * (TILE_W / 2),
  cy: (x + y) * (TILE_H / 2) - (z * Z_SCALE)
});


柏林噪声地形生成 (Procedural Terrain)：
利用正弦波和余弦波的叠加函数模拟柏林噪声，生成连续起伏的自然高度图 (Height Map)。

视口剔除 (Frustum Culling)：
在 render 循环中，预先判断网格中心点是否在当前屏幕（考虑缩放和偏移）外，只渲染屏幕内及边缘的 150px 内的网格，支撑起 100x100 的庞大地图。

深度排序 (Z-Sorting)：
所有网格 (cell)、实体 (entity) 和角色 (unit) 被放入统一的数组，按照 z = x + y + 补偿值 进行排序后渲染，实现前遮后的伪 3D 效果。

纯数学精准碰撞检测 (Euclidean Hit-Test) - 必读坑点！：
不要使用 Canvas 原生的 ctx.scale() 结合 isPointInPath 来做角色点击检测，会导致严重的坐标系错乱（幽灵墙现象）。
当前实现方案：在原生的统一坐标系下，从屏幕最后画出的一层（renderables 倒序）开始，通过计算屏幕点击点与物体中心点的欧几里得距离 (Math.hypot) 来判定命中，实现了“所见即所得”的防穿透点击。

单一 PointerEvents 引擎：
所有触控与鼠标事件统一合并为 onPointerDown/Move/Up，并通过 e.stopPropagation() 隔离 Canvas 层与 React UI 层，彻底解决了移动端“幽灵双击”导致操作抵消的问题。

4. 项目启动与维护指南

4.1 运行方式

本项目为一个高度封装的 单一文件 (Single-File Component) 结构。
将 app.jsx 代码放入任何支持 React 和 Tailwind CSS 的打包环境（如 Vite, Create React App, 或 Next.js）即可直接运行。

4.2 接手 AI 开发建议

如果你是下一个接手此项目的 AI，建议从以下几个方向进行功能迭代：

视野与战争迷雾 (Fog of War)：目前地图全开，可以结合 BFS 算法为玩家添加视野限制。

技能树与 MP 系统：在 calcUnitStats 中加入 MP 计算，并在战斗 UI 中加入“技能”菜单，替代单一的普通攻击。

高级 AI 寻路：目前的敌人采用随机游走和极简攻击逻辑。可以引入 A* (A-Star) 寻路算法，让敌人懂得绕开障碍物包抄玩家。

多层级架构拆分：如果项目继续膨胀，建议将单个 app.jsx 拆分为 Engine.js (Canvas 渲染), Combat.js (战棋逻辑), 和 UI.jsx (React 组件) 三个独立模块。