import { awards } from "../data/awards";
import { useLanguage } from "../lib/language";

export function Awards() {
  const { language, t } = useLanguage();
  const years = [...new Set(awards.map((award) => award.year))].sort(
    (a, b) => b - a,
  );
  return (
    <>
      <div className="page-heading">
        <h1>{language === "en" ? "Awards" : "荣誉奖项"}</h1>
      </div>
      <div className="award-timeline">
        {years.map((year) => (
          <section className="award-year" key={year}>
            <h2>{year}</h2>
            <div className="award-year-list">
              {awards
                .filter((award) => award.year === year)
                .map((award) => (
                  <article
                    className="award-card glass ripple-surface"
                    key={award.id}
                  >
                    <span className="award-mark" aria-hidden="true">
                      ✧
                    </span>
                    <div>
                      <h3>{t(award.title)}</h3>
                      {award.organization && <p>{t(award.organization)}</p>}
                      {award.description && <p>{t(award.description)}</p>}
                      {award.link && (
                        <a className="text-link" href={award.link}>
                          {language === "en" ? "Details" : "详情"} ↗
                        </a>
                      )}
                    </div>
                  </article>
                ))}
            </div>
          </section>
        ))}
      </div>
      {awards.length === 0 && (
        <p className="empty-state">
          {language === "en"
            ? "No awards listed yet."
            : "暂无奖项记录。"}
        </p>
      )}
    </>
  );
}
