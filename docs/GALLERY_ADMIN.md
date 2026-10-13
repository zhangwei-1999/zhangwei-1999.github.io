# Gallery 管理服务：部署、访问控制与统计

前端继续部署在 GitHub Pages。私密相册授权、IP 冷却、访问记录与管理会话由独立的 **Cloudflare Worker + D1** 提供。公开相册和封面仍使用各自的公开查看密钥。

**部署记录（2026-09-23）：Cloudflare OAuth 已完成，Workers 当前套餐为 Free（$0），未购买或升级。** D1、远程 migration、Secret 和初版 Worker 已配置，线上后台及本地前端联调已通过。初版 100,000 次 PBKDF2 认证 CPU P99 为 **26.260ms**，超过 Free 的 10ms 预算。所有者已授权保留 PBKDF2，并将迭代次数调整至 30,000–100,000 范围；混合 verifier 与审计分页已部署并激活，当前版本为 `18607b41-6c83-4130-bad1-da2411d53c5d`，全部凭据使用 30,000 次 PBKDF2；最终 33 个请求样本无错误，P50 为 3.460ms，P99/最高为 11.731ms，两次请求超过 10ms。**功能验证通过，但仍未达到所有请求低于 10ms 的要求。** 口令、照片及所有既有数据密钥保持不变。GitHub Pages 前端尚未推送部署。

| 项目 | 已确认状态 |
| --- | --- |
| D1 | `wei-gallery-audit`，APAC，`9fbc7e60-c22a-4bd7-9dcc-1c599c83513e` |
| 数据库 migration | `0001` 已远程应用 |
| Secret | `SECRETS` 已通过 Wrangler secret bulk 上传；值不公开 |
| Worker | [wei-gallery-audit.zhangwei99-math.workers.dev](https://wei-gallery-audit.zhangwei99-math.workers.dev/v1/health) |
| 当前部署版本 | `18607b41-6c83-4130-bad1-da2411d53c5d`；混合 verifier v2，全部凭据为 30,000 次 PBKDF2 |
| 新版验证 | 已部署并激活；76 项单元测试、lint、TypeScript 和 build 通过，25 项静态检查与真实浏览器照片/Lightbox/面板检查通过；CPU 样本两次超过 10ms，未全面达标 |
| 定时清理 | `17 3 * * *` |
| GitHub Pages | 未执行 Git 推送或 Pages 部署；工作流已有默认 Worker 地址，`GALLERY_API_URL` 为可选覆盖项 |

本工作区已完成本地 D1 联调，Life 的 122 张照片及空的 Lover 已迁移为 v3。开发预览仍由忽略提交的 `.env.development.local` 连接本地 8787；`.env.production.local` 已配置线上地址，不改变源码默认值。下列步骤保留为首次部署和维护参考，不需要为了重复执行记录而重新创建现有 D1。

本次线上 smoke 结果：健康接口在浏览器与终端均为 200；四相册访问记录为 200；一次明确标注的合成错误共享短语为 401；Life/Lover 解锁为 200，返回密钥分别能解开 122 张和 0 张照片的 manifest；管理员登录、面板解密、完整审计读取与退出成功，退出后的 token 再读为 401，未知 Origin 为 403。正确相册输入与管理员输入未被记录的检查通过。**未执行 reset；测试记录保留。** 本机终端通过已有系统代理完成请求，最初的直接网络超时不是当前服务部署阻塞。

另已使用本地生产构建连接真实线上 API，完成浏览器相册与管理面板联调；API 未 mock，也未将该产物上传 GitHub。详细测试与检查记录统一见 [VERIFICATION.md](VERIFICATION.md)。

## 1. 文件与密钥在哪里

使用 **Node.js 22+**。在项目根目录安装依赖：

```sh
npm install
```

| 位置 | 用途 | 是否上传 |
| --- | --- | --- |
| `.private/gallery/` | 所有原片、照片清单、发布参数、相册口令 | 不上传；另行本地备份 |
| `.private/analytics/credentials.json` | 独立的管理员与重置口令，字段为 `admin`、`reset` | 不上传 |
| `.private/analytics/secrets.json` | 相册随机 AES 密钥、口令 verifier、审计加密密钥等 | 不上传到 GitHub |
| `.private/analytics/worker-secrets.json` | 用于 Wrangler secret bulk 的 `SECRETS` 绑定 | 仅通过 Cloudflare Secret 上传 |
| `.private/analytics/dashboard.html` | 管理面板明文模板 | 不上传 |
| `services/gallery-worker/.dev.vars` | 本地 Worker 的秘密绑定 | 不上传 |
| `public/_data/panel.enc` | AES 加密的管理面板 | 随网站上传 |
| `public/gallery-encrypted/` | 相册清单、展示图与缩略图密文 | 随网站上传 |
| `src/data/gallery-*.generated.json` | 公开数量、路径、访问模式，以及公开相册查看密钥 | 随网站上传 |

这些本地凭据已经按当前工作区需求准备；不要在文档、源码、终端参数、截图或 GitHub Actions 日志中重复填写真实值。换电脑需要自己的 `.private/` 备份，单独克隆 GitHub 仓库不能恢复原片、口令或服务密钥。`docs/` 会发布，因此也不能用来存放这些文件。

## 2. 准备本地服务与加密面板

所有者已明确授权保留 PBKDF2 的混合校验协议；不采用纯 HMAC 替代。升级仍按第 3 节先部署兼容代码，再 prepare 和上传新 Secret。混合协议现已部署激活；下列步骤保留供日常维护和新环境部署参考。

确认本地 `credentials.json` 包含非空的 `admin` 与 `reset` 字段，`.private/gallery/keys.json` 包含私密相册口令，并保留本地 `dashboard.html`。然后运行：

```sh
npm run gallery:admin:prepare
```

新版脚本生成 **verifier v2**，算法标识为 `PBKDF2-HMAC-SHA256+HMAC-SHA256`。先以随机 16 字节 salt 通过 PBKDF2-HMAC-SHA256 派生 32 字节，再用专用随机 32 字节 `passwordPepper` 对协议标签、`admin-login` / `admin-reset` / `album:<slug>` context、salt、迭代次数和派生结果计算 HMAC-SHA256。只保存最终 HMAC，不保存派生结果；服务使用 Web Crypto 验证 HMAC。默认 **30,000 次**，可在 prepare 时将 `GALLERY_PASSWORD_ITERATIONS` 设为 30,000–100,000 范围内的整数，例如：

```sh
GALLERY_PASSWORD_ITERATIONS=30000 npm run gallery:admin:prepare
```

修改此值需要重新 prepare 并上传 Secret，不是仅改变 Worker 环境变量。这里的 verifier v2 与照片 manifest 版本无关，managed 照片仍是 v3。

准备脚本先验证已有 secrets；不合法时直接停止，不覆盖数据密钥。已有相册 AES、审计、IP HMAC、面板密钥及已存在的 pepper 均保留；只有第一次升级时新增专用 pepper。准备完成后，每个生成文件以 `0600` 权限原子替换，更新本地 secrets、`.dev.vars` 和加密面板 `public/_data/panel.enc`，不打印口令或密钥。**verifier 升级不需重新加密相册照片。**

生产入口 `entry.ts` 在模块启动时校验 Secret 并预导入四个服务器 CryptoKey：IP HMAC 签名、pepper HMAC 验证、审计 AES 加密和解密。这里不执行 PBKDF2、随机数生成、网络请求或 D1 操作；每次口令验证仍完整执行 30,000 次 PBKDF2。配置与服务器 key 缓存、限流原子 UPSERT、管理员成功日志与会话的单次 D1 事务均用于减少非口令派生开销。Wrangler 报告该版本 startup 为 4ms，这是启动指标，不是请求 CPU 达标证明。

pepper 与 verifier 均只保存在本地忽略目录和服务 Secret，不能进入 GitHub 或客户端包。单独泄露 verifier 时，攻击者缺少 pepper，不能仅凭该记录验证口令猜测；两者同时泄露时，每次猜测仍需执行配置次数的 PBKDF2。默认 30,000 次的离线计算成本低于原来的 100,000 次，必须结合在线 IP 冷却和服务器秘密保护使用。相册数据密钥始终独立随机，不由口令派生。

### 可选：先做本地联调

```sh
npm run gallery:service:migrate
npm run gallery:service:dev
```

`gallery:service:migrate` **只应用本地 D1 migration**。`gallery:service:dev` 在 `http://127.0.0.1:8787` 启动 Worker，显式允许本地 Vite/preview/test 的 origin；本地模式统一使用 `127.0.0.1` 作为测试身份，不模拟真实访客 IP，也不使用调用方伪造的转发头。

另开终端运行前端：

```sh
VITE_GALLERY_API_URL=http://127.0.0.1:8787 npm run dev
```

服务端授权的完整相册流程需要 v3 密文。首次迁移见第 4 节；只在已经准备好服务密钥、确认服务可用时执行，不要把仍依赖本地 Worker 的版本直接发布给线上访客。

## 3. 创建并部署 Cloudflare 服务

先登录并创建 D1：

```sh
npx wrangler login
npx wrangler d1 create wei-gallery-audit --config services/gallery-worker/wrangler.jsonc
```

将返回的真实 `database_id` 填入 `services/gallery-worker/wrangler.jsonc` 的 `d1_databases` 项，替换占位符，保留 binding 名称 `DB`。检查 `ALLOWED_ORIGINS`：生产配置只列出真实站点 origin，例如 `https://zhangwei-1999.github.io`；使用自定义域名时同步修改。这里是 origin，不带相册路径，也不使用通配符。

然后明确对远程数据库应用 migration，先部署兼容代码，再上传 Secret：

```sh
npx wrangler d1 migrations apply DB --remote --config services/gallery-worker/wrangler.jsonc
npm run gallery:service:deploy
npx wrangler secret bulk .private/analytics/worker-secrets.json --config services/gallery-worker/wrangler.jsonc
```

只通过 Secret 绑定上传 `worker-secrets.json`；不要把其内容复制到 `wrangler.jsonc` 的 `vars`、GitHub 仓库变量或源码中。保存部署输出的 HTTPS Worker 基础 URL，并检查该地址的 `/v1/health`。这一步的数据库与部署结果，以自己的账户和命令输出为准。[Cloudflare D1 命令参考](https://developers.cloudflare.com/d1/wrangler-commands/)

已有服务升级时，必须**先部署同时支持旧 100,000 次 PBKDF2 与新混合 verifier 的 Worker 代码，再运行 `gallery:admin:prepare` 并上传新 Secret**。新 prepare 默认使用 30,000 次 PBKDF2，可通过 `GALLERY_PASSWORD_ITERATIONS` 指定 30,000–100,000 范围内的整数。保留旧格式兼容可避免切换期间无法登录；不要把新 Secret 交给只认识旧格式的 Worker。

初版 100,000 次 PBKDF2 认证实测 CPU P99 为 **26.260ms**，认证阶段约 19–26ms，超过 Free 的 10ms 预算。所有者已授权保留 PBKDF2，并在 30,000–100,000 次范围调整，新版先使用 30,000 次并增加独立 pepper 的后置 HMAC。它保留慢速派生步骤、随机相册数据密钥及原有尝试限制。混合协议及审计分页已部署并激活，全部凭据保持 30,000 次 PBKDF2。最后测量窗口自 2026-09-23 07:54:38 UTC 开始，Cloudflare GraphQL 返回 33 个单请求样本、0 错误，P50 为 **3.460ms**，P99/最高为 **11.731ms**。首个管理员登录为 11.731ms，另一次 Life 解锁为 10.578ms，仍有两次超过 10ms，**未达到所有请求均在预算内的要求**。样本没有资源失败，但平台弹性不是未来保证；较大审计负载需独立测量。保留当前预初始化版本，不继续降低至 30,000 次以下或更换认证算法。当前未购买或升级套餐。详细证据见 [验证记录](VERIFICATION.md)；预算参考 [Cloudflare CPU 限制](https://developers.cloudflare.com/workers/platform/limits/)。

## 4. 迁移私密密文，再连接 GitHub Pages

远程 Secret、D1 和 Worker 可用后，在保有本地备份的机器上运行：

```sh
npm run gallery:managed
```

默认迁移 Life 和 Lover，也可显式指定：

```sh
npm run gallery:managed -- life lover
```

迁移将旧 v1 密文完整备份到 `.private/analytics/legacy-encrypted/<slug>/` 并校验 SHA-256，再用随机数据密钥重新加密**已有的展示图与缩略图字节**，不会重新采样原片。公开相册与封面的 v2 密文不变。私密 manifest 变为 `version: 3, access: "managed"`，生成的 private descriptor 同步标注 managed。

v3 不再发布 PBKDF2 参数，也不能用相册口令离线派生图片密钥；浏览器必须先通过 Worker 验证才能取得随机查看密钥。已迁移的相册再次运行迁移时，会验证当前密钥和每份密文，再保持不变。以后的 `gallery:encrypt` 自动保留 managed 模式；本地服务密钥缺失时失败，不会悄悄退回 v1。

Pages 工作流已经默认连接当前已部署 Worker，无需额外变量即可构建。更换服务地址时，可在 GitHub 仓库 **Settings → Secrets and variables → Actions → Variables** 设置可选 repository variable 来覆盖默认值：

```text
GALLERY_API_URL = https://wei-gallery-audit.zhangwei99-math.workers.dev
```

这里只保存公开的服务地址，不能填写密码、管理 token 或数据密钥。Pages 工作流优先使用此变量，未设置时回退到上述已部署地址，再传给构建环境的 `VITE_GALLERY_API_URL`。本地 `.env.production.local` 已准备同一地址；该 URL 是构建时配置，修改后需要重新构建前端。

```sh
npm run lint
npm run test
npm run build
npm run check:build
```

本地生产构建通过环境变量或忽略提交的 `.env.production.local` 配置实际 API URL；`.env.development.local` 继续连接本地 Worker。将源码、`public/gallery-encrypted/`、两个 Gallery 生成 JSON 与 `public/_data/panel.enc` 一起提交，然后推送触发 Pages。**不提交 `.private/`、`.dev.vars`、原图、管理面板明文或服务秘密。** Worker 与 Pages 是两套独立部署；构建检查通过不能替代线上解锁及冷却测试。目前尚未执行这一步 Git/Pages 发布。

如果服务 URL 尚未配置，管理入口与服务端授权不可用。已经迁移的 v3 相册不会以旧浏览器密码解密作为降级方式；启用前应安排好 Worker 可用性。

## 5. 访问限制与审计内容

私密相册的失败计数以服务端 HMAC 化的 Cloudflare 边缘 IP 身份为依据，并在受保护相册间共享；刷新页面、清除浏览器缓存不会清除服务端计数。管理员登录与重置使用独立的限制身份。

| 已验证错误次数 | 本次之后的冷却 |
| --- | --- |
| 1–5 | 无 |
| 6 | 1 分钟 |
| 7 | 5 分钟 |
| 8 | 10 分钟 |
| 9 | 20 分钟 |
| 10 | 30 分钟 |
| 11 及以后 | 60 分钟 |

连续 **24 小时没有失败验证** 后计数重置。成功解锁不清除已有计数。冷却中提交和状态轮询不增加失败次数，也不延长冷却。并发验证由服务端串行控制；正在进行验证时的冲突响应不作为一次失败。

相册访问与授权事件会记录时间、相册、浏览器/语言/时区等有限上下文。精确 IP、网络位置和下列失败短语存在 AES-GCM 加密的 D1 详情中；用于聚合的时间、事件种类、相册及 HMAC 身份是数据库普通字段。

- **只有经过服务端实际验证为错误的共享相册短语**，才保留输入的原始文字；最多 **256 个 Unicode 码点**，超过时截断并记录截断标记。
- 成功输入、冷却拦截输入、管理员口令、重置口令均不保存。服务不记录请求正文或凭据日志。
- 位置来自 IP 网络数据，坐标四舍五入至小数点后一位；它不是 GPS、街道地址或访客实际所在地证明，不会请求浏览器定位权限。
- 记录采用 **90 天保留策略**，每日清理过期数据。新版管理 API 每次返回 **50 条事件详情**，面板自动分页加载最多最新 **2,000 条**；首批响应的 SQL 汇总覆盖整个所选区间，不受详情上限影响，并提供截断提示。

只有在表单中使用相册共享短语。该功能不是个人账户登录，不能把其他网站或个人账户的密码当作相册猜测输入。

## 6. 管理入口与重置

中文 Gallery 页脚句末的隐蔽标点可打开管理登录。这只是界面入口，**隐藏位置不是安全措施**；真正的控制由服务端 verifier、IP 限制和会话校验完成。

管理面板的 HTML 留在忽略提交的 `.private/analytics/dashboard.html`。公开目录只有 AES 加密的 `panel.enc`。管理员验证成功后获得临时面板密钥和 **15 分钟**会话；token/解密内容只保存在当前页面内存中，D1 仅保存 token 的哈希。退出、刷新或会话到期后需要重新验证。管理口令、verifier 与面板密钥不能写入前端包。

重置需要当前管理员会话和独立的重置口令。**重置只删除审计历史与去重记录，不清除相册或管理员冷却状态**，也不注销当前管理员会话。

## 7. 日常维护和恢复

新增照片沿用 [相册发布维护说明](PRIVATE_GALLERY.md)。完整重新发布需要本地原片、`photos.json`、`publish.json` 与服务数据密钥；不要从 GitHub 密文目录假定能还原整套源材料。原片必须始终保留在本地忽略目录并另行备份。

修改共享相册口令：仅在本地编辑 `keys.json`，确认 Worker 已部署兼容当前 verifier 格式的代码，再运行 `gallery:admin:prepare` 并通过 `wrangler secret bulk` 上传服务 Secret。修改管理员或重置口令则编辑本地 `credentials.json`，执行同一准备和上传流程。准备脚本保留随机数据密钥与已有 pepper，因此**v3 改口令无需重新加密所有照片**。该命令也重新生成面板密文，随后同步发布新的 `panel.enc`。

不要手动覆盖既有的 `auditKey`、`ipHmacKey`、`dashboardKey`、`passwordPepper` 或相册 `dataKey`：更换它们需要同步处理对应数据或 verifier。保存本地 secrets 的安全备份；丢失审计密钥会使旧加密事件不可读，丢失相册数据密钥且没有原片备份也会使照片无法恢复。

旧 v1 密文若曾上传到 GitHub 历史或被访客下载，仍可按旧密码机制处理；迁移与改口令**不能撤回历史副本**。成功获准查看的访客也能保存照片。v3 为新发布版本提供服务端验证与在线尝试限制，不会改变过去已经公开的文件。

## English reference

Use Node.js 22+. The frontend stays on GitHub Pages; Cloudflare Workers + D1 provide authorization, IP cooldowns, encrypted audit details and short-lived administrator sessions. On 2026-09-23, initial service deployment and live integration checks completed on confirmed Free ($0), without purchase or upgrade. The initial 100,000-iteration PBKDF2 version `40206f15-1128-47e5-b53b-efd52bbcd8f8` measured 26.260ms P99 CPU, above Free's 10ms budget. The authorized hybrid verifier and paginated audit API are deployed as `18607b41-6c83-4130-bad1-da2411d53c5d`, with all credentials at 30,000 PBKDF2 iterations. The final window beginning 07:54:38 UTC contained 33 single-request GraphQL samples and zero errors: P50 3.460ms, P99/maximum 11.731ms. The first admin request took 11.731ms and one Life unlock took 10.578ms. The all-requests-under-10ms target remains unmet despite functional checks passing. Passwords, photos and all existing data keys were preserved. No Git/Pages publication or audit reset occurred; synthetic test records remain.

For a fresh setup, authenticate Wrangler, create the D1 database, configure its ID, apply remote migrations, deploy compatible Worker code, prepare local secrets with `npm run gallery:admin:prepare`, and upload the Secret. Only after the service and its random keys are ready, run `npm run gallery:managed`. Initial service setup, managed migration and verifier-v2 activation are complete for this deployment. The Pages workflow defaults to the deployed Worker URL; `GALLERY_API_URL` is an optional repository-variable override. Local production configuration is prepared in ignored `.env.production.local`, while development keeps local port 8787. The similarly named `gallery:service:migrate` command applies **local** D1 migrations only.

v3 private ciphertext uses independent random server-held keys; public albums/covers remain v2 with intentionally public keys. Migration preserves prepared image bytes and privately backs up legacy ciphertext. Future publishing stays managed and fails if its server key is unavailable. Original photographs, credentials, verifier files and the plaintext dashboard stay in ignored local storage; only encrypted assets and public descriptors are published.

Only verified wrong shared album phrases are retained, bounded to 256 Unicode code points, inside encrypted D1 details. Correct, blocked, admin and reset inputs are never retained. IP coordinates are network estimates rounded to one decimal, not GPS. Retention is 90 days. The updated API returns 50 details per request; the panel automatically loads up to 2,000, with full-range SQL aggregates in the first response. Failures 1–5 have no delay; failure 6 adds 1 minute, then 5/10/20/30/60 minutes, with later failures at 60. A 24-hour failure-free interval resets the count; success does not. Audit reset preserves cooldowns.

The hidden footer punctuation is only a UI shortcut. Admin sessions expire after 15 minutes in memory. New verifier v2 applies PBKDF2-HMAC-SHA256 with a 16-byte salt and 32-byte output, then HMAC-SHA256 using a separate random 32-byte server-only pepper. The final tag binds protocol, credential context, salt, iterations and derived key; only that tag is stored. Preparation defaults to 30,000 iterations, configurable from 30,000–100,000 with `GALLERY_PASSWORD_ITERATIONS`. If both pepper and verifier leak, offline guesses still incur the configured PBKDF2 cost, although the default is lower than the former 100,000. Deploy compatible code before preparing and uploading new Secret values. Preparation validates existing secrets, preserves AES/audit/IP/panel keys and existing pepper, and atomically replaces each mode-0600 file. No photo re-encryption is needed. Current deployment and measurements are complete. The measured sample had no resource failure, but platform tolerance is not a guarantee and larger audit loads still need separate measurement. No subscription was purchased. Previously uploaded v1 ciphertext and saved photographs cannot be revoked.
