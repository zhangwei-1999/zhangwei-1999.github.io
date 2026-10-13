import type { News } from "../types";

// The source only gives months: preserve that precision instead of inventing dates.
// For future dated entries, use date: '2026-09-15', datePrecision: 'day'.
export const news: News[] = [
  {
    id: "2026-02-jamc",
    date: "2026-02",
    datePrecision: "month",
    emoji: "🎉",
    category: "paper",
    content: {
      en: "A collaborative paper was accepted by Journal of Applied Mathematics and Computing.",
      zh: "一篇合作论文被 Journal of Applied Mathematics and Computing 接收。",
    },
  },
  {
    id: "2026-01-tea",
    date: "2026-01",
    datePrecision: "month",
    emoji: "📄",
    category: "paper",
    content: {
      en: "Our collaborative paper, “TEA: Temporal Adaptive Satellite Image Semantic Segmentation,” is available on arXiv.",
      zh: "合作论文「TEA: Temporal Adaptive Satellite Image Semantic Segmentation」已发布于 arXiv。",
    },
    link: "https://arxiv.org/abs/2601.04956",
  },
  {
    id: "2025-09-phd",
    date: "2025-09",
    datePrecision: "month",
    emoji: "🎓",
    category: "education",
    content: {
      en: "I began my Ph.D. studies at the Institute of Computing Technology, Chinese Academy of Sciences.",
      zh: "我进入中国科学院计算技术研究所攻读博士学位。",
    },
    link: "http://www.ict.ac.cn",
  },
  {
    id: "2025-05-cssc",
    date: "2025-05",
    datePrecision: "month",
    emoji: "🎤",
    category: "talk",
    content: {
      en: "Conference presentation at CSSC 2025 in Kunming, Yunnan.",
      zh: "在云南昆明参加 CSSC 2025 并作会议报告。",
    },
  },
  {
    id: "2025-03-anm",
    date: "2025-03",
    datePrecision: "month",
    emoji: "🎉",
    category: "paper",
    content: {
      en: "A paper was accepted by Applied Numerical Mathematics.",
      zh: "一篇论文被 Applied Numerical Mathematics 接收。",
    },
  },
  {
    id: "2025-01-el",
    date: "2025-01",
    datePrecision: "month",
    emoji: "🎉",
    category: "paper",
    content: {
      en: "A paper was accepted by Electronics Letters.",
      zh: "一篇论文被 Electronics Letters 接收。",
    },
  },
  {
    id: "2024-11-modeling",
    date: "2024-11",
    datePrecision: "month",
    emoji: "🏆",
    category: "award",
    content: {
      en: "Second Prize in the 21st China Post-Graduate Mathematical Contest in Modeling.",
      zh: "获第二十一届中国研究生数学建模竞赛二等奖。",
    },
  },
  {
    id: "2024-10-jcam",
    date: "2024-10",
    datePrecision: "month",
    emoji: "🎉",
    category: "paper",
    content: {
      en: "A collaborative paper was accepted by Journal of Computational and Applied Mathematics.",
      zh: "一篇合作论文被 Journal of Computational and Applied Mathematics 接收。",
    },
  },
  {
    id: "2024-10-orsc",
    date: "2024-10",
    datePrecision: "month",
    emoji: "🎤",
    category: "talk",
    content: {
      en: "Conference presentation at ORSC 2024 in Guiyang, Guizhou.",
      zh: "在贵州贵阳参加 ORSC 2024 并作会议报告。",
    },
  },
  {
    id: "2023-12-modeling",
    date: "2023-12",
    datePrecision: "month",
    emoji: "🏆",
    category: "award",
    content: {
      en: "Third Prize in the 20th China Post-Graduate Mathematical Contest in Modeling.",
      zh: "获第二十届中国研究生数学建模竞赛三等奖。",
    },
  },
  {
    id: "2023-11-cors",
    date: "2023-11",
    datePrecision: "month",
    emoji: "📢",
    category: "conference",
    content: {
      en: "Attended the Standing Council of the Mathematical Programming Branch of the CORS in Nanning, Guangxi.",
      zh: "在广西南宁参加中国运筹学会数学规划分会常务理事会会议。",
    },
  },
  {
    id: "2022-09-masters",
    date: "2022-09",
    datePrecision: "month",
    emoji: "🎓",
    category: "education",
    content: {
      en: "I joined the School of Mathematical Sciences at Guangxi Minzu University as an M.S. student.",
      zh: "我进入广西民族大学数学科学学院攻读硕士学位。",
    },
    link: "https://col-sci.gxmzu.edu.cn/",
  },
  {
    id: "2020-12-scholarship",
    date: "2020-12",
    datePrecision: "month",
    emoji: "🏆",
    category: "award",
    content: {
      en: "Awarded the 2020 National Scholarship.",
      zh: "获 2020 年国家奖学金。",
    },
  },
  {
    id: "2019-12-scholarship",
    date: "2019-12",
    datePrecision: "month",
    emoji: "🏆",
    category: "award",
    content: {
      en: "Awarded the 2019 Guangxi People’s Government Scholarship.",
      zh: "获 2019 年广西壮族自治区人民政府奖学金。",
    },
  },
  {
    id: "2019-05-cssc",
    date: "2019-05",
    datePrecision: "month",
    emoji: "🎤",
    category: "talk",
    content: {
      en: "Conference presentation at CSSC 2019 in Changsha, Hunan.",
      zh: "在湖南长沙参加 CSSC 2019 并作会议报告。",
    },
  },
  {
    id: "2018-11-ica3pp",
    date: "2018-11",
    datePrecision: "month",
    emoji: "📢",
    category: "conference",
    content: {
      en: "Attended ICA3PP 2018 in Guangzhou, Guangdong.",
      zh: "在广东广州参加 ICA3PP 2018。",
    },
  },
  {
    id: "2018-05-ica3pp",
    date: "2018-05",
    datePrecision: "month",
    emoji: "🎉",
    category: "paper",
    content: {
      en: "A collaborative paper was accepted by ICA3PP 2018.",
      zh: "一篇合作论文被 ICA3PP 2018 接收。",
    },
  },
  {
    id: "2017-09-undergraduate",
    date: "2017-09",
    datePrecision: "month",
    emoji: "🎓",
    category: "education",
    content: {
      en: "I joined the School of Mathematics and Statistics at Yulin Normal University as a B.S. student.",
      zh: "我进入玉林师范学院数学与统计学院攻读学士学位。",
    },
    link: "https://stxy.ylu.edu.cn/",
  },
];
