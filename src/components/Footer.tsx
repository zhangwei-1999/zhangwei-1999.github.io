import { profile } from "../data/profile";
import { useLanguage } from "../lib/language";

export function Footer() {
  const { language, t } = useLanguage();
  return (
    <footer className="footer container">
      <div>
        © {new Date().getFullYear()} {t(profile.name)}
        <span className="footer-note">
          {language === "en"
            ? "Once a Thief. A Better Tomorrow."
            : "纵横四海，英雄本色。"}
        </span>
      </div>
      <div className="footer-links">
        <span>
          {language === "en" ? "Updated" : "更新于"}{" "}
          {profile.lastUpdated.slice(0, 7).replace("-", ".")}
        </span>
        <a href={profile.repository}>GitHub ↗</a>
        <a href={`mailto:${profile.email}`}>
          {language === "en" ? "Say hello" : "联系我"} ↗
        </a>
      </div>
    </footer>
  );
}
