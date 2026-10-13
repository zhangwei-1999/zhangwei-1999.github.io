import { appearance } from "../data/appearance";
import { WaterSurface } from "./waterSurface";

/** CPU work and backing pixels are capped independently of display DPR. */
export function startWaterSimulation(canvas: HTMLCanvasElement) {
  const context = canvas.getContext("2d", { alpha: true });
  if (!context) return () => {};
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  const compact = window.matchMedia("(max-width: 700px)");
  const settings = appearance.water.ambient;
  const clicks = appearance.water.click;
  let surface: WaterSurface;
  let image: ImageData;
  let tint = [128, 166, 190];
  let frame = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let resizeFrame = 0;
  let lastTime = 0;
  let elapsed = 0;
  let cellSize = 5;
  let previousSource: { x: number; y: number } | undefined;
  let recentClicks: number[] = [];
  const stepMs = 1000 / 30;
  const enabled = () => (settings.enabled || clicks.enabled) && !reduced.matches && !document.hidden;

  function palette() {
    const values = getComputedStyle(canvas).getPropertyValue("--water-tint").split(",").map(Number);
    if (values.length === 3 && values.every(Number.isFinite)) tint = values;
  }
  const site = canvas.closest(".site");
  const themeObserver = new MutationObserver(palette);
  if (site) themeObserver.observe(site, { attributes: true, attributeFilter: ["class"] });

  function resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const budget = compact.matches ? 24_000 : 64_000;
    cellSize = Math.max(compact.matches ? 4 : 5, Math.sqrt(width * height / budget));
    canvas.width = Math.max(4, Math.floor(width / cellSize));
    canvas.height = Math.max(4, Math.floor(height / cellSize));
    // c²(dt/dx)² <= 1/2 for the explicit two-dimensional stencil.
    const propagation = Math.min(0.45, (settings.speed / 30 / cellSize) ** 2);
    surface = new WaterSurface(canvas.width, canvas.height, propagation);
    image = context!.createImageData(canvas.width, canvas.height);
    previousSource = undefined;
    recentClicks = [];
    palette();
  }

  function drop() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    let x = width * (0.08 + Math.random() * 0.84);
    let y = height * (0.1 + Math.random() * 0.8);
    // Alternating nearby and independent sources makes interference visible
    // without repeatedly dropping water into a single, fixed location.
    if (previousSource && Math.random() < 0.7) {
      const angle = Math.random() * Math.PI * 2;
      const distance = Math.min(width * 0.4, 130 + Math.random() * 100);
      x = Math.max(width * 0.08, Math.min(width * 0.92, previousSource.x + Math.cos(angle) * distance));
      y = Math.max(height * 0.1, Math.min(height * 0.9, previousSource.y + Math.sin(angle) * distance));
      previousSource = undefined;
    } else previousSource = { x, y };
    const [minimum, maximum] = settings.diameter;
    const scale = Math.min(1, (width * 1.25) / maximum);
    const diameter = (minimum + Math.random() * (maximum - minimum)) * scale;
    const radius = Math.max(1.5, diameter * 0.04 / cellSize);
    surface.disturbAmbient(x / width * canvas.width, y / height * canvas.height, radius, 6 + Math.random() * 3);
  }

  function click(event: MouseEvent) {
    if (!clicks.enabled || !enabled() || !surface || event.button !== 0 || event.detail === 0 ||
      (event.target instanceof Element && event.target.closest("dialog"))) return;
    const now = performance.now();
    recentClicks = recentClicks.filter((time) => now - time < clicks.burstWindowMs);
    // Bound the injected energy during rapid clicking, not the number of DOM nodes.
    if (recentClicks.length >= clicks.maxPerBurst) return;
    recentClicks.push(now);
    const radius = Math.max(1.5, clicks.diameter * 0.1 / cellSize);
    surface.disturbClick(
      event.clientX / window.innerWidth * canvas.width,
      event.clientY / window.innerHeight * canvas.height,
      radius,
      clicks.strength,
    );
  }

  function schedule(initial = false) {
    if (!enabled() || !settings.enabled) return;
    const delay = initial ? 500 : Math.max(500, settings.intervalMs * (1 + (Math.random() * 2 - 1) * settings.intervalVariation));
    timer = setTimeout(() => {
      if (!enabled()) return;
      drop();
      schedule();
    }, delay);
  }

  function render(now: number) {
    if (!enabled()) return;
    elapsed += Math.min(stepMs * 2, Math.max(0, now - lastTime));
    lastTime = now;
    if (elapsed >= stepMs) {
      // At most two steps after a delayed frame: never accumulate catch-up work.
      let steps = 0;
      while (elapsed >= stepMs && steps++ < 2) { surface.step(); elapsed -= stepMs; }
      surface.shade(image.data, tint, settings.opacity, clicks.tint);
      context!.putImageData(image, 0, 0);
    }
    frame = requestAnimationFrame(render);
  }

  function sync() {
    cancelAnimationFrame(frame);
    clearTimeout(timer);
    surface?.clear();
    context!.clearRect(0, 0, canvas.width, canvas.height);
    canvas.dataset.state = enabled() ? "active" : "paused";
    previousSource = undefined;
    recentClicks = [];
    elapsed = 0;
    if (enabled()) {
      resize();
      lastTime = performance.now();
      schedule(true);
      frame = requestAnimationFrame(render);
    }
  }
  function onResize() {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => { if (enabled()) resize(); });
  }
  sync();
  window.addEventListener("resize", onResize, { passive: true });
  document.addEventListener("click", click, { passive: true });
  document.addEventListener("visibilitychange", sync);
  reduced.addEventListener("change", sync);
  return () => {
    cancelAnimationFrame(frame);
    cancelAnimationFrame(resizeFrame);
    clearTimeout(timer);
    themeObserver.disconnect();
    window.removeEventListener("resize", onResize);
    document.removeEventListener("click", click);
    document.removeEventListener("visibilitychange", sync);
    reduced.removeEventListener("change", sync);
    surface?.clear();
    context!.clearRect(0, 0, canvas.width, canvas.height);
  };
}
