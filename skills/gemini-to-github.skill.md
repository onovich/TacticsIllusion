---
name: gemini-to-github
description: 面向 Gemini Canvas 等来源的前端原型项目，按固定流水线完成架构重构、README、Git 接管、GitHub Pages 部署与远端预览验收。
---

# Gemini To GitHub Skill

## 目标与职责
将一个来源于 Gemini Canvas、单体 JSX、概念原型或半成品前端项目，流水线化地整理为可运行、可维护、可推送、可在 GitHub Pages 预览的正式仓库。

该 Skill 不是单一动作，而是一个**编排器**。执行时必须主动读取并调用当前项目 `skills/` 目录以及上层 `Skills` 项目中的对应技能文档，按顺序完成整个初始化流程，而不是只做其中一环。

## 适用场景

1. 用户给出一个原型前端项目，希望整理成正式 GitHub 仓库。
2. 项目当前可能只有 `origin/App.jsx`、设计文档或零散源码，尚未具备完整脚手架。
3. 用户明确要求未来可能移植到 Unity，但当前仍以 Web/React/Vite 为交付目标。
4. 用户要求最终产物具备 README、Git 远端、GitHub Pages 和浏览器验收。

## 输入前提

1. 当前项目根目录存在 `skills/` 目录。
2. 当前项目上层目录存在本地 `Skills/` 项目，作为可复用 skill 的上游源。
3. 用户已给定或确认远端仓库地址。

## 流水线总顺序

1. **读取技能源并对齐执行依据**
2. **重构为逻辑-表现-数据分离工程**
3. **编写 README**
4. **创建 Git、补齐 `.gitignore`、连接远端并推送**
5. **配置 GitHub Pages 所需项目条件**
6. **通过简易浏览器打开远端域名进行验收**
7. **若中途踩坑，回写当前项目 skill 与上游 Skills 仓库**

## 阶段 1：读取技能源并对齐执行依据

1. 必须先读取当前项目 `skills/` 目录下的相关 skill 文档。
2. 然后读取上层 `Skills/skills/` 中的同名文档，优先以较新、约束更完整的版本为准。
3. 至少应读取以下技能：
   - `canvas-app-refactor.skill.md`
   - `bilingual-readme-generator.skill.md`
   - `gh-pages-action-deployer.skill.md`
4. 若当前项目技能与上游 `Skills` 项目存在内容漂移，执行结束后应考虑同步回上游。

## 阶段 2：重构为逻辑-表现-数据分离工程

1. 先遵守 `canvas-app-refactor` 的执行前硬性检查。
2. 若当前项目只有原始源码而缺少标准前端入口，不得直接宣称“已重构完成”；必须先补齐可运行脚手架。
3. 重构目标至少包括：
   - 建立 `src/data/`
   - 建立 `src/logic/engine/`
   - 建立 `src/logic/hooks/`
   - 建立 `src/view/screens/`
   - 建立 `src/view/components/`
4. 对未来 Unity 迁移的要求：
   - 尽量将纯计算、状态推进、规则判断、实体生成等逻辑放入 `engine`。
   - React 视图层只保留输入桥接、生命周期接入与 UI 组装。
   - 配置常量、世界参数、颜色表和交互阈值统一放到 `data`。
5. 若因为时间或风险原因只能完成“可迁移准备”而未完全拆分，也必须如实说明，不得夸大为全量完成。

## 阶段 3：编写 README

1. 按 `bilingual-readme-generator` 编写双语 README。
2. 标题必须全英文。
3. 正文必须采用 `English<br/>**中文**` 格式。
4. README 中出现的运行命令、构建命令、部署命令必须基于仓库当前真实状态，不得写未经验证的命令。
5. 若项目尚未完全重构，应在 README 中准确描述为“已建立迁移方向/架构基础”，而不是声称所有分层工作都已完成。

## 阶段 4：创建 Git、补齐 `.gitignore`、连接远端并推送

1. 若仓库尚未初始化 Git：
   - 执行 `git init`
   - 创建合理的 `.gitignore`
   - 至少忽略 `node_modules/`、`dist/`、环境文件和常见编辑器缓存
2. 若仓库已存在 Git，则应在保留既有历史的前提下继续工作。
3. 若用户给出远端地址：
   - 配置 `origin`
   - 创建或切换到主分支
   - 提交变更并推送
4. 不得在未检查工作区内容的情况下覆盖用户已有远端配置。

## 阶段 5：配置 GitHub Pages 所需项目条件

1. 按 `gh-pages-action-deployer` 配置 Pages 工作流。
2. 若是 Vite 项目，必须根据仓库名设置 `base: '/RepoName/'`。
3. 必须在推送前本地执行 `npm run build`。
4. 若本地构建失败，先修复工程，再推送 workflow。
5. 必须提醒用户仓库设置中的 Pages Source 应切换为 `GitHub Actions`。

## 阶段 6：通过简易浏览器打开远端域名进行验收

1. 不是只打开 `localhost`。
2. 当 Action 推送完成后，必须尝试在 VS Code 简易浏览器打开远端 Pages 地址：
   - 一般为 `https://<user>.github.io/<RepoName>/`
3. 若首次访问仍是 404：
   - 先判断是否为部署延迟
   - 再判断是否为 `base` 配置错误
   - 再判断是否为 Action 构建失败
4. 只有在远端域名已可访问，或已经明确指出阻塞原因时，才能结束任务。

## 阶段 7：踩坑回写机制

1. 若执行过程中发现现有 skill 缺少关键约束，应更新当前项目 `skills/` 目录中的相关文档。
2. 若这些修正具有普适价值，还应同步更新上层 `Skills` 项目。
3. 若上层 `Skills` 项目发生修改，应单独提交并推送其远端。

## 强制自测清单

1. 已读取当前项目与上游 `Skills` 项目的对应 skill 文档。
2. 当前工程具备完整前端入口：`index.html`、`src/main.*`、`src/App.*`、有效 `package.json` 脚本。
3. 已执行 `npm run build` 且通过。
4. README 中提到的命令都能在当前仓库状态中找到依据。
5. 本地 Git 已接管，`.gitignore` 已存在，远端已推送。
6. GitHub Pages 所需 workflow 已存在，Vite `base` 已正确配置。
7. 已在 VS Code 简易浏览器打开远端 Pages 域名进行验收，或已明确说明阻塞点。

## 常见失败模式与规避

1. **把“有源码”误判为“有工程”**
   - 只有 `App.jsx` 或设计文档时，不能直接进入部署步骤，必须先建立工程入口。
2. **脚手架初始化半成功**
   - 在非空目录执行脚手架命令后，必须检查是否真的生成了 `index.html`、`src/main.*` 与脚本。
3. **依赖版本与 Node 版本错配**
   - 尤其注意 Vite、Tailwind、PostCSS 的组合兼容性。
4. **只做本地预览不做远端验收**
   - 用户要求的是 GitHub Pages 线上可访问，不能只用 `localhost` 代替完成验收。
5. **README 夸大完成度**
   - 若只完成基础搭建或部分分层，README 必须如实描述。
6. **只更新当前项目 skill，不更新上游 Skills 仓库**
   - 若本次踩坑对流程本身有普适价值，应同步回上游，避免后续重复犯错。

## 交付输出要求

1. 明确说明项目当前的分层状态，以及哪些部分已为未来 Unity 迁移做好准备。
2. 给出 README、Git 推送、Pages 地址与预览结果。
3. 若还更新了当前项目 skill 与上游 Skills 仓库，要分别说明是否已提交并推送。