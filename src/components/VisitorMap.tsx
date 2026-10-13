import { useEffect, useRef, useState } from "react";
import { visitorWidgetUrl, visitors } from "../data/visitors";
import { useLanguage } from "../lib/language";
import { assetUrl } from "../lib/assets";
import { Icon } from "./Icon";

type MapStatus = "waiting" | "loading" | "ready" | "unavailable";

export function VisitorMap() {
  const { language } = useLanguage();
  const sectionRef = useRef<HTMLElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [active, setActive] = useState(false);
  const [status, setStatus] = useState<MapStatus>("waiting");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const section = sectionRef.current;
    if (!visitors.enabled || !section) return;
    function loadWidget() {
      setStatus("loading");
      setActive(true);
    }
    // Keep the counter off the critical path: the frame is not mounted until
    // the reader reaches this section. Unmounting Home also destroys its realm.
    const observer =
      typeof IntersectionObserver === "undefined"
        ? null
        : new IntersectionObserver((entries) => {
            if (entries.some((entry) => entry.isIntersecting)) {
              loadWidget();
              observer?.disconnect();
            }
          });
    if (observer) observer.observe(section);
    else loadWidget();
    return () => observer?.disconnect();
  }, []);

  useEffect(() => {
    if (!active) return;
    const timeout = setTimeout(() => setStatus("unavailable"), 15_000);
    function receiveStatus(event: MessageEvent) {
      if (
        event.source !== frameRef.current?.contentWindow ||
        !event.data ||
        event.data.type !== "academic-visitor-map" ||
        (event.data.status !== "ready" && event.data.status !== "unavailable")
      ) return;
      clearTimeout(timeout);
      setStatus(event.data.status);
    }
    window.addEventListener("message", receiveStatus);
    return () => {
      clearTimeout(timeout);
      window.removeEventListener("message", receiveStatus);
    };
  }, [active, attempt]);

  if (!visitors.enabled) return null;
  return (
    <section
      className="visitor-section section-block"
      ref={sectionRef}
      aria-labelledby="visitor-map-title"
    >
      <div className="visitor-card glass">
        <header className="visitor-heading">
          <h2 id="visitor-map-title">
            {language === "en" ? "From around the world" : "来自世界的足迹"}
          </h2>
          <a
            className="visitor-details"
            href={visitors.statisticsUrl}
            target="_blank"
            rel="noreferrer"
            aria-label={language === "en" ? "View visitor history on MapMyVisitors" : "在 MapMyVisitors 查看访客统计"}
          >
            <span className="visitor-details-label">
              {language === "en" ? "Visitor history" : "访客统计"}
            </span>
            <Icon name="arrow" size={15} />
          </a>
        </header>
        <div className="visitor-map-frame" data-status={status}>
          {active && (
            <iframe
              key={attempt}
              ref={frameRef}
              className="visitor-widget"
              tabIndex={status === "ready" ? 0 : -1}
              title={language === "en" ? "Visitor map" : "访客地图"}
              sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
              referrerPolicy="strict-origin-when-cross-origin"
              src={`${assetUrl("visitor-map.html")}?widget=${encodeURIComponent(visitorWidgetUrl())}`}
              onError={() => setStatus("unavailable")}
            />
          )}
          {status !== "ready" && (
            <div className="visitor-placeholder" role="status">
              <svg viewBox="0 0 80 80" aria-hidden="true">
                <circle cx="40" cy="40" r="30" />
                <ellipse cx="40" cy="40" rx="14" ry="30" />
                <path d="M10 40h60M16 22c15 8 33 8 48 0M16 58c15-8 33-8 48 0" />
              </svg>
              <span>
                {status === "unavailable"
                  ? language === "en"
                    ? "The visitor map is temporarily unavailable."
                    : "访客地图暂时无法加载。"
                  : language === "en"
                    ? "Connecting to the visitor map…"
                    : "正在连接访客地图…"}
              </span>
              {status === "unavailable" && (
                <button
                  className="text-link visitor-retry"
                  onClick={() => {
                    setStatus("loading");
                    setAttempt((value) => value + 1);
                  }}
                >
                  {language === "en" ? "Try again" : "重新加载"}
                  <Icon name="arrow" size={14} />
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
