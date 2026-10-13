import { useLanguage } from "../lib/language";
import type { News } from "../types";

export function NewsItem({ item }: { item: News }) {
  const { t, language } = useLanguage();
  return (
    <li className="news-item ripple-surface">
      <time dateTime={item.date}>{item.date.replaceAll("-", ".")}</time>
      <span className="news-emoji" aria-hidden="true">
        {item.emoji}
      </span>
      <div className="news-text">
        {t(item.content)}
        {item.link && (
          <a
            className="news-link"
            href={item.link}
            target="_blank"
            rel="noreferrer"
            aria-label={`${language === "en" ? "Read more" : "了解更多"}: ${t(item.content)}`}
          >
            <span aria-hidden="true">↗</span>
          </a>
        )}
      </div>
    </li>
  );
}
