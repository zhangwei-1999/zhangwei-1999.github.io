# 张蔚 · 个人学术主页

[English](README_en.md) · [内容迁移记录](docs/CONTENT_MIGRATION.md)

基于 React、TypeScript 与 Vite 构建的中英双语学术主页。视觉采用浅蓝毛玻璃、缓慢流动的水面光影与克制的淡紫色交互；Gallery 使用更温暖的奶油色调。

网站包含 Home、Publications、News、Awards、Gallery 和相册详情页。构建时为每条路由生成真实 HTML 文件，适合 GitHub Pages，直接访问或刷新子页面无需服务端重写或 Hash 路由。个人内容统一维护在 `src/data/`，无需修改组件。

## 本地运行

需要 **Node.js 22 或更高版本**及 npm。

```sh
npm install
npm run dev
```

打开 Vite 输出的本地地址，通常为 `http://127.0.0.1:5173`。不要直接用普通 HTTP 服务运行仓库根目录：源码包含 TypeScript，需要由 Vite 处理。

```sh
npm run lint
npm run test
npm run build
npm run preview
```

- `lint`：ESLint 代码检查。
- `test`：单元测试，包括新闻日期与日历数据逻辑。
- `build`：TypeScript 检查、Vite 生产构建、静态页面预渲染，结果写入 `dist/`。
- `preview`：预览生产构建，通常为 `http://127.0.0.1:4173`。
- `npm run typecheck`：单独执行 TypeScript 检查。
- `npm run test:e2e`：Playwright 浏览器检查。首次运行前安装 Google Chrome，或执行 `npx playwright install chromium`。

## 目录结构

```text
src/
  data/                 # 后续主要修改这里
    profile.ts          # 个人信息、教育经历、链接
    news.ts             # 新闻与日历的共同数据源
    publications.ts     # 全部论文与置顶标记
    awards.ts           # 奖项
    gallery.ts          # 相册、分类标题与展示方式
    gallery-private.generated.json # 自动生成的私密相册数量与密文清单路径
    gallery-public.generated.json  # 自动生成的公开相册/封面查看密钥与路径
    visitors.ts         # 原有访客地图统计 ID 与配色
    quotes.ts           # 英文 Quote
    appearance.ts       # 水波频率、尺寸、透明度、指针折射幅度
  components/           # 导航、卡片、日历、Quote、Lightbox、页脚
  pages/                # 五个主页面与相册视图
  lib/                  # 路由、语言、日历、水面模拟、鼠标交互
  styles/               # 设计变量、响应式布局与动效
  types.ts              # 所有内容的数据类型
public/                  # 公开资源与 gallery-encrypted/ 照片密文
.private/gallery/        # Git 忽略的密码、发布配置、清单与所有 Gallery 原片
.private/analytics/      # Git 忽略的服务凭据、随机密钥与管理面板明文
services/gallery-worker/ # 独立的 Cloudflare Workers + D1 授权与审计服务
images/                  # 保留的头像与学校标志
docs/                   # 保留的论文封面、BibTeX、迁移记录
scripts/prerender.tsx    # 生成静态 HTML、sitemap、robots 并复制旧资源
scripts/encrypt-gallery.ts # 仅在本地运行的相册图片处理与加密脚本
.github/workflows/      # GitHub Pages 部署与手动 Scholar 爬虫
academic.md             # 原始内容存档，不再驱动页面
```

`README.md` 链接至英文说明。原有有效内容已迁移：18 条 News、6 篇论文、11 条按年度拆分的奖项记录、3 条教育经历，以及原联系方式和资源链接。主要内容的数据类型定义在 `src/types.ts`。

## 修改个人信息与中英文

编辑 `src/data/profile.ts`，修改姓名、职位、机构、简介、SEO 简介 `tagline`、研究方向、学术链接、教育经历、头像、站点 URL、仓库 URL 和页脚更新日期 `lastUpdated`。`tagline` 用于页面元信息，不显示在首页 Hero 中。更新日期使用真实维护日期，格式为 `YYYY-MM-DD`。

首页照片使用 `images/myphoto.webp`，提供 `myphoto-small.webp` 与 `myphoto-mobile.webp` 响应式版本，原始 `images/myphoto.jpg` 保留不变。三个 WebP 按原比例缩放后使用无损编码，显示完整构图，不裁切、不拉伸。五个学术链接通过 `icon` 字段选择对应的本地 SVG Logo，无需外部图标服务。

中英文内容统一使用：

```ts
{ en: 'English text', zh: '中文文本' }
```

新增内容时请同时填写两个字段。首次访问默认英文；语言切换覆盖页面内容，并通过 localStorage 保留选择。论文标题、作者、Venue 和资源标签允许保留原文；有中文标题时可以添加可选的 `titleZh`。Quote 正文按设计始终使用英文。

## 增加 News

在 `src/data/news.ts` 导出的 `news` 数组中添加一项：

```ts
{
  id: 'example-update',                    // 唯一 ID；请替换示例内容
  date: '2026-09-15',
  datePrecision: 'day',
  emoji: '📢',
  content: { en: 'Your update.', zh: '你的动态。' },
  category: 'announcement',
  // link: 'https://your-actual-link',      // 可选；没有链接就省略
},
```

新闻按日期排序。首页只显示最新 8 条，News 页面显示全部。日历自动读取同一数组，支持同日多条新闻和年份切换，无需单独维护。

**保留原始日期精度：**旧新闻只有月份，因此保留 `date: '2026-02'` 与 `datePrecision: 'month'`。默认以透明年度时间带呈现：十二个细月份刻度，每条动态对应一颗玻璃光点，有动态的月份上方显示总数。它汇总全部新闻，包括有完整日期的条目；单月超过十二条时显示十二颗光点及剩余数量。小屏幕分为上下两个半年。悬停、键盘聚焦或点击有新闻的月份，可在浮层中查看当月全部内容。所选年份包含完整日期时才提供“按日”视图，每日热力格只包含已知具体日期的新闻。请不要为了给日历上色，把未知日期统一改成每月 1 日。

## 增加论文与设置置顶

在 `src/data/publications.ts` 中增加对象。以下只是字段示例，并非真实论文：

```ts
{
  id: 'example-paper',
  title: 'Your actual paper title',
  authors: 'First Author, Wei Zhang, Last Author†',
  venue: 'Actual venue',
  year: 2026,
  category: 'journal',                     // conference | journal | preprint
  cover: 'docs/example-paper/teaser.webp',
  featured: false,
  description: { en: 'A factual summary.', zh: '准确的研究简介。' },
  badges: [],                             // 可选
  links: [
    { label: 'Paper', url: 'https://your-actual-paper-url' },
    { label: 'BibTeX', url: 'docs/example-paper/bibtex.txt' },
  ],
},
```

相应文件放在 `docs/example-paper/`。只填写实际存在的链接；`links` 也可添加 Project、Code、Video、Slides 等资源。本地路径相对于网站根目录，不包含 `public/` 或仓库名前缀。

把 **`featured` 改为 `true`** 即可在首页置顶。置顶数量不限，不会自动截取最新论文。初始明确选定 TEA、EL 与 ANM 三篇；可以随时调整。完整论文页按年份分组，并提供类别筛选；可扩展其他类别。

作者标记保留：`*` 表示共同贡献，`†` 表示通讯作者。已有 SCI 分区和影响因子是原文中的历史值，并非重新核验的最新指标。

## 增加 Award

编辑 `src/data/awards.ts`：

```ts
{
  id: 'example-award',
  year: 2026,
  title: { en: 'Your actual award', zh: '真实奖项名称' },
  organization: { en: 'Awarding organization', zh: '颁奖单位' }, // 可选
  description: { en: 'Optional context.', zh: '可选说明。' },   // 可选
  // link: 'https://your-actual-award-url',                    // 可选
},
```

时间线自动按年度排列。此次迁移没有虚构新奖项。原文中的 **GMU Academic Scholarship** 缩写尚需本人确认后再展开；长篇竞赛名称的中文翻译也可以按证书上的正式名称修订。

## 增加 Gallery Album / Photo

Gallery 有四个相册，所有卡片始终显示照片数量。Life 和 Lover 在点击卡片后才要求解锁，封面无需密码即可查看。桌面下 Lover 位于其余三个相册下方，独占整行。

| 相册 | 当前照片 | 呈现方式 | 公开封面 |
| --- | --- | --- | --- |
| Life | 139 张 | 136 张按 63 个日期串联，底部另有 3 张生日大图 | `birth-2026` |
| Photography | 46 张 | 按画面内容分为五组 | `everyday-warmth_02`，对应原 `pic-13` |
| Aesthetic | 8 张 | 上方完整展示 01–05，下方独立展示 ZJ-1/2/3 演唱会照片 | `01` |
| Lover | 尚未添加 | 私密相册，卡片横跨整行 | 尚未指定 |

Life 支持按年份查看，每个日期的照片横向排列；超出范围时可触摸滑动，悬停或键盘聚焦会显示细小的半透明拖动条。生日照片在底部独立模块中以大图呈现。Photography 分为“天光与水色”“花叶之间”“雨后的片刻”“城市取景”“日常暖意”。照片接近视口后才加载；Lightbox 支持上一张/下一张、键盘左右键、ESC、点击背景关闭与手机滑动。

### 照片放在哪里

**所有 Gallery 原片，包括公开相册，都只放在 `.private/gallery/` 内。不要放在 `dist/`、`public/gallery/`、`images/` 或 `docs/`。** `dist/` 是构建时会被清理的输出目录。此次导入的 176 张原片已保存在各相册的 `originals/` 中，本地导入记录保存文件校验值。Photography 的分类重命名副本位于 `photography/photos/`，`rename-map.json` 记录新旧文件名对应关系。

网站只发布加密后的展示图、缩略图及照片清单。生成图片时移除 EXIF、GPS、设备等嵌入信息。启用 managed 模式后，Life 和 Lover 通过服务端验证取得随机解密密钥，不再由浏览器从口令派生图片密钥；Photography、Aesthetic 与公开封面使用公开查看密钥，进入页面后自动解密。公开查看密钥本身属于网站的一部分，**访客仍然可以保存已公开展示的照片**。这种方式确保发布目录中没有可直接打开的原始图片文件，但不会把公开相册变成私密相册；原始文件及其嵌入元数据留在本地。

### 增加和排列照片

1. 将原片放入 `.private/gallery/<相册 slug>/originals/`。
2. 在该相册本地的 `photos.json` 中添加记录。`src` 相对于相册目录，尺寸由脚本自动读取。
3. 本地执行加密，再构建并检查网站。

Life 的字段示例；请替换为真实照片与日期：

```json
{
  "id": "2026-09-23-01",
  "src": "originals/your-photo.jpg",
  "alt": { "en": "Describe the actual photograph.", "zh": "描述照片的实际内容。" },
  "date": "2026-09-23",
  "section": "timeline",
  "sequence": 1
}
```

生日照片使用 `section: "birthdays"` 和 `year: 2027`；`sequence` 控制同组顺序。Photography 的 `section` 填分类 ID，工作副本文件名与照片 ID 使用“类别名_序号”，例如 `light-and-sky_10.jpg` / `light-and-sky_10`。已有分类 ID 为 `light-and-sky`、`botanical-notes`、`after-the-rain`、`city-frames`、`everyday-warmth`。Aesthetic 的编号图片使用 `section: "prints"`，演唱会使用 `section: "concert"`，分别填写 `sequence`。可选的 `caption` 与 `alt` 一样使用 `{ en, zh }`。分类标题和说明在 `src/data/gallery.ts` 修改；日期、顺序及单张照片文本在本地照片清单修改。

```sh
npm run gallery:encrypt -- photography  # 仅更新这个相册及其封面
npm run build
npm run check:build
```

不带 slug 的 `npm run gallery:encrypt` 只更新 `.private/gallery/publish.json` 列出的相册，目前为 Life、Photography 和 Aesthetic。Lover 在显式指定或加入配置前保持不变。需要让 Lover 参与一键更新或配置封面时，在 `publish.json` 中加入 `access: "password"`。只要 `publish.json` 存在，单独执行 `-- lover` 也会应用默认的去元数据处理。

加密后将以下生成文件一并提交：

- `public/gallery-encrypted/`
- `src/data/gallery-private.generated.json`
- `src/data/gallery-public.generated.json`

不要手动修改生成文件。相册口令源值保存在忽略提交的 `.private/gallery/keys.json`；managed verifier 与随机数据密钥保存在 `.private/analytics/` 和 Cloudflare Secret 绑定中。GitHub Actions 使用已提交密文并默认连接已部署 Worker，公开的 `GALLERY_API_URL` 仓库变量可选，用于覆盖地址；**Pages build 不负责加密，不需要私密口令或数据密钥 Secret**。请同时备份 `.private/gallery/` 与 `.private/analytics/`，GitHub 无法恢复原片、源清单及私密服务密钥。迁移到 v3 后，`gallery:encrypt` 会保留 managed 模式，服务密钥缺失时直接失败。

### 更换封面、画质与新增相册

在 `.private/gallery/publish.json` 将 `coverPhotoId` 改为已有照片 ID，再重新加密该相册。每张封面使用独立的公开查看密钥；Life 的封面同样如此，不会公开受保护相册的密钥或私密图注。

目前展示大图经过方向校正、等比例缩小至最长边不超过 2560px，再使用无损 WebP 编码，不放大原片。缩略图最长边 960px、质量 94，公开封面最长边不超过 1280px。相册入口显示独立封面的 960px 高清缩略版本，减少首屏流量。Aesthetic 原片均在大图限制内，因此保留原生像素尺寸。“无损”指处理后像素的 WebP 编码方式；较大相机原片缩小时仍会减少像素数量。本地原始文件保持不变。需要调整时，修改 `publish.json` 的默认值或单个相册的 `delivery`。

新增相册：建立本地目录和 `photos.json`，在 `publish.json` 中加入 `access` 与可选 `coverPhotoId`，运行加密，然后在 `src/data/gallery.ts` 添加双语卡片及 `sections`。公开相册引用 `publicAlbums.albums[slug]`，私密相册引用 `privateAlbums[slug]` 并设置提示；`encryptedCover` 引用 `publicAlbums.covers[slug]`。保持 `photos: []`，照片从加密清单读取。新的受保护相册还需准备服务密钥、更新 Worker 配置并执行 managed 迁移后再发布。最后重新构建，自动生成相册路由与 sitemap 条目。完整流程见 [相册发布维护说明](docs/PRIVATE_GALLERY.md) 与 [管理服务部署说明](docs/GALLERY_ADMIN.md)。

## Gallery 授权与私密管理

Cloudflare Workers + D1 提供 managed v3 相册授权、服务端 IP 冷却与加密审计详情。**2026-09-23 已完成 Cloudflare OAuth、APAC D1 创建、远程 migration 0001、Secret 上传及首次 Worker 部署，并通过线上后台和本地前端联调。** 初版 100,000 次 PBKDF2 认证实测 **CPU P99 为 26.260ms**，超过 Free 的 10ms 预算。所有者已明确授权保留 PBKDF2，并在 30,000–100,000 次范围调整；混合 verifier 与审计分页现已部署并激活，版本为 `18607b41-6c83-4130-bad1-da2411d53c5d`，全部凭据使用 30,000 次 PBKDF2；最终 33 个请求样本无错误，P50 为 3.460ms，P99/最高为 11.731ms，两次请求超过 10ms。**功能验证通过，但仍未达到所有请求低于 10ms 的要求。** 口令、照片及所有既有数据密钥保持不变。当前套餐仍为已确认的 **Free（$0）**，未购买或升级，也没有执行 Git 推送或 Pages 部署。未执行审计重置，合成测试记录保留。当前部署状态见 [GALLERY_ADMIN.md](docs/GALLERY_ADMIN.md)。`gallery:service:migrate` 只处理本地数据库，远程 migration 必须使用 `--remote`。

仅保留经过实际验证为错误的共享相册短语，最多 256 个 Unicode 码点并标注截断，详情在 D1 中加密保存；成功、冷却拦截、管理员与重置输入均不保存。位置来自 IP 网络估算，坐标保留一位小数，不是 GPS。记录保留 90 天。新版审计 API 每次返回 50 条详情，面板自动加载最多最新 2,000 条；首批响应中的 SQL 汇总覆盖完整所选区间。前五次错误无冷却，随后依次为 1/5/10/20/30/60 分钟，之后保持 60 分钟；24 小时没有失败才重置计数，成功解锁不清零。重置审计历史也不清除冷却。

中文 Gallery 页脚的隐蔽标点只是管理入口。管理面板明文留在本地，仅发布 AES 加密的 `panel.enc`；管理员会话只在页面内存保留 15 分钟。新版 verifier v2 使用 **PBKDF2-HMAC-SHA256 后接秘密 pepper 的 HMAC-SHA256**：默认 30,000 次，可通过 `GALLERY_PASSWORD_ITERATIONS` 在 30,000–100,000 次之间调整。随机 16 字节 salt 派生 32 字节，再用独立随机 32 字节服务器 pepper 对凭据 context、salt、迭代次数及派生结果计算 HMAC，只保存最终 HMAC。即使 pepper 与 verifier 同时泄露，每次离线猜测仍需对应 PBKDF2 工作量，但 30,000 次的计算成本低于原 100,000 次；两者均不能上传 GitHub。先部署兼容两种格式的代码，再 prepare 和上传 v2 Secret；准备脚本保留 AES、审计、IP、面板密钥及已有 pepper，无需重加密照片。样本未出现资源失败，但平台弹性不构成未来保证；大规模审计负载仍需单独评估。详见 [服务说明](docs/GALLERY_ADMIN.md)。已经上传的 v1 历史密文或访客保存的照片无法撤回。

## 修改 Quote

修改 `src/data/quotes.ts`：

```ts
{ text: 'Your chosen quotation.', author: 'Verified author' },
```

当前三条为原创、无署名的编辑性占位短句，代码中已标注 `TODO`。请按偏好替换，并核实引用者。Quote 完全离线，每 10 秒自动切换；鼠标悬停或键盘焦点进入时暂停。可通过上一句、下一句按钮及位置圆点手动选择卡片，也可单独暂停自动播放。允许空数组。系统开启“减少动态效果”后关闭自动切换，手动切换仍然可用。

左右箭头默认背景透明，保留 44px 点击区域。悬停或键盘聚焦时才出现柔和玻璃反光；桌面高光随指针移动，名言正文保持稳定。

## 首页访客地图

主页底部恢复原有 **MapMyVisitors** 地图，沿用已有统计 ID 与访问历史。配置位于 `src/data/visitors.ts`，可以开关显示或修改地图颜色；保留 `widgetId` 即继续使用原来的计数器。只有滚动至地图区域才加载第三方脚本，避免影响首屏。脚本运行在无同源权限的隔离 iframe 中，不能读取主页面或私密相册的密码输入框。

区域标题为 **From around the world / 来自世界的足迹**，地图居中融入半透明玻璃背景。左侧说明栏已移除，访客历史链接保留在标题旁。

点击服务生成的地图可进入官方详情，查看访问总量与历史曲线。数字由 MapMyVisitors 提供，不在组件中写死。外部服务被阻止或不可用时会显示重新加载入口，不会显示虚构数字。地图暂时无法加载时，仍可使用常驻的“查看访客统计”链接进入原有官方统计页面。嵌入地图的可用性取决于服务与访问网络。

## 调整水波与流动玻璃

修改 `src/data/appearance.ts`，无需改组件：

- `water.ambient.intervalMs`：背景扰动平均间隔，默认 `2400` 毫秒；调小会更频繁。
- `water.ambient.intervalVariation`：间隔随机浮动比例，默认 `0.28`，即上下浮动 28%。
- `water.ambient.speed`：传播速度，默认每秒 `58` 个 CSS 像素。
- `water.ambient.diameter`：随机尺寸参数，默认 `[280, 680]`。它影响初始扰动范围及后续可见扩散大小；波纹随后在共同水面中传播、消散，不是固定的 CSS 圆环直径。小屏幕先等比例缩小整个区间再随机取值。
- `water.ambient.opacity`：水面光影整体透明度，默认 `0.38`。
- `water.click`：直接注入背景水面的半透明淡紫色小扰动。`diameter: 76` 控制初始扰动范围，`strength: 2.8` 让点击弱于自动背景波，`tint: [146, 111, 196]` 设置淡紫色。`maxPerBurst: 2` 与 `burstWindowMs: 950` 限制快速连点注入的能量。点击波自然传播和衰减，不使用独立小画布裁剪或固定时刻强行移除；光影由叠加后的水面计算，与已有背景波相遇时会增强或抵消。
- `glass.response`：局部高光跟随指针的平滑程度，默认 `0.18`。
- `glass.flowTravel`、`flowAngle`、`flowResponse`：整页装饰光层的最大偏移、转角和平滑程度，默认 `48px`、`5°`、`0.075`。指针经过空白处也会响应，正文与基础配色保持固定。
- `glass.refraction`：导航边缘对背后内容的折射位移，默认 `8`；设为 `0` 可停用 SVG 折射。
- 各自的 `enabled: false` 可关闭背景或点击水波。

背景由 `src/lib/waveField.ts` 的共享二维阻尼波场计算，`src/lib/waterSimulation.ts` 负责驱动与绘制。各次扰动先叠加到同一份水面高度，再计算光影，因此相遇时会产生相长、相消干涉；阻尼与吸收边界让水面逐渐平静。Canvas 模拟以 30 Hz 更新，绘制网格上限为桌面 64,000 像素、小屏幕 24,000 像素，不随设备像素密度增加。页面隐藏或开启“减少动态效果”时暂停并清理模拟。点击反馈保持小范围，Gallery 悬停光感自然消失；减少动态效果模式也关闭指针跟踪。

导航默认收为悬浮玻璃小 Bar，鼠标悬停或键盘聚焦后展开，触屏通过点击展开。指针与键盘焦点离开后收起，也支持 Escape 和关闭按钮。折叠状态下的链接不会进入键盘焦点顺序。“减少动态效果”模式关闭展开动画；禁用 JavaScript 时仍提供静态导航链接。

玻璃使用实际背景模糊、半透明填充与局部边缘高光。支持 SVG backdrop filter 的桌面浏览器增加细微边缘折射：只处理背后的内容，文字保持清晰；位移图只在导航尺寸变化时生成，不跟随鼠标重建。其他情况保留 CSS 玻璃材质。桌面指针移动会让一层宽而柔和的折射光缓慢偏移、转向，经过页面空白处同样生效；没有清晰轮廓或跟随鼠标的圆形光斑。移出页面后光层柔和归位，触屏及减少动态效果模式关闭跟随。

页面配色在 `src/styles/themes.css`：首页原浅蓝色、论文淡紫色、News 淡玫红、Awards 淡青绿、Gallery 原暖奶油色。首页姓名按当前语言独立显示。视觉细节位于 `src/styles/effects.css` 和 `src/styles/navigation.css`；论文边框流光周期为 `4.8s`。

## 部署到 GitHub Pages

1. 将需要发布的源码和加密资源放入实际 Git 仓库，并保留根目录 `.gitignore`。当前目录没有 `.git`；不要把整个工作目录拖拽到 GitHub 网页上传，网页上传不会依据本地 `.gitignore` 筛除私密文件。
2. 在实际仓库中运行 `git status --short --ignored`，确认 `.private/`、`.env`、`.env.*`（显式 `.example` 模板除外）、`.dev.vars*`、`node_modules/` 和 `dist/` 等本地文件被忽略，且没有私密文件已经被跟踪或暂存；确认后再提交。已被 Git 跟踪的文件不会因新增 `.gitignore` 自动排除。
3. 打开 GitHub 仓库 **Settings → Pages → Build and deployment → Source → GitHub Actions**。
4. 推送至 `main` 或 `master`，也可手动启动 Pages 工作流。
5. 在 **Actions** 中确认构建与部署两个任务成功，再访问部署地址。

本次发布前检查结果见 [发布检查记录](docs/RELEASE_CHECK.md)。

工作流通过 `actions/configure-pages` 取得站点 Base Path 和 URL，执行 npm 构建，再通过官方 Pages artifact/deploy actions 部署 `dist/`。默认本地构建适用于 `https://zhangwei-1999.github.io/` 这样的用户站点，Base Path 为 `/`。

Worker 已部署到 `https://wei-gallery-audit.zhangwei99-math.workers.dev`。Pages 工作流默认使用该地址并传为 `VITE_GALLERY_API_URL`；公开的 **Actions 仓库变量 `GALLERY_API_URL` 为可选覆盖项**，服务地址变更时再设置即可。不要将服务凭据或数据密钥放入前端环境变量。开发预览仍通过忽略提交的 `.env.development.local` 访问本地 8787；忽略提交的 `.env.production.local` 已配置线上地址用于生产构建，源码默认值不变。

如果是项目站点，例如 `https://your-user.github.io/your-repository/`，本地检查时使用：

```sh
PAGES_BASE_PATH=/your-repository/ SITE_URL=https://your-user.github.io/your-repository/ npm run build
PAGES_BASE_PATH=/your-repository/ npm run preview
```

随后在 preview 地址后加上 `/your-repository/` 访问。`PAGES_BASE_PATH` 必须以 `/` 开头和结尾。`SITE_URL` 是包含仓库路径的完整公开基础 URL，优先于 `profile.siteUrl`；使用自定义域名时也要设置正确地址。

构建会生成每个页面和相册的真实 HTML、404 页面、sitemap、robots、canonical 与 Open Graph 元信息。`images/`、`docs/` 中的论文、BibTeX 和展示资源会复制到 `dist/`，但排除隐藏文件、Markdown 维护文档和未引用的原始头像 `images/myphoto.jpg`；源文件保留。`public/` 由 Vite 复制。部署对象必须是 **`dist/`，而非源码目录**。站内切换同步导航状态及浏览器前进/后退；真实 HTML 负责 GitHub Pages 上的直接访问与刷新。

**本地构建成功不等于线上部署已完成。**此次提供的工作目录快照没有 `.git` 信息，需要在实际仓库中提交并推送后，查看 GitHub Actions 的部署结果。

## 无障碍、性能与后续维护

页面提供可见键盘焦点、语义化区域、移动导航、键盘可用的 Lightbox 与图片懒加载。遵循 `prefers-reduced-motion`，关闭水面背景运动、鼠标水波、边框动画与 Quote 自动切换。桌面鼠标效果使用 CSS 变量和动画帧更新，不在每次移动时触发 React 状态更新；未引入大型动画库或 WebGL。

保留 `academic.md`、原图片和 BibTeX 作为来源记录。**今后修改 `academic.md` 不会更新网站，请修改 `src/data/`。**旧 Scholar 爬虫仅允许手动运行，作为可选历史工具保留，不是构建或访问网站的依赖。论文引用与资源链接继续可用，无需动态远程徽章。

发布前运行 `npm run lint`、`npm run test` 和 `npm run build`；交互与路由修改可以再运行 `npm run test:e2e`。后续可通过本地加密流程补充照片、替换 Quote 占位、确认 GMU 缩写及奖项译名，并按需要更新历史期刊指标。

原始静态模板来自 [AntXinyuan 的学术主页](https://github.com/AntXinyuan/antxinyuan.github.io/)。此次重构保留已有个人内容与资源。

## 验证部署文件与处理其他公开图片

`npm run check:build` 检查实际 `dist/` 中的页面、资源、BibTeX、canonical 和 sitemap，并阻止私密源文件、环境文件、符号链接及不需要的维护文档进入发布产物；总量达到 1 GB 时校验失败。`npm run test:static` 使用无 SPA fallback 的本地静态服务器，验证直接刷新、404 恢复、无 JavaScript 正文和 hydration；需先运行 `npm run build`。同一套测试支持项目子路径。

```sh
npm run build
npm run check:build
npm run test:static
npm run optimize:image -- paper-teaser-original.jpg docs/example-paper/teaser.webp 1600
```

最后一条命令仅用于明确公开的非 Gallery 资源，例如论文示意图。它会校正方向、保留宽高比、输出 WebP 并打印尺寸，不覆盖原文件。相册照片使用 `gallery:encrypt`，不要输出到公开图片目录。构建检查也会拒绝相册发布目录中的明文图片文件。

本次验证结果见 [验证记录](docs/VERIFICATION.md)。
