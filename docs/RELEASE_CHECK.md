# 发布前检查 · 2026-10-13

目标站点：`https://zhangwei-1999.github.io/`。

本地代码与静态产物检查通过，可以准备提交源码。当前工作目录没有 `.git`，本次没有初始化仓库、提交、推送或部署；远端历史、仓库设置和 GitHub Actions 的真实运行结果尚未验证。

## 已完成的修复

- 更新开发依赖：Sharp `0.35.5`、Wrangler `4.150.0`，以及锁文件中的 `source-map-js`。完整 npm 审计从 5 项高危告警降至 0 项已知告警。
- `.gitignore` 覆盖 `.env` 和 `.env.*`，只为明确的 `.example` 模板保留例外。
- 预渲染不再把 Markdown 维护文档、隐藏文件和未使用的原始头像 `images/myphoto.jpg` 复制到 `dist/`。原文件保留在源码目录，论文、BibTeX 与展示图保留。
- 构建校验新增环境文件、符号链接、不应发布的维护文档/原头像检查，并在产物达到 1,000,000,000 字节时失败。
- Pages 校验步骤与构建步骤使用相同的站点 URL 和 Base Path，修复未来切换自定义域名时可能误报的问题。
- 双语 README 补充安全提交步骤，并纠正 `tagline` 为 SEO 简介。

## 本次验证

| 检查 | 结果 |
| --- | --- |
| Node 22 + 更新后的锁文件 `npm ci` | 通过 |
| `npm run lint` | 通过 |
| `npm test` | 76/76 通过 |
| `npm audit`，包含开发依赖 | 0 项已知漏洞 |
| TypeScript + 生产构建 | 通过 |
| `npm run check:build` | 10 个 HTML 文档、152 个本地资源、SEO、sitemap 与 base 校验通过 |
| 自定义 origin + `/release-check/` 子路径 | 构建和产物校验通过；随后已恢复目标根路径构建 |
| Wrangler 4.150.0 Worker dry-run | 编译通过，未部署，未修改生产 Secret 或数据库 |
| 生产 JS 的 API 地址 | 包含线上 Worker URL，不包含本地 `http://127.0.0.1:8787` |
| 原开发预览 | `http://127.0.0.1:5173/` 返回 HTTP 200 |

使用无 SPA fallback 的静态服务器，在浏览器中核对了五个主页面、四个相册的直接访问与刷新、当前导航、canonical、中文切换、公开相册解密显示、Lightbox 打开/切换/ESC，以及未知路由返回首页。Home 和 Gallery 在 375px 下无横向溢出。私密相册未输入口令时保持锁定。本轮没有运行完整的 Playwright E2E 套件，也没有向线上服务提交口令。

## 上传范围与体积

- 最终 `dist/`：**764,291,691 字节**，约 **764.3 MB / 728.9 MiB**，460 个文件。
- GitHub Pages 官方上限为 1 GB，当前低于上限，剩余约 235.7 MB。继续增加照片时应重新执行 `check:build`。见 [GitHub Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)。
- 初始正常 Git 候选文件扫描没有 50 MiB 以上单文件，最大文件是 22,982,511 字节的原始头像；最大相册密文是 6,628,986 字节。
- 原始相册照片、本地密钥、环境配置、日志、开发工具状态、测试报告和 `dist/` 被 Git 忽略。`public/gallery-encrypted/` 发布密文；没有明文相册图片。
- Photography、Aesthetic 和公开封面的查看密钥按设计公开，访客可以保存公开展示的照片；这与 Life/Lover 的服务端授权不同。
- 原始头像 JPG 只从部署产物排除，仍是可提交的公开头像源文件。工程维护文档也仍可随源码提交，但不再部署为网站文件。

## 尚未确认的线上事项

1. 初次终端直连 Worker 超时，浏览器也返回网络阻止。2026-10-13 准备推送时，使用系统现有代理已复核 `/v1/health` 返回 HTTP 200 和 `{ "ok": true }`，并确认 CORS 允许 `https://zhangwei-1999.github.io`。本轮没有提交真实口令；发布后仍需在目标站点验证 Life 解锁及后台访问。
2. 既有 Cloudflare CPU 测量仍有请求超过当时的 10ms 目标；本次只更新本地工具，未部署新的 Worker，也未重新测量 CPU，不能承诺每次请求均低于额度。历史结果保留在服务说明中。
3. 当前不是 Git 仓库，无法检查待提交列表或旧提交历史中的私密文件。复制到真实仓库后必须重新检查 Git 的跟踪状态。

## 实际推送步骤

1. 使用真实仓库，通过 Git 或 GitHub Desktop 提交所需源码和加密资源，并保留本项目 `.gitignore`。不要把整个工作目录拖拽到网页上传或直接压缩上传，也不要强制添加被忽略文件。
2. 运行 `git status --short --ignored`，核对 `.private/`、环境文件、`.dev.vars*`、`.wrangler/`、`node_modules/`、`dist/` 未被暂存或跟踪。忽略规则不会自动移除以前已经跟踪的文件。
3. GitHub 仓库 Settings → Pages → Source 选择 **GitHub Actions**。
4. 推送至 `main` 或 `master`。工作流会从源码构建，仅将 `dist/` 交给 Pages。
5. 确认 Actions 的 build、deploy 都成功，再访问目标站点并直接刷新 `/news/`、`/gallery/aesthetic/`；最后检查真实相册授权服务。

不要把相册、管理员或删除口令放入前端环境变量或 GitHub。工作流已有公开 Worker URL 默认值；`GALLERY_API_URL` 只是可选的公开地址覆盖变量，不是密码。
