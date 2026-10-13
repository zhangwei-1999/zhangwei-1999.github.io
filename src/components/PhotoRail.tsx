import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { Language } from "../types";

/** Native touch scrolling plus a real slider, including on macOS with hidden scrollbars. */
export function PhotoRail({ label, language, children }: { label: string; language: Language; children: ReactNode }) {
  const id = useId();
  const rail = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState(0);
  const [overflow, setOverflow] = useState(false);

  useEffect(() => {
    const element = rail.current;
    if (!element) return;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const maximum = element.scrollWidth - element.clientWidth;
        setOverflow(maximum > 2);
        setPosition(maximum > 0 ? Math.round(element.scrollLeft / maximum * 1000) : 0);
      });
    };
    const observer = new ResizeObserver(update);
    observer.observe(element);
    if (track.current) observer.observe(track.current);
    element.addEventListener("scroll", update, { passive: true });
    update();
    return () => { observer.disconnect(); element.removeEventListener("scroll", update); cancelAnimationFrame(frame); };
  }, []);

  return <div className={`photo-rail${overflow ? " photo-rail--scrollable" : ""}`}>
    <div className="photo-rail__viewport" id={id} ref={rail} role="region" aria-label={label} tabIndex={overflow ? 0 : undefined}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const element = event.currentTarget;
        const left = event.key === "Home" ? 0 : event.key === "End" ? element.scrollWidth
          : element.scrollLeft + element.clientWidth * (event.key === "ArrowRight" ? .65 : -.65);
        element.scrollTo({ left, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
      }}>
      <div className="photo-rail__track" ref={track}>{children}</div>
    </div>
    {overflow && <div className="photo-rail__scrollbar">
      <input type="range" min="0" max="1000" step="1" value={position} aria-label={language === "zh" ? `${label}：横向浏览照片` : `${label}: scroll photographs`} aria-controls={id} aria-valuetext={`${Math.round(position / 10)}%`}
        onChange={(event) => {
          const next = Number(event.target.value);
          setPosition(next);
          if (rail.current) rail.current.scrollLeft = (rail.current.scrollWidth - rail.current.clientWidth) * next / 1000;
        }} />
      <span aria-hidden="true">{language === "zh" ? "轻轻滑动，慢慢翻看" : "A little further along"}<span>↔</span></span>
    </div>}
  </div>;
}
