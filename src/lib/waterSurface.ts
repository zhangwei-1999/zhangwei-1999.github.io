import { WaveField } from "./waveField";

/** One physical surface. The second field only tracks the click's colour. */
export class WaterSurface {
  readonly field: WaveField;
  private readonly clickOrigin: WaveField;
  private hasClickOrigin = false;

  constructor(width: number, rows: number, propagation: number) {
    this.field = new WaveField(width, rows, propagation, 0.035);
    this.clickOrigin = new WaveField(width, rows, propagation, 0.035);
  }

  disturbAmbient(x: number, y: number, radius: number, amplitude: number) {
    this.field.disturb(x, y, radius, amplitude);
  }

  disturbClick(x: number, y: number, radius: number, amplitude: number) {
    // The impulse enters the already-moving surface, never a separate canvas.
    this.field.disturb(x, y, radius, amplitude);
    this.clickOrigin.disturb(x, y, radius, amplitude);
    this.hasClickOrigin = true;
  }

  step() {
    this.field.step();
    if (this.hasClickOrigin) this.clickOrigin.step();
  }

  shade(pixels: Uint8ClampedArray, tint: readonly number[], opacity: number, clickTint: readonly number[]) {
    this.field.shade(pixels, tint, opacity, this.hasClickOrigin
      ? { height: this.clickOrigin.height, tint: clickTint }
      : undefined);
  }

  clear() {
    this.field.clear();
    this.clickOrigin.clear();
    this.hasClickOrigin = false;
  }
}
