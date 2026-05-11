---
name: agent-env-installer
description: 负责在当前环境中安装和配置基于Agent体系的Agent、Skill和Tool集合。支持Unity项目全量安装，以及分离提取出的非Unity(通用前端等)精简模式安装任务。
---

# Agent Environment Installer Skill

## 目标与职责
根据当前工程的技术栈分析结果（或用户明确指定的选项），将一组工作流所需的 Agent、Skill 及 Tool 配置文件安装到当前工作区的特定路径下（通常是 `.github/` 或 `.vscode/` 目录）。

## 核心模式
本安装器分为两种工作模式：

1. **全量安装模式（Unity环境）**
   - 若检测到工程根目录存在 `Assets`, `ProjectSettings` 等 Unity 特征文件夹，或用户明确说明是 Unity 项目，则执行全量安装。
   - 安装包含：底层系统管理 Agent、前后端拆分的 Agent、游戏配置读取 Tool、以及 **专门针对 Unity C# 和 Mono 渲染环境设计的相关 Agent 和 Skill**。

2. **精简过滤模式（Web / 纯前端等非Unity环境）**
   - 适用于 Vite, React 等通用前端或纯服务端 Node.js 项目。
   - **过滤策略**：必须在这个模式下剔除所有针对 Unity 的组件（如负责 Unity MonoBehaviour 生命周期、AssetBundle 打包、UGUI 解析等专用代理或技能）。
   - **过滤实现**：不要只按目录名 `unity/` 过滤；还要按文件名关键字（如 `unity.*`, `unity-*.skill.md`, `unity-*.agent.md`）做二次筛除，因为上游资产可能把 Unity 专属文件放在通用目录下。
   - **保留策略**：只安装通用的体验设计（core-experience）、性能分析（performance）、代码审查（style-review）、纯逻辑算法（gameplay.agent 等）、以及 Git 协作等领域不可知的通用协作者。

## 执行步骤
1. **环境检测**：在项目根目录使用 `ls` 或 `find` 扫描，判断是否属于 Unity 工程。
2. **资源拉取/释放 (默认源)**：默认将目标远端资产仓库设定为 `git@github.com:onovich/Agents.git`。从该知识库中检出最新的 Agent、Skill 和 Tool 配置文件，执行拉取。
3. **结构化放置**：在项目中建立 `.github/agents`, `.github/skills` 等标准目录，并按需拷入对应 `.md` 指令。
4. **汇报与对齐**：向用户报告安装清单，明确说明那些属于因技术栈（非Unity）被过滤的插件，确保透明。