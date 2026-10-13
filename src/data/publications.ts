import type { Publication } from "../types";

// Explicit editorial selection for the first version: TEA, EL, and ANM.
// Set featured: true on ANY number of entries to pin them on Home.
// SCI quartiles / impact factors below are historical values from academic.md,
// not a claim about current journal metrics. Keep or update them as appropriate.
export const publications: Publication[] = [
  {
    id: "tea-2026",
    title: "TEA: Temporal Adaptive Satellite Image Semantic Segmentation",
    authors:
      "Juyuan Kang*, Hao Zhu*, Yan Zhu, Wei Zhang, Jianing Chen, Tianxiang Xiao, Yike Ma, Hao Jiang, Feng Dai†",
    venue: "arXiv",
    year: 2026,
    category: "preprint",
    cover: "docs/A-arxiv26/arxiv26.webp",
    featured: true,
    description: {
      en: "Temporal adaptation for semantic segmentation of satellite imagery.",
      zh: "面向卫星图像语义分割的时间自适应方法。",
    },
    badges: ["Preprint"],
    links: [
      { label: "Paper", url: "https://arxiv.org/pdf/2601.04956" },
      { label: "arXiv", url: "https://arxiv.org/abs/2601.04956" },
      { label: "Code", url: "https://github.com/KeplerKang/TEA" },
      { label: "BibTeX", url: "docs/A-arxiv26/bibtex.txt" },
      {
        label: "Citations",
        url: "https://scholar.google.com/citations?view_op=view_citation&citation_for_view=uid0wgYAAAAJ:IjCSPb-OGe4C",
      },
    ],
  },
  {
    id: "jamc-2026",
    title:
      "A Family of Derivative-free Projection Methods with The Modified Two-step Inertial Strategy for Constrained Nonlinear Pseudo-monotone Equations",
    authors: "Guodong Ma*, Junji Wang*, Jinbao Jian†, Wei Zhang, Xiang Luo",
    venue: "Journal of Applied Mathematics and Computing",
    year: 2026,
    category: "journal",
    cover: "docs/J-JAMC/JAMC2026.webp",
    featured: false,
    description: {
      en: "Derivative-free projection methods with a modified two-step inertial strategy for constrained nonlinear pseudo-monotone equations.",
      zh: "结合修正两步惯性策略的无导数投影方法，用于求解约束非线性伪单调方程。",
    },
    badges: ["SCI-Q1", "IF 2.7"],
    links: [
      {
        label: "Paper",
        url: "https://link.springer.com/article/10.1007/s12190-025-02731-6",
      },
      { label: "BibTeX", url: "docs/J-JAMC/bibtex.txt" },
      {
        label: "Citations",
        url: "https://scholar.google.com/citations?view_op=view_citation&citation_for_view=uid0wgYAAAAJ:qjMakFHDy7sC",
      },
    ],
  },
  {
    id: "el-2025",
    title:
      "Reconstruction of Three‐dimensional Sound Field System Based on Machine Learning Method",
    authors: "Wei Zhang, Maosheng Zhang†, Xiaoyan Sun, Jingyi Mo",
    venue: "Electronics Letters",
    year: 2025,
    category: "journal",
    cover: "docs/J-EL/EL2025.webp",
    featured: true,
    description: {
      en: "Reconstructing a three-dimensional sound field system using machine learning.",
      zh: "利用机器学习方法重建三维声场系统。",
    },
    badges: ["SCI-Q4", "IF 0.9"],
    links: [
      {
        label: "Paper",
        url: "https://ietresearch.onlinelibrary.wiley.com/doi/epdf/10.1049/ell2.70133",
      },
      { label: "BibTeX", url: "docs/J-EL/bibtex.txt" },
      {
        label: "Citations",
        url: "https://scholar.google.com/citations?view_op=view_citation&citation_for_view=uid0wgYAAAAJ:9yKSN-GCB0IC",
      },
    ],
  },
  {
    id: "anm-2025",
    title:
      "An Inertial Hybrid DFPM-based Algorithm for Constrained Nonlinear Equations with Applications",
    authors: "Guodong Ma*, Wei Zhang*, Jinbao Jian†, Zefeng Huang, Jingyi Mo",
    venue: "Applied Numerical Mathematics",
    year: 2025,
    category: "journal",
    cover: "docs/J-ANM/ANM2025.webp",
    featured: true,
    description: {
      en: "An inertial hybrid derivative-free projection algorithm for constrained nonlinear equations and their applications.",
      zh: "用于约束非线性方程及其应用的惯性混合无导数投影算法。",
    },
    badges: ["SCI-Q1", "IF 2.4"],
    links: [
      {
        label: "Paper",
        url: "https://www.sciencedirect.com/science/article/abs/pii/S0168927424003179",
      },
      { label: "BibTeX", url: "docs/J-ANM/bibtex.txt" },
      {
        label: "Citations",
        url: "https://scholar.google.com/citations?view_op=view_citation&citation_for_view=uid0wgYAAAAJ:d1gkVwhDpl0C",
      },
    ],
  },
  {
    id: "jcam-2024",
    title:
      "Splitting Augmented Lagrangian-type Algorithms with Partial Quadratic Approximation to Solve Sparse Signal Recovery Problems",
    authors: "Jinbao Jian, Qiongxuan Huang, Jianghua Yin†, Wei Zhang",
    venue: "Journal of Computational and Applied Mathematics",
    year: 2024,
    category: "journal",
    cover: "docs/J-JCAM/JCAM2024.webp",
    featured: false,
    description: {
      en: "Splitting augmented Lagrangian-type algorithms with partial quadratic approximation for sparse signal recovery.",
      zh: "结合部分二次近似的分裂增广拉格朗日型算法，用于稀疏信号恢复。",
    },
    badges: ["SCI-Q1", "IF 2.6"],
    links: [
      {
        label: "Paper",
        url: "https://www.sciencedirect.com/science/article/abs/pii/S037704272400222X",
      },
      { label: "BibTeX", url: "docs/J-JCAM/bibtex.txt" },
      {
        label: "Citations",
        url: "https://scholar.google.com/citations?view_op=view_citation&citation_for_view=uid0wgYAAAAJ:u-x6o8ySG0sC",
      },
    ],
  },
  {
    id: "ica3pp-2018",
    title:
      "Feature Extraction of Dichotomous Equipment Based on Non-intrusive Load Monitoring and Decomposition",
    authors: "Fangping Li, Wei Zhang, Heng Liu†, Maosheng Zhang",
    venue: "ICA3PP",
    year: 2018,
    category: "conference",
    cover: "docs/C-ICA3PP/ICA3PP2018.webp",
    featured: false,
    description: {
      en: "Feature extraction for dichotomous equipment through non-intrusive load monitoring and decomposition.",
      zh: "通过非侵入式负荷监测与分解提取二态设备特征。",
    },
    badges: ["CCF-C"],
    links: [
      {
        label: "Paper",
        url: "https://link.springer.com/chapter/10.1007/978-3-030-05234-8_24",
      },
      { label: "BibTeX", url: "docs/C-ICA3PP/bibtex.txt" },
      {
        label: "Citations",
        url: "https://scholar.google.com/citations?view_op=view_citation&citation_for_view=uid0wgYAAAAJ:2osOgNQ5qMEC",
      },
    ],
  },
];
