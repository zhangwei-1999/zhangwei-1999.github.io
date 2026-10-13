import { useState } from "react";
import { publications } from "../data/publications";
import { PublicationCard } from "../components/PublicationCard";
import { useLanguage } from "../lib/language";

export function Publications() {
  const { language } = useLanguage();
  const [filter, setFilter] = useState("All");
  const categories = [
    "All",
    ...new Set(publications.map((paper) => paper.category)),
  ];
  const papers = publications.filter(
    (paper) => filter === "All" || paper.category === filter,
  );
  const years = [...new Set(papers.map((paper) => paper.year))].sort(
    (a, b) => b - a,
  );
  const labels: Record<string, string> = {
    All: "全部",
    Conference: "会议论文",
    Journal: "期刊论文",
    Preprint: "预印本",
    conference: "会议论文",
    journal: "期刊论文",
    preprint: "预印本",
  };
  return (
    <>
      <div className="page-heading">
        <h1>
          {language === "en" ? "Publications" : "学术论文"}
        </h1>
        <p>
          {language === "en"
            ? "A collection of work in computer vision and mathematical optimization."
            : "关于计算机视觉与数学优化的研究工作。"}
        </p>
      </div>
      <div
        className="filter-bar"
        aria-label={language === "en" ? "Filter publications" : "筛选论文"}
      >
        {categories.map((category) => (
          <button
            key={category}
            className="filter-button ripple-surface"
            aria-pressed={filter === category}
            onClick={() => setFilter(category)}
          >
            {language === "zh"
              ? (labels[category] ?? category)
              : category.charAt(0).toUpperCase() + category.slice(1)}
            <span>
              {category === "All"
                ? publications.length
                : publications.filter((paper) => paper.category === category)
                    .length}
            </span>
          </button>
        ))}
      </div>
      <p className="publication-legend">
        {language === "en"
          ? "* Equal contribution · † Corresponding author"
          : "* 共同贡献 · † 通讯作者"}
      </p>
      <div aria-live="polite" className="sr-only">
        {papers.length} {language === "en" ? "publications" : "篇论文"}
      </div>
      {years.map((year) => (
        <section className="publication-year section-block" key={year}>
          <h2 className="year-heading">
            {year}
            <span />
          </h2>
          <div className="publication-list">
            {papers
              .filter((paper) => paper.year === year)
              .map((paper) => (
                <PublicationCard key={paper.id} publication={paper} />
              ))}
          </div>
        </section>
      ))}
    </>
  );
}
