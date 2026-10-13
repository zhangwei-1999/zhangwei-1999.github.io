import { useEffect, useRef, useState } from "react";
import { Link, routeHref, useRouter } from "../lib/router";
import { useLanguage } from "../lib/language";
import { Icon } from "./Icon";
import { profile } from "../data/profile";
import { GlassRefraction } from "./GlassRefraction";

export const navigation = [
  { path: "/", en: "Home", zh: "首页" },
  { path: "/publications", en: "Publications", zh: "学术论文" },
  { path: "/news", en: "News", zh: "近期动态" },
  { path: "/awards", en: "Awards", zh: "荣誉奖项" },
  { path: "/gallery", en: "Gallery", zh: "生活相册" },
];

export function Navbar() {
  const { path } = useRouter();
  const { language, setLanguage } = useLanguage();
  const [open, setOpen] = useState(false);
  const handle = useRef<HTMLButtonElement>(null);
  const navigationElement = useRef<HTMLElement>(null);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const focusFrame = useRef(0);
  const pointerInside = useRef(false);
  const keyboardInteraction = useRef(false);
  const restoringFocus = useRef(false);

  function cancelClose() {
    clearTimeout(leaveTimer.current);
  }

  function close(restoreFocus = false) {
    cancelClose();
    setOpen(false);
    if (restoreFocus) {
      restoringFocus.current = true;
      focusFrame.current = requestAnimationFrame(() => {
        handle.current?.focus({ preventScroll: true });
        restoringFocus.current = false;
      });
    }
  }

  function deferClose() {
    cancelClose();
    // A short grace period makes moving across the softly rounded edge forgiving.
    leaveTimer.current = setTimeout(() => {
      const focusedInside = navigationElement.current?.contains(document.activeElement);
      if (!pointerInside.current && !(keyboardInteraction.current && focusedInside)) {
        setOpen(false);
      }
    }, 280);
  }

  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Tab") keyboardInteraction.current = true;
      if (event.key === "Escape" && open) {
        event.preventDefault();
        clearTimeout(leaveTimer.current);
        setOpen(false);
        restoringFocus.current = true;
        focusFrame.current = requestAnimationFrame(() => {
          handle.current?.focus({ preventScroll: true });
          restoringFocus.current = false;
        });
      }
    };
    const pointer = (event: PointerEvent) => {
      keyboardInteraction.current = false;
      if (!navigationElement.current?.contains(event.target as Node)) {
        clearTimeout(leaveTimer.current);
        setOpen(false);
      }
    };
    window.addEventListener("keydown", keyboard);
    window.addEventListener("pointerdown", pointer);
    return () => {
      window.removeEventListener("keydown", keyboard);
      window.removeEventListener("pointerdown", pointer);
    };
  }, [open]);

  useEffect(() => () => {
    clearTimeout(leaveTimer.current);
    cancelAnimationFrame(focusFrame.current);
  }, []);

  function followLink() {
    // Desktop navigation stays unfolded under the pointer. Touch navigation
    // returns to the small handle after selecting a destination.
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) close();
  }

  return (
    <header className="nav-wrap container" data-state={open ? "expanded" : "collapsed"}>
      <nav
        ref={navigationElement}
        className="navbar glass liquid-navigation ripple-surface"
        aria-label={language === "en" ? "Main navigation" : "主导航"}
        onPointerEnter={(event) => {
          if (event.pointerType === "touch" || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
          pointerInside.current = true;
          cancelClose();
          setOpen(true);
        }}
        onPointerLeave={(event) => {
          if (event.pointerType === "touch") return;
          pointerInside.current = false;
          deferClose();
        }}
        onFocusCapture={(event) => {
          if (restoringFocus.current) return;
          if (event.target.matches(":focus-visible")) keyboardInteraction.current = true;
          if (keyboardInteraction.current) {
            cancelClose();
            setOpen(true);
          }
        }}
        onBlurCapture={(event) => {
          if (keyboardInteraction.current && !event.currentTarget.contains(event.relatedTarget)) deferClose();
        }}
      >
        <GlassRefraction target={navigationElement} />
        <button
          ref={handle}
          className="nav-peek"
          aria-expanded={open}
          aria-controls="navigation-content"
          aria-label={language === "en" ? "Open navigation" : "打开导航"}
          tabIndex={open ? -1 : 0}
          onClick={() => { cancelClose(); setOpen(true); }}
        >
          <span className="nav-peek-line" aria-hidden="true" />
        </button>
        <div className="nav-content" id="navigation-content" inert={!open} aria-hidden={!open}>
          <Link
            to="/"
            className="brand ripple-surface"
            aria-label={`${profile.name[language]} — ${language === "en" ? "Home" : "首页"}`}
            onClick={followLink}
          >
            {profile.name.en.charAt(0).toLowerCase()}
            <span className="brand-dot">.</span>
          </Link>
          <div className="nav-links" id="navigation-links">
            {navigation.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className="nav-link ripple-surface"
                aria-current={
                  (item.path === "/" ? path === "/" : path.startsWith(item.path))
                    ? "page"
                    : undefined
                }
                onClick={followLink}
              >
                {item[language]}
              </Link>
            ))}
          </div>
          <div className="nav-controls">
            <div className="language-toggle" role="group" aria-label={language === "en" ? "Language" : "语言"}>
              <button className="ripple-surface" lang="en" aria-pressed={language === "en"} onClick={() => setLanguage("en")}>
                EN
              </button>
              <span aria-hidden="true">/</span>
              <button className="ripple-surface" lang="zh-CN" aria-pressed={language === "zh"} onClick={() => setLanguage("zh")}>
                中文
              </button>
            </div>
            <button
              className="nav-dismiss icon-button ripple-surface"
              aria-expanded={open}
              aria-controls="navigation-content"
              aria-label={language === "en" ? "Close navigation" : "收起导航"}
              onClick={() => close(true)}
            >
              <Icon name="close" />
            </button>
          </div>
        </div>
      </nav>
      <noscript>
        <style>{`.nav-wrap > .navbar { display: none; } .nav-wrap { height: auto; }`}</style>
        <nav className="nav-static" aria-label="Navigation without JavaScript">
          {navigation.map((item) => (
            <a key={item.path} href={routeHref(item.path)}>{item[language]}</a>
          ))}
        </nav>
      </noscript>
    </header>
  );
}
