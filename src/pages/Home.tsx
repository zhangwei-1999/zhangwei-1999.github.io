import { profile } from "../data/profile";
import { news } from "../data/news";
import { publications } from "../data/publications";
import { useLanguage } from "../lib/language";
import { assetUrl } from "../lib/assets";
import { Link } from "../lib/router";
import { Icon } from "../components/Icon";
import { SocialIcon } from "../components/SocialIcon";
import { NewsItem } from "../components/NewsItem";
import { PublicationCard } from "../components/PublicationCard";
import { SectionHeading } from "../components/SectionHeading";
import { VisitorMap } from "../components/VisitorMap";

export function Home() {
  const { language, t } = useLanguage();
  const latest = [...news]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 8);
  return (
    <>
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-copy">
          <p className="eyebrow">
            <span className="tiny-line" />
            {t(profile.researchLabel).toUpperCase()}
          </p>
          <h1 id="hero-title" lang={language === "zh" ? "zh-CN" : "en"}>
            {t(profile.name)}
            <span className="name-period" aria-hidden="true">.</span>
          </h1>
          <p className="hero-role">
            <span className="status-dot" />
            {t(profile.role)}
            <span className="role-divider">/</span>
            {profile.institutionShort}
          </p>
          <a href={profile.institutionUrl} className="hero-institution">
            {t(profile.institution)}
          </a>
          <div className="hero-actions">
            <a
              className="button button-primary ripple-surface"
              href={`mailto:${profile.email}`}
            >
              <Icon name="mail" />
              {language === "en" ? "Get in touch" : "与我联系"}
            </a>
            <Link
              className="button button-quiet ripple-surface"
              to="/publications"
            >
              {language === "en" ? "Explore my research" : "浏览研究成果"}
              <Icon name="arrow" />
            </Link>
          </div>
          <div className="social-links">
            {profile.links.map((link) => (
              <a
                key={link.label}
                className="social-link ripple-surface"
                href={link.url}
                target="_blank"
                rel="noreferrer"
              >
                {link.icon && <SocialIcon name={link.icon} />}
                <span>{link.label}</span>
                <span className="social-external" aria-hidden="true">
                  ↗
                </span>
              </a>
            ))}
          </div>
        </div>
        <div className="hero-portrait-scene">
          <div className="portrait-card">
            <img
              src={assetUrl(profile.portraitSmall ?? profile.portrait)}
              srcSet={
                profile.portraitSmall
                  ? [
                      profile.portraitMobile &&
                        `${assetUrl(profile.portraitMobile)} 512w`,
                      `${assetUrl(profile.portraitSmall)} 680w`,
                      `${assetUrl(profile.portrait)} 1200w`,
                    ]
                      .filter(Boolean)
                      .join(", ")
                  : undefined
              }
              sizes="(max-width: 380px) calc(100vw - 52px), (max-width: 700px) 270px, (max-width: 1000px) 290px, 320px"
              alt={t(profile.portraitAlt)}
              width={profile.portraitWidth}
              height={profile.portraitHeight}
              fetchPriority="high"
            />
            <div className="portrait-caption">
              <Icon name="location" size={14} />
              {t(profile.location)}
              <span className="caption-dot" />
            </div>
          </div>
          <span className="portrait-spark" aria-hidden="true">
            ✧
          </span>
        </div>
        <div className="hero-bottom">
          <a href="#about">
            {language === "en" ? "SCROLL TO EXPLORE" : "向下探索"}{" "}
            <span aria-hidden="true">↓</span>
          </a>
        </div>
      </section>
      <section id="about" className="about-section section-block">
        <div className="about-copy">
          <SectionHeading
            title={language === "en" ? "About" : "关于我"}
            index="01"
          />
          {profile.bio.map((paragraph, index) => (
            <p key={index}>{t(paragraph)}</p>
          ))}
        </div>
        <aside className="research-card glass">
          <p className="eyebrow">
            {language === "en" ? "RESEARCH INTERESTS" : "研究方向"}
          </p>
          {profile.interests.map((interest, index) => (
            <div className="research-interest" key={interest.en}>
              <span>0{index + 1}</span>
              <h3>{t(interest)}</h3>
              <Icon name="spark" size={17} />
            </div>
          ))}
        </aside>
      </section>
      <section className="section-block">
        <SectionHeading
          title={language === "en" ? "Latest news" : "近期动态"}
          index="02"
        />
        <ul className="news-list home-news">
          {latest.map((item) => (
            <NewsItem key={item.id} item={item} />
          ))}
        </ul>
        <Link to="/news" className="news-more text-link">
          {language === "en" ? "View all news" : "全部动态"}
          <Icon name="arrow" />
        </Link>
      </section>
      <section className="section-block">
        <SectionHeading
          title={language === "en" ? "Selected publications" : "精选论文"}
          index="03"
          link="/publications"
          label={language === "en" ? "All publications" : "全部论文"}
        />
        <div className="publication-list">
          {publications
            .filter((paper) => paper.featured)
            .map((paper) => (
              <PublicationCard key={paper.id} publication={paper} />
            ))}
        </div>
      </section>
      <section className="section-block education-section">
        <SectionHeading
          title={language === "en" ? "Education" : "教育背景"}
          index="04"
        />
        <div className="education-grid">
          {profile.education.map((education) => (
            <article className="education-card" key={education.institution.en}>
              <img
                src={assetUrl(education.logo)}
                alt=""
                width="46"
                height="46"
                loading="lazy"
              />
              <p className="education-period">{t(education.period)}</p>
              <h3>{t(education.degree)}</h3>
              <a href={education.url}>{t(education.institution)} ↗</a>
              {education.department && (
                <a
                  className="education-department"
                  href={education.departmentUrl}
                >
                  {t(education.department)}
                </a>
              )}
              <p className="education-location">{t(education.location)}</p>
            </article>
          ))}
        </div>
      </section>
      <VisitorMap />
    </>
  );
}
