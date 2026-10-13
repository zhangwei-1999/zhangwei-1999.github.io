import { useEffect, useRef } from "react";
import { startWaterSimulation } from "../lib/waterSimulation";

/** Ambient drops and small lavender clicks disturb the same water surface. */
export function WaterBackground() {
  const waterRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = waterRef.current;
    return canvas ? startWaterSimulation(canvas) : undefined;
  }, []);

  return (
    <div className="water-background" aria-hidden="true">
      <div className="water-illumination">
        <div className="water-light water-light-one" />
        <div className="water-light water-light-two" />
        <div className="water-sheen" />
      </div>
      <div className="water-grain" />
      <canvas ref={waterRef} className="water-wave-field" width={1} height={1} />
    </div>
  );
}
