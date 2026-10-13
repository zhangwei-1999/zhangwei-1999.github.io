import { useEffect } from "react";
import { RouterProvider, useRouter, Link } from "./lib/router";
import { LanguageProvider, useLanguage } from "./lib/language";
import { usePointerLight } from "./lib/hooks";
import { pageMeta } from "./lib/seo";
import { Navbar } from "./components/Navbar";
import { WaterBackground } from "./components/WaterBackground";
import { Footer } from "./components/Footer";
import { Home } from "./pages/Home";
import { Publications } from "./pages/Publications";
import { NewsPage } from "./pages/News";
import { Awards } from "./pages/Awards";
import { Gallery } from "./pages/Gallery";
import { gallery } from "./data/gallery";
import { GallerySessionProvider } from "./lib/gallerySession";

function Site() {
  const { path } = useRouter();
  const { language } = useLanguage();
  usePointerLight();
  const theme = path.startsWith("/gallery")
    ? "warm-theme"
    : path === "/publications"
      ? "publications-theme"
      : path === "/news"
        ? "news-theme"
        : path === "/awards"
          ? "awards-theme"
          : "home-theme";
  useEffect(() => {
    const meta = pageMeta(path, language);
    document.title = meta.title;
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute("content", meta.description);
    document
      .querySelector('meta[property="og:title"]')
      ?.setAttribute("content", meta.title);
    document
      .querySelector('meta[property="og:description"]')
      ?.setAttribute("content", meta.description);
    const configuredSite = document.getElementById("root")?.dataset.siteUrl;
    const canonical = configuredSite
      ? new URL(path === "/" ? "" : `${path.slice(1)}/`, configuredSite).href
      : new URL(window.location.pathname, window.location.origin).href;
    document
      .querySelector('link[rel="canonical"]')
      ?.setAttribute("href", canonical);
    document
      .querySelector('meta[property="og:url"]')
      ?.setAttribute("content", canonical);
    const knownRoute = [
      "/",
      "/publications",
      "/news",
      "/awards",
      "/gallery",
      ...gallery.map((album) => `/gallery/${album.slug}`),
    ].includes(path);
    document
      .querySelector('meta[name="robots"]')
      ?.setAttribute(
        "content",
        knownRoute ? "index, follow" : "noindex, follow",
      );
  }, [path, language]);
  let page;
  if (path === "/") page = <Home />;
  else if (path === "/publications") page = <Publications />;
  else if (path === "/news") page = <NewsPage />;
  else if (path === "/awards") page = <Awards />;
  else if (path === "/gallery" || /^\/gallery\/[^/]+$/.test(path))
    page = <Gallery key={path} language={language} slug={path.split("/")[2]} />;
  else
    page = (
      <div className="page-heading not-found">
        <p className="eyebrow">404</p>
        <h1>
          {language === "en"
            ? "A little off the path."
            : "似乎走到了小路之外。"}
        </h1>
        <Link className="button button-primary" to="/">
          {language === "en" ? "Return home" : "返回首页"} →
        </Link>
      </div>
    );
  return (
    <div className={`site ${theme}`}>
      <a href="#main" className="skip-link">
        {language === "en" ? "Skip to content" : "跳转到正文"}
      </a>
      <WaterBackground />
      <Navbar />
      <main
        id="main"
        className="container page-transition"
        tabIndex={-1}
        key={path}
      >
        {page}
      </main>
      <Footer />
    </div>
  );
}
export function App({ initialPath = "/" }: { initialPath?: string }) {
  return (
    <LanguageProvider>
      <RouterProvider initialPath={initialPath}>
        <GallerySessionProvider><Site /></GallerySessionProvider>
      </RouterProvider>
    </LanguageProvider>
  );
}
