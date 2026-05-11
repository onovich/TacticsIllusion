---
name: canvas-app-refactor
description: 专门用于将Gemini Canvas等AI对话生成的单体JSX前端项目，重构为逻辑-表现-数据（MVC）分离的标准前端工程，且严格保证像素级还原。
---

# Canvas App Refactor Skill

## 目标与职责
当处理早期的实验性或从 AI 大语言模型（如 Gemini Canvas）生成的单体富应用 `.jsx`（如含有巨大代码量和重度内部状态依赖的 `App.jsx`）时，负责在不改变任何用户层 UI 与 UX 的前提下进行架构解耦。

## 执行前硬性检查

1. **先确认当前工程是否真的是可运行前端项目，而不是只有源码草稿**
   - 若根目录缺少 `package.json`、`index.html`、`src/main.jsx|tsx`、`src/App.jsx|tsx`，不得直接宣称“已完成 Vite 化”。
   - 若项目目录非空，严禁直接在根目录盲目执行脚手架命令后就假设初始化成功，必须检查脚手架是否真的生成了入口文件和脚本。
2. **优先保住原始可运行版本**
   - 在重构前先确认原始入口文件位置（例如 `origin/App.jsx`）。
   - 若准备迁移至 `src/` 目录，必须明确保留一份可回填的原始实现，避免重构过程中入口丢失导致整个工程无法启动。
3. **技术栈兼容性检查**
   - 在安装 Vite、Tailwind、插件前，先检查本地/CI 的 Node 版本。
   - 若 Node 低于 20，不要默认采用需要新 Node 版本的最新生态组合；尤其对 Tailwind v4、较新 Vite 插件版本，要先验证兼容性。

## 设计拆解与执行标准

1. **像素级不变与无损操作**
   - **视觉无损**：严禁任意更改 Tailwind 类名层级与 CSS 内联逻辑，原始宽高和 Flex 弹性自适应机制一分不差予以保留。
   - **交互无损**：必须确保触屏 `touch`（双指 Pinch、拖拽）、`pointer` 悬停防抖等 UX 保留。（即不盲目重写全局浏览器原生事件监听机制）

2. **数据抽出 (Data Layer)**
   - 创建 `src/data/` 目录。
   - 提取业务常量定义（如卡牌字典、商品配置）。
   - 提取依赖运算的初始值字典工厂、甚至单文件内封装的类或 Mock 模拟数据。

3. **逻辑无头化与优化保留 (Logic Layer)**
   - 建设 `src/logic/engine/` 用于纯计算或核心统筹计算。
   - 建设 `src/logic/hooks/`，这是最关键一步。单文件中往往含有针对 `useEffect` 高频重绘（比如 50ms 心跳）触发的闭包陷阱（Stale Closure）。
   - **经验红线**：若原作中使用了 `useRef(state)` 的双重状态引用同步大法，千万**不要**随意改成普通依赖，必须以自定义 hook 形式保持这套能跑的性能同步引擎。

4. **展示拆片 (View Layer)**
   - 建立 `src/view/screens/` 级与 `src/view/components/` 级拆分。
   - 以原始大渲染树剥离片段，剔除业务依赖，将其设计成只认 props 的纯展示哑组件。

5. **组装主入口配置**
   - 引入 Vite (如 `npm i -D vite @vitejs/plugin-react` ...) 、补齐 TailwindCSS 基建补丁（`postcss`, `tailwind config`）。
   - 缩减 `App.jsx` 的作用直至其只剩下组合 Views 和接入 Hooks。

6. **为未来 Unity 迁移保留边界清晰度**
   - 所有地形生成、实体生成、数值推进、胜负判定、导航目标选择等纯计算逻辑，优先放到 `src/logic/engine/`，避免直接耦合 React 生命周期。
   - React 层仅负责输入采集、生命周期桥接和 UI 展示。这样后续移植到 Unity 时，可将 engine 层映射到 C# 类、ScriptableObject 或 ECS 系统。
   - 所有配置常量、世界参数、颜色表、交互阈值统一抽到 `src/data/`，不要散落在 JSX 大组件里。

## 常见失败模式与规避

1. **脚手架未真正落盘**
   - 只运行了 `npm create vite@latest` 并不代表项目已完成初始化。
   - 必须随后验证根目录是否存在：`index.html`、`src/main.*`、`src/App.*`、`package.json` 中的 `dev/build` 脚本。
2. **入口文件丢失**
   - 只复制 `App.jsx` 而没有建立 `src/main.jsx` 和 `index.html`，会导致构建直接失败。
3. **Tailwind 版本误判**
   - Tailwind v4 的 PostCSS 接入方式与 v3 不同，且在低版本 Node 或某些 CI 环境里更容易因原生依赖失败。
   - 若项目目标是稳妥上线与快速交付，且运行环境不明确，优先选 Tailwind v3 方案。
4. **把“目录规划”误当成“重构完成”**
   - 仅创建 `src/data`、`src/logic`、`src/view` 目录并不算完成重构。
   - 至少要确保工程仍然可 `npm run dev` 和 `npm run build`，再声称完成。

## 最低自测清单

1. 检查入口文件齐全：`index.html`、`src/main.jsx|tsx`、`src/App.jsx|tsx`。
2. 检查 `package.json` 至少包含 `dev` 与 `build` 脚本。
3. 执行一次 `npm run build`，未通过不得结束任务。
4. 若用户要求预览，再执行一次 `npm run dev` 并确认页面可打开。
5. 若声称“为未来 Unity 迁移做准备”，必须能指出哪些逻辑已经与 React 视图分离，而不是只新建空目录。