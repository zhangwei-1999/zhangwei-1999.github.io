import { news } from "../data/news";
import { NewsItem } from "../components/NewsItem";
import { NewsCalendar } from "../components/NewsCalendar";
import { QuotePanel } from "../components/QuotePanel";
import { useLanguage } from "../lib/language";

export function NewsPage() {
  const { language } = useLanguage();
  const sorted = [...news].sort((a, b) => b.date.localeCompare(a.date));
  const years = [...new Set(sorted.map((item) => item.date.slice(0, 4)))];
  return (
    <>
      <div className="page-heading">
        <h1>{language === "en" ? "News" : "近期动态"}</h1>
      </div>
      <div className="news-archive">
        {years.map((year) => (
          <section className="news-year" key={year}>
            <h2>{year}</h2>
            <ul className="news-list">
              {sorted
                .filter((item) => item.date.startsWith(year))
                .map((item) => (
                  <NewsItem key={item.id} item={item} />
                ))}
            </ul>
          </section>
        ))}
      </div>
      <section className="calendar-quote-section">
        <NewsCalendar language={language} />
        <QuotePanel language={language} />
      </section>
    </>
  );
}
