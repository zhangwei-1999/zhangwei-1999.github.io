import type { Award } from "../types";

// Migrated awards only. TODO: expand the legacy abbreviation “GMU” after confirmation.
// No organizations, exact dates, or external award URLs have been invented.
export const awards: Award[] = [
  {
    id: "gmu-scholarship-2024",
    year: 2024,
    title: { en: "GMU Academic Scholarship", zh: "GMU 学业奖学金" },
  },
  {
    id: "postgraduate-modeling-2024",
    year: 2024,
    title: {
      en: "Second Prize · 21st China Post-Graduate Mathematical Contest in Modeling",
      zh: "第二十一届中国研究生数学建模竞赛 · 二等奖",
    },
  },
  {
    id: "micro-course-2024",
    year: 2024,
    title: {
      en: "First Prize · 13th Micro Course Design Test for Mathematics Teachers in Higher Education Institutions",
      zh: "第十三届高校数学教师微课程设计竞赛 · 一等奖",
    },
  },
  {
    id: "gmu-scholarship-2023",
    year: 2023,
    title: { en: "GMU Academic Scholarship", zh: "GMU 学业奖学金" },
  },
  {
    id: "postgraduate-modeling-2023",
    year: 2023,
    title: {
      en: "Third Prize · 20th China Post-Graduate Mathematical Contest in Modeling",
      zh: "第二十届中国研究生数学建模竞赛 · 三等奖",
    },
  },
  {
    id: "national-scholarship-2020",
    year: 2020,
    title: { en: "National Scholarship", zh: "国家奖学金" },
  },
  {
    id: "guangxi-scholarship-2019",
    year: 2019,
    title: {
      en: "Guangxi People’s Government Scholarship",
      zh: "广西壮族自治区人民政府奖学金",
    },
  },
  {
    id: "teaching-competition-2019",
    year: 2019,
    title: {
      en: "First Prize · 9th National Mathematics Teacher Training Student Course Creation and Teaching Ability Test and Exchange Exhibition Competition",
      zh: "第九届全国数学师范生课程创作与教学能力测试及交流展示竞赛 · 一等奖",
    },
  },
  {
    id: "undergraduate-modeling-2019",
    year: 2019,
    title: {
      en: "Third Prize, Guangxi · China Undergraduate Mathematical Contest in Modeling",
      zh: "全国大学生数学建模竞赛 · 广西赛区三等奖",
    },
  },
  {
    id: "mathematics-competition-2018",
    year: 2018,
    title: {
      en: "Third Prize, Guangxi · Chinese Mathematics Competitions for College Students (Mathematics Major)",
      zh: "全国大学生数学竞赛（数学专业）· 广西赛区三等奖",
    },
  },
  {
    id: "undergraduate-modeling-2018",
    year: 2018,
    title: {
      en: "Third Prize, Guangxi · China Undergraduate Mathematical Contest in Modeling",
      zh: "全国大学生数学建模竞赛 · 广西赛区三等奖",
    },
  },
];
