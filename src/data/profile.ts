import type { Profile } from "../types";

// Personal facts and links were migrated from academic.md. Add optional social links here.
export const profile: Profile = {
  name: { en: "Wei Zhang", zh: "张蔚" },
  role: { en: "Ph.D. Student", zh: "博士研究生" },
  institution: {
    en: "Institute of Computing Technology, Chinese Academy of Sciences",
    zh: "中国科学院计算技术研究所",
  },
  institutionUrl: "http://www.ict.ac.cn",
  institutionShort: "ICT, CAS",
  researchLabel: {
    en: "Computer Vision & Optimization",
    zh: "计算机视觉与优化",
  },
  location: { en: "Beijing, China", zh: "中国 · 北京" },
  email: "zhangwei25b@ict.ac.cn",
  tagline: {
    en: "Research in computer vision, 3D reconstruction, and optimization algorithms.",
    zh: "研究方向包括计算机视觉、三维重建和优化算法。",
  },
  // Lossless WebP of images/myphoto.jpg, resized without cropping or retouching.
  portrait: "images/myphoto.webp",
  portraitSmall: "images/myphoto-small.webp",
  portraitMobile: "images/myphoto-mobile.webp",
  portraitWidth: 1200,
  portraitHeight: 800,
  portraitAlt: { en: "Portrait of Wei Zhang", zh: "张蔚的个人照片" },
  bio: [
    {
      en: "I began my Ph.D. in Engineering at the Institute of Computing Technology, Chinese Academy of Sciences, in Beijing in autumn 2025. I received my M.S. from the School of Mathematical Sciences at Guangxi Minzu University in 2025, where my research focused on algorithms and theory in operations research and optimization. My research interests span computer vision and optimization, with a focus on 3D reconstruction and optimization algorithms.",
      zh: "我于 2025 年秋季进入中国科学院计算技术研究所，在北京攻读工学博士学位。于 2025 年获得广西民族大学数学科学学院硕士学位，硕士阶段主要研究运筹优化算法与理论。我的研究兴趣涵盖计算机视觉与优化，重点关注三维重建和优化算法。",
    },
  ],
  interests: [
    { en: "Computer Vision", zh: "计算机视觉" },
    { en: "3D Reconstruction", zh: "三维重建" },
    { en: "Optimization", zh: "优化算法" },
  ],
  links: [
    {
      label: "Google Scholar",
      url: "https://scholar.google.com/citations?user=uid0wgYAAAAJ",
      icon: "google-scholar",
    },
    { label: "GitHub", url: "https://github.com/zhangwei-1999", icon: "github" },
    { label: "ORCID", url: "https://orcid.org/0000-0002-1793-0306", icon: "orcid" },
    {
      label: "Semantic Scholar",
      url: "https://www.semanticscholar.org/author/Wei-Zhang/2299556404",
      icon: "semantic-scholar",
    },
    { label: "DBLP", url: "https://dblp.org/pid/10/4661-225", icon: "dblp" },
  ],
  siteUrl: "https://zhangwei-1999.github.io",
  repository: "https://github.com/zhangwei-1999/zhangwei-1999.github.io",
  lastUpdated: "2026-10-13",
  education: [
    {
      degree: {
        en: "Ph.D. in Engineering · in progress",
        zh: "工学博士 · 在读",
      },
      institution: {
        en: "Institute of Computing Technology, Chinese Academy of Sciences",
        zh: "中国科学院计算技术研究所",
      },
      url: "http://www.ict.ac.cn",
      period: { en: "Sep. 2025 — Present", zh: "2025.09 — 至今" },
      location: { en: "Beijing, China", zh: "中国 · 北京" },
      logo: "images/ucas.webp",
    },
    {
      degree: { en: "M.S.", zh: "硕士" },
      institution: { en: "Guangxi Minzu University", zh: "广西民族大学" },
      department: { en: "School of Mathematical Sciences", zh: "数学科学学院" },
      url: "https://www.gxmzu.edu.cn/",
      departmentUrl: "https://col-sci.gxmzu.edu.cn/",
      period: { en: "Sep. 2022 — Jun. 2025", zh: "2022.09 — 2025.06" },
      location: { en: "Guangxi, China", zh: "中国 · 广西" },
      logo: "images/gxmu.webp",
    },
    {
      degree: { en: "B.S.", zh: "学士" },
      institution: { en: "Yulin Normal University", zh: "玉林师范学院" },
      department: {
        en: "School of Mathematics and Statistics",
        zh: "数学与统计学院",
      },
      url: "https://www.ylu.edu.cn/",
      departmentUrl: "https://stxy.ylu.edu.cn/",
      period: { en: "Sep. 2017 — Jun. 2021", zh: "2017.09 — 2021.06" },
      location: { en: "Guangxi, China", zh: "中国 · 广西" },
      logo: "images/ynu.webp",
    },
  ],
};
