import { profile } from "../data/profile";
import { gallery } from "../data/gallery";
import type { Language } from "../types";

export function pageMeta(path: string, language: Language = "en") {
  const titles: Record<string, { en: string; zh: string }> = {
    "/": { en: "Home", zh: "首页" },
    "/publications": { en: "Publications", zh: "学术论文" },
    "/news": { en: "News", zh: "近期动态" },
    "/awards": { en: "Awards", zh: "荣誉奖项" },
    "/gallery": { en: "Gallery", zh: "生活相册" },
  };
  const album = gallery.find((item) => path === `/gallery/${item.slug}`);
  const section =
    album?.title[language] ??
    titles[path]?.[language] ??
    (language === "en" ? "Page not found" : "页面未找到");
  return {
    title: `${section} · ${profile.name[language]} | ${profile.institutionShort}`,
    description: `${profile.name[language]} · ${profile.role[language]} · ${profile.institution[language]}. ${profile.tagline[language]}`,
  };
}
