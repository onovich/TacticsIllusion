# Tactics Illusion
Tactics Illusion is an isometric tactics RPG prototype built with React, Vite, Canvas, and Tailwind CSS.<br/>**Tactics Illusion 是一个基于 React、Vite、Canvas 与 Tailwind CSS 的等距战棋 RPG 原型。**

## Overview
- Explore a 100x100 procedural world and trigger bounded turn-based encounters on the overworld map.<br/>**玩家可以在 100x100 的程序化世界中探索，并在大地图上触发带边界的回合制遭遇战。**
- Preserve the original canvas-driven pointer interaction, hit-testing flow, and floating combat feedback from the source prototype.<br/>**保留了原型里基于 canvas 的 Pointer 交互、命中判定流程和战斗浮字反馈。**
- Establish a migration-oriented project structure for future Unity porting instead of claiming a full gameplay rewrite.<br/>**当前重点是建立面向未来 Unity 移植的项目结构，而不是声称已完成全量玩法重写。**

## Architecture
- src/data stores world constants, unit definitions, gem effects, and initial player data.<br/>**src/data 存放世界常量、职业定义、宝石效果与初始玩家数据。**
- src/logic/engine isolates pure world generation, coordinate math, movement range calculation, combat stats, and encounter setup.<br/>**src/logic/engine 隔离了纯世界生成、坐标换算、移动范围计算、战斗属性计算与遭遇战初始化。**
- src/logic/hooks keeps the state-ref synchronization pattern used to protect canvas runtime behavior.<br/>**src/logic/hooks 保留了用于保护 canvas 运行行为的状态与 ref 同步模式。**
- src/view/components and src/view/screens now host the major overlay UI, while the canvas render loop still lives in src/view/screens/TacticsIllusionScreen.jsx.<br/>**主要浮层 UI 已迁入 src/view/components 与 src/view/screens，而 canvas 渲染循环仍集中在 src/view/screens/TacticsIllusionScreen.jsx。**

## Source Assets
- origin/App.jsx keeps the original single-file implementation as a preserved fallback source.<br/>**origin/App.jsx 保留了原始单文件实现，作为可回溯的保底来源。**
- origin/design.md captures the product intent, interaction model, and handoff notes from the prototype stage.<br/>**origin/design.md 记录了原型阶段的产品意图、交互模型与交接说明。**

## Commands
- npm install<br/>**安装项目依赖。**
- npm run dev<br/>**启动本地开发服务器。**
- npm run build<br/>**执行生产构建。**
- npm run preview<br/>**预览构建产物。**

## Deployment
- GitHub Pages is configured through GitHub Actions with the Vite base path set to /TacticsIllusion/.<br/>**GitHub Pages 已通过 GitHub Actions 配置，且 Vite 的 base 路径已设为 /TacticsIllusion/。**
- After pushing, switch Settings -> Pages -> Source to GitHub Actions in the repository settings.<br/>**推送后，请在仓库设置中将 Settings -> Pages -> Source 切换为 GitHub Actions。**
- The expected public URL is https://onovich.github.io/TacticsIllusion/.<br/>**预期公开地址为 https://onovich.github.io/TacticsIllusion/。**

## Status
- The project is now a runnable Vite application and no longer only a loose origin source drop.<br/>**当前项目已经成为可运行的 Vite 应用，不再只是松散的 origin 源码投放。**
- The refactor is intentionally partial: data, engine, hooks, and major overlay views are separated, but the full canvas gameplay loop is not yet decomposed into smaller feature modules.<br/>**这次重构是有意控制范围的部分拆分：数据、引擎、hooks 和主要浮层视图已分离，但完整的 canvas 玩法循环尚未拆成更细的功能模块。**