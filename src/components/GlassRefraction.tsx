import { useEffect, useId, useRef, type RefObject } from "react";
import { appearance } from "../data/appearance";

/** A rounded lens bends only the background near the navigation's edge.
 * The small displacement texture is generated after resizing settles. During
 * the navigation morph, the existing lens stretches with the glass surface.
 * Browsers without SVG backdrop support retain the CSS material underneath.
 */
export function GlassRefraction({
  target,
}: {
  target: RefObject<HTMLElement | null>;
}) {
  const id = `glass-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const image = useRef<SVGFEImageElement>(null);

  useEffect(() => {
    const element = target.current;
    const map = image.current;
    if (
      !element ||
      !map ||
      !CSS.supports("backdrop-filter", 'url("#lens") blur(10px)')
    )
      return;
    const media = window.matchMedia(
      "(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)",
    );
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) return;
    let frame = 0;
    let resizeTimer: ReturnType<typeof setTimeout> | undefined;
    let previousSize = "";
    const disable = () => {
      element.classList.remove("has-refraction");
      element.style.removeProperty("--refraction-filter");
    };
    const update = () => {
      frame = 0;
      if (!media.matches || !appearance.glass.refraction) {
        disable();
        return;
      }
      const bounds = element.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      const ratio = Math.min(1, 640 / bounds.width);
      const width = Math.ceil(bounds.width * ratio);
      const height = Math.ceil(bounds.height * ratio);
      const size = `${width}:${height}`;
      if (size !== previousSize) {
        previousSize = size;
        canvas.width = width;
        canvas.height = height;
        const pixels = context.createImageData(width, height);
        const radius = height / 2;
        const rim = Math.max(4, 12 * ratio);
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const centerX = Math.max(radius, Math.min(width - radius, x + 0.5));
            const dx = x + 0.5 - centerX;
            const dy = y + 0.5 - radius;
            const distance = Math.hypot(dx, dy);
            const depth = radius - distance;
            const strength =
              depth >= 0 && depth < rim ? Math.pow(1 - depth / rim, 2) : 0;
            const offset = (y * width + x) * 4;
            pixels.data[offset] =
              128 + (distance ? dx / distance : 0) * 100 * strength;
            pixels.data[offset + 1] =
              128 + (distance ? dy / distance : 0) * 100 * strength;
            pixels.data[offset + 2] = 128;
            pixels.data[offset + 3] = 255;
          }
        }
        context.putImageData(pixels, 0, 0);
        map.setAttribute("href", canvas.toDataURL("image/png"));
      }
      element.style.setProperty("--refraction-filter", `url("#${id}")`);
      element.classList.add("has-refraction");
    };
    const cancelUpdate = () => {
      cancelAnimationFrame(frame);
      clearTimeout(resizeTimer);
    };
    const scheduleResize = () => {
      cancelUpdate();
      // ResizeObserver fires on every animation frame while the bar unfolds.
      // Retain the existing PNG until the final geometry has stayed still.
      resizeTimer = setTimeout(() => {
        frame = requestAnimationFrame(update);
      }, 80);
    };
    const changePreference = () => {
      cancelUpdate();
      // Reduce Motion and pointer changes must take effect immediately.
      update();
    };
    const observer = new ResizeObserver(scheduleResize);
    observer.observe(element);
    media.addEventListener("change", changePreference);
    update();
    return () => {
      cancelUpdate();
      observer.disconnect();
      media.removeEventListener("change", changePreference);
      disable();
    };
  }, [id, target]);

  return (
    <svg
      className="glass-filter-definitions"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <filter
          id={id}
          x="0"
          y="0"
          width="100%"
          height="100%"
          colorInterpolationFilters="sRGB"
        >
          <feImage
            ref={image}
            x="0"
            y="0"
            width="100%"
            height="100%"
            preserveAspectRatio="none"
            result="lens-map"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="lens-map"
            scale={appearance.glass.refraction}
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      </defs>
    </svg>
  );
}
