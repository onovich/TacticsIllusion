---
name: gh-pages-action-deployer
description: 专注为当前基于 Vite/React/前端 等Web工程建立官方推崇的基于 GitHub Actions 自动化工作流部署至 GitHub Pages 的托管方案。
---

# GitHub Pages Action Deployer Skill

## 目标与职责
免除开发者手动编译代码或繁琐的 `gh-pages` 分支推送。用 GitHub 官方最新提供的 `actions/deploy-pages@v4` 来无缝代理静态前端资源上线流程。

## 执行前检查

1. **先确认项目本地可构建**
   - 在编写或推送 Actions 之前，必须先本地执行一次 `npm run build`。
   - 如果本地构建失败，优先修复入口文件、脚本、Node 版本、CSS 工具链问题，而不是先提交 workflow 碰运气。
2. **确认静态站点入口存在**
   - Vite 项目至少应存在 `index.html` 和 `src/main.*`。
   - 若缺失这些文件，GitHub Actions 中的 `vite build` 会直接失败。
3. **确认 Node 版本与依赖兼容**
   - 工作流 Node 版本和项目依赖要匹配。
   - 若本地开发环境较旧，但 workflow 使用 Node 20，则仍应确保锁定的依赖在 Node 20 下可稳定安装与构建。

## 实施经验与标准化步骤

1. **工程路由配置 (Vite 示例)**
   - 托管在 GitHub Pages 的网站如果没有绑自定义一级域名，往往会携带二级目录（如 `/RepoName/`）。
   - 修正 `vite.config.js` 等打包器的路由基座为：`base: '/YourRepositoryName/'`，防止 `index.html` 引用的 JS 或 CSS 出现 404 FileNotFound。

2. **编写 Actions 自动化构建文件**
   - 建立 `.github/workflows/deploy.yml`。
   - 必须配置核心权限设定，这是官方动作运行的核心要求：
     ```yaml
     permissions:
       contents: read
       pages: write
       id-token: write
     ```
   - 确保 `Setup Node` 的版本能向下兼容最新的打包器生态（如指明 `node-version: 20` 防止 EBADENGINE 老旧报错）。
   - 工作流须划分 `build` 与 `deploy`：
     - `build`: 负责安装 (`npm ci`)，构建 (`npm run build`) 并归档输出制品 (`uses: actions/upload-pages-artifact@v3` with `path: dist`)。
     - `deploy`: `needs: build` 的强校验，然后发布为官方服务 (`uses: actions/deploy-pages@v4`)。
   - 若项目使用 Tailwind/PostCSS，必须确保对应配置与安装版本一致，不要出现“Tailwind v4 依赖却沿用 v3 配置”之类的半升级状态。

3. **本地自测要求**
   - 在推送前至少完成以下检查：
     - `npm run build` 成功。
     - 生成 `dist/` 目录。
     - 若是 Vite，检查构建后的资源路径是否带上正确 `base` 前缀。
   - 若用户要求 VS Code 内预览，优先本地打开打包结果或 dev server 页面，确认不是空白页再结束。

4. **指导用户手动配置控制台设定**
   - 虽然代码和流水线提交至远端，但 GitHub Repo 的安全策略不允许未经准许的 Actions 提供静态服务篡改。
   - 必须在处理结尾告知用户：前往 `Settings -> Pages -> Source` 将部署从默认分支修改勾选为 **「GitHub Actions」**。

5. **自定义域名 (CNAME) 处理**
   - 检查用户是否需要使用 CNAME 自定域。若在 `Deploy via Actions` 策略下需要绑定，请确保在仓库静态根目录下添加了 CNAME。（注：若是 `gh-pages` 策略才在 Action 中配置 `cname` 参数，必须保持警惕）。

## 常见失败模式与规避

1. **Action 失败其实是项目没法构建**
   - 最常见根因不是 workflow YAML，而是项目本身缺少 `index.html`、缺少 `build` 脚本、或入口引用错误。
2. **`base` 配置缺失导致线上 404**
   - 对仓库子路径部署，忘记设置 `base: '/RepoName/'`，页面会发布成功但资源加载失败。
3. **Node 与依赖版本错配**
   - 本地随手装了只支持 Node 20+ 的依赖，但项目环境仍在 Node 18，会导致本地和 CI 行为不一致。
4. **CSS 工具链半升级**
   - Tailwind、PostCSS、插件版本若不成套，Action 常在 CSS 阶段失败。

## 结束前验收清单

1. `npm run build` 已本地通过。
2. `.github/workflows/deploy.yml` 已存在且包含 `pages: write` 与 `id-token: write` 权限。
3. Vite `base` 已与仓库名一致。
4. 已告知用户在仓库设置中切到 `GitHub Actions`。
5. 若本次已推送代码，应提醒用户首次部署可能存在数十秒延迟，并在必要时刷新线上域名验证。