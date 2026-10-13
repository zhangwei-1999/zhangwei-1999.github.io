import { useEffect, useState } from "react";
import { quotes } from "../data/quotes";
import { useReducedMotion } from "../lib/hooks";
import { Icon } from "./Icon";
import type { Language } from "../types";

export function QuotePanel({ language }: { language: Language }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const reducedMotion = useReducedMotion();
  const canRotate =
    quotes.length > 1 && !reducedMotion && !paused && !hovered && !focused;

  useEffect(() => {
    if (!canRotate) return;
    const timer = window.setInterval(
      () => setIndex((value) => (value + 1) % quotes.length),
      10_000,
    );
    return () => window.clearInterval(timer);
  }, [canRotate]);

  const quote = quotes[index % quotes.length];
  const showQuote = (value: number) =>
    setIndex((value + quotes.length) % quotes.length);
  return (
    <section
      className="glass quote-panel"
      aria-label={language === "zh" ? "片刻思绪" : "A thought to keep"}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          setFocused(false);
      }}
    >
      <p className="eyebrow">
        {language === "zh" ? "片刻思绪" : "A thought to keep"}
      </p>
      <span className="quote-mark" aria-hidden="true">
        “
      </span>
      <div
        className="quote-stage"
        aria-live={canRotate ? "off" : "polite"}
        aria-atomic="true"
      >
        {quote ? (
          <figure className="quote-content" key={index}>
            <blockquote lang="en">{quote.text}</blockquote>
            {quote.author && quote.author !== "—" && (
              <figcaption lang="en">— {quote.author}</figcaption>
            )}
          </figure>
        ) : (
          <p className="quote-empty">
            {language === "zh"
              ? "为下一句带来灵感的话，留一片空白。"
              : "A little room for the next inspiring thought."}
          </p>
        )}
      </div>
      {quotes.length > 1 && (
        <div className="quote-controls">
          <div
            className="quote-navigation"
            role="group"
            aria-label={language === "zh" ? "切换名言" : "Choose a quote"}
          >
            <button
              type="button"
              className="quote-step quote-step--previous ripple-surface"
              aria-label={language === "zh" ? "上一句" : "Previous quote"}
              onClick={() => showQuote(index - 1)}
            >
              <Icon name="arrow" size={20} />
            </button>
            <div className="quote-dots">
              {quotes.map((_, dot) => (
                <button
                  type="button"
                  className={dot === index ? "active" : ""}
                  key={dot}
                  aria-label={
                    language === "zh"
                      ? `显示第 ${dot + 1} 句`
                      : `Show quote ${dot + 1}`
                  }
                  aria-current={dot === index ? "true" : undefined}
                  onClick={() => showQuote(dot)}
                />
              ))}
            </div>
            <button
              type="button"
              className="quote-step ripple-surface"
              aria-label={language === "zh" ? "下一句" : "Next quote"}
              onClick={() => showQuote(index + 1)}
            >
              <Icon name="arrow" size={20} />
            </button>
          </div>
          {reducedMotion ? (
            <span className="quote-motion-label">
              {language === "zh" ? "已关闭自动切换" : "Auto-rotation off"}
            </span>
          ) : (
            <button
              type="button"
              className="quote-pause"
              onClick={() => setPaused((value) => !value)}
              aria-pressed={paused}
            >
              <span aria-hidden="true">{paused ? "▷" : "Ⅱ"}</span>{" "}
              {paused
                ? language === "zh"
                  ? "继续"
                  : "Resume"
                : language === "zh"
                  ? "暂停"
                  : "Pause"}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
