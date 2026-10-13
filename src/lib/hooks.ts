import { useEffect, useState } from "react";
import { appearance } from "../data/appearance";

export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return reduced;
}

/** Smooth decorative light and local reflections, without React pointer state. */
export function usePointerLight() {
  useEffect(() => {
    const media = window.matchMedia(
      "(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)",
    );
    type Reflection = {
      x: number;
      y: number;
      tx: number;
      ty: number;
      width: number;
      height: number;
      light: number;
      active: boolean;
    };
    const surfaces = new Map<HTMLElement, Reflection>();
    const illumination = document.querySelector<HTMLElement>(
      ".water-illumination",
    );
    const flow = { x: 0, y: 0, tx: 0, ty: 0, light: 0, active: false };
    const flowProperties = [
      "--flow-x",
      "--flow-y",
      "--flow-angle",
      "--flow-active",
    ];
    const properties = [
      "--mouse-x",
      "--mouse-y",
      "--glass-angle",
      "--glass-active",
    ];
    let frame = 0;
    const clear = (element: HTMLElement) => {
      for (const property of properties) element.style.removeProperty(property);
    };
    const reset = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      for (const element of surfaces.keys()) clear(element);
      surfaces.clear();
      Object.assign(flow, {
        x: 0,
        y: 0,
        tx: 0,
        ty: 0,
        light: 0,
        active: false,
      });
      for (const property of flowProperties)
        illumination?.style.removeProperty(property);
    };
    const render = () => {
      frame = 0;
      let moving = false;
      if (illumination && (flow.active || flow.light > 0.001)) {
        const response = Math.min(
          0.3,
          Math.max(0.02, appearance.glass.flowResponse),
        );
        flow.x += (flow.tx - flow.x) * response;
        flow.y += (flow.ty - flow.y) * response;
        flow.light += ((flow.active ? 1 : 0) - flow.light) * response;
        illumination.style.setProperty(
          "--flow-x",
          `${(flow.x * appearance.glass.flowTravel).toFixed(2)}px`,
        );
        illumination.style.setProperty(
          "--flow-y",
          `${(flow.y * appearance.glass.flowTravel * 0.65).toFixed(2)}px`,
        );
        illumination.style.setProperty(
          "--flow-angle",
          `${((flow.x - flow.y * 0.4) * appearance.glass.flowAngle).toFixed(2)}deg`,
        );
        illumination.style.setProperty("--flow-active", flow.light.toFixed(3));
        moving =
          Math.abs(flow.tx - flow.x) > 0.001 ||
          Math.abs(flow.ty - flow.y) > 0.001 ||
          Math.abs((flow.active ? 1 : 0) - flow.light) > 0.001;
        if (!flow.active && !moving) {
          for (const property of flowProperties)
            illumination.style.removeProperty(property);
        }
      }
      const response = Math.min(0.6, Math.max(0.02, appearance.glass.response));
      for (const [element, value] of surfaces) {
        if (!element.isConnected) {
          surfaces.delete(element);
          continue;
        }
        value.x += (value.tx - value.x) * response;
        value.y += (value.ty - value.y) * response;
        value.light += ((value.active ? 1 : 0) - value.light) * response;
        if (!value.active && value.light < 0.005) {
          clear(element);
          surfaces.delete(element);
          continue;
        }
        element.style.setProperty("--mouse-x", `${value.x.toFixed(2)}px`);
        element.style.setProperty("--mouse-y", `${value.y.toFixed(2)}px`);
        element.style.setProperty("--glass-active", value.light.toFixed(3));
        element.style.setProperty(
          "--glass-angle",
          `${(125 + (value.x / value.width) * 50 - (value.y / value.height) * 20).toFixed(2)}deg`,
        );
        moving ||=
          Math.abs(value.x - value.tx) > 0.1 ||
          Math.abs(value.y - value.ty) > 0.1 ||
          Math.abs(value.light - (value.active ? 1 : 0)) > 0.005;
      }
      if (moving) frame = requestAnimationFrame(render);
    };
    const move = (event: PointerEvent) => {
      if (
        !media.matches ||
        !(event.target instanceof Element) ||
        document.hidden
      )
        return;
      flow.tx = Math.max(
        -1,
        Math.min(1, (event.clientX / window.innerWidth) * 2 - 1),
      );
      flow.ty = Math.max(
        -1,
        Math.min(1, (event.clientY / window.innerHeight) * 2 - 1),
      );
      flow.active = true;
      const active = new Set<HTMLElement>();
      const nearest = event.target.closest<HTMLElement>(".ripple-surface");
      const glass = event.target.closest<HTMLElement>(".glass");
      if (nearest) active.add(nearest);
      if (glass) active.add(glass);
      // A control nested inside navigation lights both its own surface and the rim.
      const navigation =
        event.target.closest<HTMLElement>(".liquid-navigation");
      if (navigation) active.add(navigation);
      for (const [element, value] of surfaces)
        value.active = active.has(element);
      for (const element of active) {
        const rect = element.getBoundingClientRect();
        const tx = event.clientX - rect.left;
        const ty = event.clientY - rect.top;
        const previous = surfaces.get(element);
        surfaces.set(element, {
          x: previous?.x ?? tx,
          y: previous?.y ?? ty,
          tx,
          ty,
          width: Math.max(1, rect.width),
          height: Math.max(1, rect.height),
          light: previous?.light ?? 0,
          active: true,
        });
      }
      if (!frame) frame = requestAnimationFrame(render);
    };
    const leave = () => {
      flow.tx = 0;
      flow.ty = 0;
      flow.active = false;
      for (const value of surfaces.values()) value.active = false;
      if (!frame) frame = requestAnimationFrame(render);
    };
    document.addEventListener("pointermove", move, { passive: true });
    document.documentElement.addEventListener("pointerleave", leave);
    media.addEventListener("change", reset);
    document.addEventListener("visibilitychange", reset);
    window.addEventListener("scroll", reset, { passive: true });
    return () => {
      reset();
      document.removeEventListener("pointermove", move);
      document.documentElement.removeEventListener("pointerleave", leave);
      media.removeEventListener("change", reset);
      document.removeEventListener("visibilitychange", reset);
      window.removeEventListener("scroll", reset);
    };
  }, []);
}
