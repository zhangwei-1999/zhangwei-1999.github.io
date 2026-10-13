import { assetUrl } from "../lib/assets";
import { useLanguage } from "../lib/language";
import type { Publication } from "../types";
import { Fragment } from "react";
import { profile } from "../data/profile";

export function PublicationCard({
  publication: paper,
}: {
  publication: Publication;
}) {
  const { language, t } = useLanguage();
  const title =
    language === "zh" && paper.titleZh ? paper.titleZh : paper.title;
  return (
    <article className="publication-card glass ripple-surface">
      <div className="publication-cover">
        <img
          src={assetUrl(paper.cover)}
          alt={title}
          loading="lazy"
          decoding="async"
          width="640"
          height="400"
        />
        <span className="cover-year">{paper.year}</span>
      </div>
      <div className="publication-content">
        <div className="publication-meta">
          <span>{paper.venue}</span>
          {paper.badges?.map((badge) => (
            <span className="paper-badge" key={badge}>
              {badge}
            </span>
          ))}
        </div>
        <h3>{title}</h3>
        <p className="authors">
          {paper.authors.split(profile.name.en).map((part, index) => (
            <Fragment key={index}>
              {index > 0 && <strong>{profile.name.en}</strong>}
              {part}
            </Fragment>
          ))}
        </p>
        {paper.description && (
          <p className="paper-description">{t(paper.description)}</p>
        )}
        <div className="paper-links">
          {paper.links.map((link) => (
            <a
              className="resource-link ripple-surface"
              key={link.label}
              href={assetUrl(link.url)}
              target="_blank"
              rel="noreferrer"
            >
              {link.label}
              <span aria-hidden="true">↗</span>
            </a>
          ))}
        </div>
      </div>
    </article>
  );
}
