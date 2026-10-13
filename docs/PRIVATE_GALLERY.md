# 相册发布与本地照片维护 / Gallery publishing

所有 Gallery 原片都保存在本地 `.private/gallery/`，包括公开的 Photography 与 Aesthetic。网站发布的是去除元数据后的展示图片密文，而非相机原文件。使用 Node.js 22+。Life 与 Lover 在迁移为 managed v3 后，通过 Cloudflare Worker 验证口令并取得随机解密密钥；Photography、Aesthetic 和所有指定封面保持 v2，使用公开查看密钥自动解密。旧 v1 仅用于尚未激活服务前的兼容与迁移。

**2026-09-23 已完成 Cloudflare Worker、APAC D1、远程 migration 0001、Secret 上传与线上后台联调。** 初版 100,000 次 PBKDF2 认证实测 CPU P99 为 26.260ms，超过 Free 的 10ms 预算。所有者已授权保留 PBKDF2，并在 30,000–100,000 次范围调整；混合 verifier 与审计分页已部署并激活，版本为 `18607b41-6c83-4130-bad1-da2411d53c5d`，全部凭据使用 30,000 次 PBKDF2；最终 33 个请求样本无错误，P50 为 3.460ms，P99/最高为 11.731ms，两次请求超过 10ms。**功能验证通过，但仍未达到所有请求低于 10ms 的要求。** 口令、照片及所有既有数据密钥保持不变。当前套餐仍为 Free（$0），没有购买或升级。未执行审计重置、Git 推送或 Pages 部署，合成测试记录保留。完整状态见 [管理服务部署说明](GALLERY_ADMIN.md)。Pages 工作流默认使用已部署地址，`GALLERY_API_URL` 仅为可选覆盖项；后台验证通过不代表新版公开前端已经上线。

公开相册与封面本来就允许所有访客查看，因此公开查看密钥也会随网站发布。访客可以保存已显示的照片；这种加密不能为公开相册提供保密性。它确保原文件、原文件名及 EXIF/GPS/设备信息不作为公开图片发布。Life 的封面独立生成、独立加密，不暴露其受保护相册的密钥或私密图注。

## 1. 本地目录与已导入照片

```text
.private/gallery/                  # 整个目录由 Git 忽略，不部署
  keys.json                        # Life / Lover 口令源值，仅在本地
  publish.json                     # 发布方式、封面选择、图片参数
  import-receipt.json               # 首次导入的文件校验记录
  life/
    originals/                     # 139 张原片，字节保持不变
    photos.json                    # 照片日期、顺序、文字与分组
  photography/
    originals/                     # 46 张原片，保留原名
    photos/                        # 类别名_序号的工作副本
    rename-map.json                # 原名与新名对应关系
    photos.json
  aesthetic/
    originals/                     # 01–05 与 ZJ-1/2/3，共 8 张
    photos.json
  lover/
    photos.json                    # 暂无照片；以后可添加 originals/
```

这 176 张原片已从最初提供的 `dist/gallery/` 备份到本地目录，并核对文件校验值。**今后不要把原片放在 `dist/`：它是构建时会被清理的输出目录。** `public/`、`images/` 和 `docs/` 中的文件可能被复制到网站，也不能用来保存 Gallery 原片。

`.gitignore` 只排除提交，不代替备份。请另行备份整个 `.private/gallery/`；从 GitHub 克隆只能恢复密文和网站代码，不能恢复原片、源清单及密码。如果文件曾经进入 Git 历史，后来添加 ignore 不会移除那些旧记录。

managed 模式还需要备份 `.private/analytics/`：其中包含随机相册数据密钥、服务 verifier、审计加密密钥和管理面板明文。它们不能提交到 GitHub；只有生成的加密面板 `public/_data/panel.enc` 可以公开。完整发布需要本地源照片与这些服务密钥，不能仅依靠远程仓库。

## 2. 发布配置

`.private/gallery/publish.json` 定义本地需要处理的相册。当前配置结构如下，不包含密码：

```json
{
  "defaults": {
    "fullMaxDimension": 2560,
    "thumbnailMaxDimension": 960,
    "fullLossless": true,
    "thumbnailQuality": 94
  },
  "albums": {
    "life": {
      "access": "password",
      "coverPhotoId": "birth-2026"
    },
    "photography": {
      "access": "public",
      "coverPhotoId": "everyday-warmth_02"
    },
    "aesthetic": {
      "access": "public",
      "coverPhotoId": "01"
    }
  }
}
```

- `access: "password"`：声明这是受保护相册。未迁移时使用本地 `keys.json` 的旧 v1 流程；一旦当前 manifest 或生成描述标记为 managed，脚本从本地服务 secrets 读取独立随机数据密钥并继续输出 v3，不再使用口令派生图片密钥。真实凭据不写入源码或文档。
- `access: "public"`：自动生成独立的随机查看密钥，随公开网站发布，无需填写密码。
- `coverPhotoId`：必须对应本相册 `photos.json` 内的一个 `id`。Photography 的 `everyday-warmth_02` 对应原始 `pic-13`。
- `delivery`：可放在单个相册内，覆盖部分默认图片参数，例如 `"delivery": { "fullMaxDimension": 3200 }`。尺寸范围为 64–8192px，缩略图质量范围为 70–100；更多像素会增加解密后的图片大小和加载成本。

不带相册参数的加密命令只处理 `publish.json` 中列出的相册。当前 Lover 没有照片，保持已有密文不变。需要让 Lover 参与一键更新时，把 `"lover": { "access": "password" }` 加入 `albums`，如需封面再添加 `coverPhotoId`。只要 `publish.json` 存在，显式执行 `npm run gallery:encrypt -- lover` 也会使用默认去元数据流程。

脚本为兼容早期私密相册保留了未配置 `publish.json` 时的旧模式，该模式会加密原文件字节。日常维护时应保留 `publish.json`，并将需要统一管理的相册显式列在其中，以使用本页说明的方向校正、去元数据与展示尺寸处理。

## 3. 新增照片与双语文字

把照片放入对应相册的 `originals/`，然后编辑该相册的 `photos.json` 数组。每项必须有唯一 `id`、相对路径 `src` 和双语 `alt`。尺寸从处理后的图片自动读取，无需手填。

```json
[
  {
    "id": "2026-09-23-01",
    "src": "originals/your-photo.jpg",
    "alt": {
      "en": "Describe the actual photograph.",
      "zh": "描述照片的实际内容。"
    },
    "caption": {
      "en": "An optional caption.",
      "zh": "可选图注。"
    },
    "date": "2026-09-23",
    "section": "timeline",
    "sequence": 1
  }
]
```

这是字段示例，不是真实经历。`src` 相对于 `.private/gallery/<slug>/`；必须指向相册目录内的文件，不允许绝对路径、跳出目录或链接到目录外的原片。支持 JPEG、PNG、WebP、GIF、AVIF；本项目当前导入的是静态照片。记录中可选字段如下：

| 字段 | 用途 |
| --- | --- |
| `date` | 已知完整日期，格式 `YYYY-MM-DD`，供 Life 时间线分组 |
| `year` | 生日模块年份；不需要虚构月份或日期 |
| `section` | 分组 ID；必须与相册配置一致 |
| `sequence` | 同组显示顺序，使用递增整数 |
| `caption` | 双语图注；没有时省略 |

原片中的 EXIF 等元数据不会被自动公开。日期和文字只有你明确写入照片清单才会进入展示数据；Life 的这些数据仍位于密码保护的加密清单中。不要根据不确定的画面推断人物、地点或拍摄时间。

### Life：时间线和生日

普通照片设置 `section: "timeline"` 和 `date`。同一天的照片横向排列，使用 `sequence` 排序。现有 136 张日期照片对应 63 个日期节点，日期来自提供的文件名；相册支持年份选择。横向超出范围时可触摸滑动，也可操作悬停或聚焦时出现的半透明拖动条。

生日照片放在底部独立模块，以大图完整呈现。例如下一年的记录可以是：

```json
{
  "id": "birth-2027",
  "src": "originals/birth-2027.jpg",
  "alt": { "en": "Birthday memories, 2027", "zh": "2027 年的生日时光" },
  "year": 2027,
  "section": "birthdays",
  "sequence": 1
}
```

这只说明字段格式；不要在没有实际照片时添加该条。现有生日模块为 2026、2025、2024 三张，封面为 `birth-2026`。

### Photography：分类与改名

保留 `originals/` 原名，供核对与备份。在 `photos/` 创建“分类 ID_两位序号”的工作副本；文件扩展名沿用实际格式，例如 `city-frames_16.jpg`。`id` 使用不带扩展名的相同名称，`section` 填分类 ID，`sequence` 填显示序号。维护本地 `rename-map.json`，便于查找原片。

| 分组 ID | English | 中文 | 当前数量 |
| --- | --- | --- | --- |
| `light-and-sky` | Light & Sky | 天光与水色 | 9 |
| `botanical-notes` | Botanical Notes | 花叶之间 | 6 |
| `after-the-rain` | After the Rain | 雨后的片刻 | 4 |
| `city-frames` | City Frames | 城市取景 | 15 |
| `everyday-warmth` | Everyday Warmth | 日常暖意 | 12 |

分类依据画面内容，不表示拍摄时间顺序。标题、双语说明及模块顺序在 `src/data/gallery.ts` 的 `sections` 中维护，新增分类时同步添加一个 section。

### Aesthetic：完整画面与演唱会

01–05 使用 `section: "prints"`，`sequence` 分别为 1–5。页面按此顺序保留完整画面比例，不裁剪图片。ZJ-1/2/3 使用 `section: "concert"`，`sequence` 为 1–3，在独立演唱会模块中展示。原片均未超过当前 2560px 大图限制，因此不降低其原生像素尺寸。封面取 `01`，相册内完整画面的布局与卡片封面的取景分开处理。

## 4. 图片处理与质量

本地加密前先用 Sharp 解码并校正方向，按原比例缩放，然后生成展示文件。输出不保留 EXIF、GPS、设备信息、原文件名和嵌入配置文件；原片本身不修改。

| 版本 | 当前处理 | 加载方式 |
| --- | --- | --- |
| 展示大图 | 最长边 ≤2560px，不放大，WebP 无损编码 | Lightbox 及大图模块按需解密 |
| 缩略图 | 最长边 ≤960px，WebP quality 94 | 接近视口后加载 |
| 公开封面 | 保留 ≤1280px 无损版本；卡片显示 ≤960px、quality 94 的高清缩略版本，独立密钥加密 | 卡片按需加载 |

缩放不会裁切构图。“无损编码”指处理后像素无额外 WebP 编码损失，不表示大尺寸相机原片仍保留全部像素；比如最长边 7008px 的原片会缩小到 2560px。缩略图使用高质量有损编码。所有原片字节在本地备份中保留。可以按相册提高 `fullMaxDimension`，但不建议为普通浏览直接加载几十 MB 的相机原文件。

## 5. 加密、检查与上传

在项目根目录运行：

```sh
npm run gallery:encrypt                 # 更新 publish.json 中列出的相册
npm run gallery:encrypt -- photography  # 或只更新一个相册及其封面
npm run build
npm run check:build
```

每次加密都会生成新的随机文件名和 IV；只有尚未迁移的旧 v1 相册生成新的 PBKDF2 盐。managed v3 相册复用已配置的随机服务数据密钥，密钥缺失时直接失败，不会降级。只更新需要修改的相册，可减少无关密文变化。生成位置：

```text
public/gallery-encrypted/
  life/                      # manifest.json 与随机文件名 .enc
  photography/
  aesthetic/
  lover/
  covers/
    life/
    photography/
    aesthetic/
src/data/gallery-private.generated.json
src/data/gallery-public.generated.json
```

一起提交 `public/gallery-encrypted/` 和两个 `*.generated.json` 文件；它们需要匹配。不要手改随机文件名、密文清单或生成的查看密钥。照片新增、删除、重新排序、改图注、改封面后都需要重新加密对应相册。只修改 `src/data/gallery.ts` 的公开模块文案时则无需加密。

`npm run build` **不运行加密脚本**，只把已生成密文复制到部署输出。GitHub Actions 不需要原片、本地密码文件或私密密钥 Secret；工作流默认指向已部署 Worker，公开仓库变量 `GALLERY_API_URL` 可选，用于覆盖该地址。`npm run check:build` 检查实际构建产物、manifest 模式和数量，并拒绝 Gallery 发布目录中的明文图片；它不能代替检查仓库其他目录是否误放原片。

部署前可运行 `npm run lint`、`npm run test`，交互改动再运行 `npm run test:e2e`。`npm run test:static` 在构建后验证无 SPA 回退的静态路径。实际检查结果由 [验证记录](VERIFICATION.md) 单独记录，不由本页假定。

## 6. 新增相册

1. 在 `.private/gallery/<slug>/` 建立 `originals/` 和 `photos.json`。slug 使用小写英文字母、数字与短横线。
2. 在 `publish.json` 的 `albums` 添加访问方式和可选封面。密码相册另在本地 `keys.json` 添加对应 slug 的密码值。
3. 运行 `npm run gallery:encrypt -- <slug>`。
4. 在 `src/data/gallery.ts` 添加双语相册信息，引用生成数据。示例为公开相册：

```ts
{
  slug: 'example-album',
  title: { en: 'Your album', zh: '你的相册' },
  description: { en: 'Your description.', zh: '你的说明。' },
  encrypted: publicAlbums.albums['example-album'],
  encryptedCover: publicAlbums.covers['example-album'],
  presentation: 'curated',
  sections: [
    {
      id: 'collection',
      title: { en: 'Collection', zh: '收藏' },
      layout: 'grid',
    },
  ],
  photos: [],
}
```

其中 `publicAlbums` 指导入 `gallery-public.generated.json` 后的变量名。源照片的 `section` 应为 `collection`。密码相册用 `private: { ...privateAlbums['example-album'], hint: { en: 'Your hint', zh: '你的提示' } }` 代替 `encrypted`；不要同时配置两种访问方式。`encryptedCover` 可选，未指定时保留设计好的空封面。

5. 新的受保护相册先执行 `gallery:admin:prepare`，更新 Worker 的 `ALBUM_SLUGS`、Secret 及部署，再执行 `npm run gallery:managed -- <slug>`，使随机服务密钥与 v3 密文对应。具体顺序见 [管理服务部署说明](GALLERY_ADMIN.md)。
6. 运行构建，生成新相册的实际 HTML 路由与 sitemap 条目。新增照片只修改本地数据；新增分组或相册只修改数据配置，无需修改页面组件。

## 7. 修改密码与浏览器行为

所有者已授权保留 PBKDF2 的混合校验升级。先部署兼容旧格式和新混合 verifier 的 Worker，再 prepare 和上传新 Secret；不能把新格式 Secret 先交给线上旧代码。当前部署进度见 [管理服务说明](GALLERY_ADMIN.md)。

`keys.json` 的字段名是相册 slug，值是共享口令。Life 与 Lover 可以使用不同值。managed v3 模式下，在本地修改对应值，确认 Worker 已部署兼容代码，再运行 `npm run gallery:admin:prepare` 并通过 Cloudflare Secret 上传生成的 `worker-secrets.json`。新版 verifier v2 保留 PBKDF2-HMAC-SHA256，再以秘密 pepper 计算后置 HMAC-SHA256；默认 30,000 次，可在 prepare 时通过 `GALLERY_PASSWORD_ITERATIONS` 指定 30,000–100,000 范围内的整数。prepare 保留全部随机 AES、审计、IP、面板密钥及已有 pepper，改口令或升级 verifier 无需重加密 v3 照片。已有 secrets 先校验，再逐文件以 `0600` 权限原子替换。不要把真实口令写进命令行、截图、代码、README 或测试。

输入框没有预填口令。v3 输入通过 HTTPS 发送到配置好的 Worker 进行验证，成功后返回随机查看密钥；浏览器不保存口令到 localStorage 或 cookie。离开受保护相册后会重新锁定，解密密钥只留在页面内存中。服务未配置或不可用时，v3 不会降级为本地密码解密。

服务只记录**经过验证为错误的共享相册短语**，最多 256 个 Unicode 码点，超出时截断并保留标记，详情在 D1 中 AES 加密保存；成功、冷却拦截、管理员和重置输入均不保存。前五次错误无冷却，随后为 1/5/10/20/30/60 分钟，之后保持 60 分钟；24 小时无失败才重置，成功不清零。记录保留 90 天；IP 位置保留一位小数，是网络估计而非 GPS。详见 [审计范围与管理会话](GALLERY_ADMIN.md)。

口令更换无法使访客已保存的照片或旧密文副本消失。若旧 v1 密文曾上传到 Git 历史或被下载，它仍允许旧的离线密码猜测；迁移不能撤回这些历史副本。v3 当前密文使用随机服务密钥，不能由公开 PBKDF2 参数和口令离线派生。获准查看的访客仍能保存照片。

## 8. 加密实现

| Manifest | 访问方式 | 密钥来源 |
| --- | --- | --- |
| v1：旧私密相册 | 仅兼容未激活服务的旧数据 | 浏览器 PBKDF2-SHA-256，600,000 次，128-bit salt；需要迁移 |
| v2：公开相册与封面 | 自动打开 | 独立随机 AES-256-GCM 密钥，公开 `viewKey` |
| v3：managed 私密相册 | Worker 验证口令与 IP 冷却后授权 | 本地/服务端持有的独立随机 AES-256-GCM 密钥，不发布密码派生参数 |

每份资源使用独立 96-bit IV 并验证 GCM 标签；清单、缩略图与大图均加密。新版服务 verifier v2 的算法为 `PBKDF2-HMAC-SHA256+HMAC-SHA256`：随机 16 字节 salt 经配置次数的 PBKDF2 派生 32 字节，再用专用随机 32 字节 `passwordPepper` 对协议标签、凭据 context、salt、迭代次数及派生结果计算 HMAC。只保存最终 HMAC，使用 Web Crypto 验证。verifier 和 pepper 仅留在本地忽略文件及服务 Secret，不用于派生照片密钥。服务保留旧 100,000 次 PBKDF2 verifier 兼容，供先代码、后 Secret 的切换。verifier v2 与公开照片 manifest v2 是不同概念；公开封面永远不复用私密相册密钥。

若只泄露 verifier，缺少 pepper 就不能单独验证口令猜测；两者同时泄露时，每次猜测仍需配置次数的 PBKDF2。默认 30,000 次的离线计算成本低于原 100,000 次，因此仍需保护所有秘密并保留服务端 IP 冷却。新版已部署并激活，但最终 33 个样本中仍有两次 CPU 超过 10ms，P99/最高为 11.731ms。样本无错误或资源失败不意味着未来保证，不能宣称全部达标；大规模审计负载需独立测量。详见 [认证与部署说明](GALLERY_ADMIN.md)。

`npm run gallery:managed` 默认迁移 Life 与 Lover：先把原 v1 密文备份到 `.private/analytics/legacy-encrypted/` 并校验，再原样重新加密已有展示文件字节，不重新采样。重复执行时验证当前密钥和资源后保持不变。只有在服务和 Secret 已准备好之后，才执行迁移并部署对应前端。

`manifest.json` 的外层包含版本、slug、数量和必要加密参数，不包含明文照片数组。照片 ID、分组、日期、文字、尺寸及密文文件映射位于加密清单内。公开相册的清单当然也可使用公开查看密钥解密。浏览器只按需解密图片，使用临时 Blob URL 显示，离开页面或图片卸载时释放。

## English maintenance summary

Use Node.js 22+. All Gallery originals, including public collections, stay under the ignored `.private/gallery/` directory. Never add source photographs to `dist/` or public asset directories. Maintain each album's `photos.json` and the local `publish.json`, then run `npm run gallery:encrypt -- <slug>`. Commit `public/gallery-encrypted/`, `src/data/gallery-private.generated.json`, and `src/data/gallery-public.generated.json` together. Builds use generated ciphertext and default to the deployed Worker URL, with `GALLERY_API_URL` as an optional override; they do not need passwords or server data keys.

Photo records support bilingual `alt` / optional `caption`, `date`, `year`, `section`, and `sequence`. Life uses `timeline` and `birthdays`; Photography uses the five category IDs above and renamed `<category>_<NN>` working files; Aesthetic uses `prints` for 01–05 and `concert` for ZJ-1/2/3. Album labels and section layouts live in `src/data/gallery.ts`. Set `coverPhotoId` in the local publish configuration to change a cover, then re-encrypt that album.

Configured publishing strips embedded source metadata, corrects orientation, and produces proportionally resized WebP derivatives: at most 2560px lossless full views, 960px quality-94 thumbnails, and 1280px public covers. Originals are untouched locally; lossless encoding does not undo resolution reduction. The current Aesthetic files fit within the full-view limit and retain native dimensions. Keep `publish.json` in place: its defaults also apply to an explicitly named album absent from its list. Only the legacy mode with no publish configuration preserves original bytes for compatibility.

Life and Lover obtain independent random v3 data keys after Worker authorization. Public albums/covers stay v2 with intentionally public keys; visible photos remain savable. Old v1 ciphertext cannot be revoked and still permits its original offline guesses. Initial Worker/D1 deployment and live integration passed on 2026-09-23, but its 100,000-iteration PBKDF2 measured 26.260ms P99 CPU, above Free's 10ms budget. The owner has authorized retaining PBKDF2 with 30,000–100,000 iterations. New verifier v2 derives 32 bytes using PBKDF2, then stores only a context-bound HMAC under a separate secret pepper; the default is 30,000. If both secrets leak, PBKDF2's configured work remains, with a lower default cost than before. Compatible code must deploy before preparation and Secret upload; existing data keys are preserved and no photos need re-encryption. The new protocol is deployed and active. Final sampling found 33 requests, zero errors, P50 3.460ms and P99/maximum 11.731ms; two requests exceeded 10ms. Functionality passes, but the all-requests CPU target remains unmet. No resource failure was observed, which is not a future guarantee. Passwords, photos and all existing data keys were preserved. The account remains Free ($0), with no purchase, Git/Pages publication or audit reset. Test records remain. See [GALLERY_ADMIN.md](GALLERY_ADMIN.md) and keep separate backups of local originals, configuration and service keys.
