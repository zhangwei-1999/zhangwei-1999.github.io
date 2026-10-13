/** A damped, linear shallow-water wave equation on a fixed spatial grid.
 * Heights add before surface normals are shaded, so overlapping waves really
 * reinforce/cancel each other instead of compositing independent ring images.
 */
export class WaveField {
  height: Float32Array;
  private previous: Float32Array;
  private next: Float32Array;
  private absorption: Float32Array;

  constructor(
    readonly width: number,
    readonly rows: number,
    readonly propagation = 0.16,
    readonly damping = 0.04,
  ) {
    if (width < 4 || rows < 4 || propagation <= 0 || propagation > 0.48 || damping < 0 || damping >= 1) {
      throw new Error("Wave grid parameters must stay within the 2D stability limit.");
    }
    this.height = new Float32Array(width * rows);
    this.previous = new Float32Array(width * rows);
    this.next = new Float32Array(width * rows);
    this.absorption = new Float32Array(width * rows);
    const edge = Math.min(12, width / 6, rows / 6);
    for (let y = 0; y < rows; y++) for (let x = 0; x < width; x++) {
      const distance = Math.min(x, y, width - 1 - x, rows - 1 - y);
      const sponge = Math.max(0, 1 - distance / edge);
      this.absorption[y * width + x] = 1 - sponge * sponge * 0.14;
    }
  }

  /** A smooth, zero-volume displacement keeps the resting surface level. */
  disturb(x: number, y: number, radius: number, amplitude: number) {
    const sigma = Math.max(1.5, radius);
    const extent = Math.ceil(sigma * 4);
    for (let row = Math.max(1, Math.floor(y - extent)); row < Math.min(this.rows - 1, y + extent); row++) {
      for (let column = Math.max(1, Math.floor(x - extent)); column < Math.min(this.width - 1, x + extent); column++) {
        const distance = ((column - x) ** 2 + (row - y) ** 2) / (2 * sigma * sigma);
        const displacement = amplitude * (1 - distance) * Math.exp(-distance);
        const index = row * this.width + column;
        // No initial velocity: the disturbance spreads into its neighbours.
        this.height[index] += displacement;
        this.previous[index] += displacement;
      }
    }
  }

  step() {
    const { height, previous, next, width, rows, propagation, damping, absorption } = this;
    for (let y = 1; y < rows - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const i = y * width + x;
        const laplacian = height[i - 1] + height[i + 1] + height[i - width] + height[i + width] - 4 * height[i];
        next[i] = ((2 - damping) * height[i] - (1 - damping) * previous[i] + propagation * laplacian) * absorption[i];
      }
    }
    this.previous = height;
    this.height = next;
    this.next = previous;
  }

  clear() {
    this.height.fill(0);
    this.previous.fill(0);
    this.next.fill(0);
  }

  /** Directional soft light from the normal of the shared water surface. */
  shade(
    pixels: Uint8ClampedArray,
    tint: readonly number[],
    opacity: number,
    pigment?: { height: Float32Array; tint: readonly number[] },
  ) {
    const { height, width, rows } = this;
    for (let y = 1; y < rows - 1; y++) for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const normal = (height[i - 1] - height[i + 1]) * 0.7 + (height[i - width] - height[i + width]) * 0.9;
      const light = normal > 0;
      const offset = i * 4;
      let blend = 0;
      if (pigment) {
        const ink = pigment.height;
        const clickNormal = (ink[i - 1] - ink[i + 1]) * 0.7 + (ink[i - width] - ink[i + width]) * 0.9;
        // Attribution affects colour only. Opacity always comes from the
        // combined surface, including cancellation with ambient waves.
        blend = Math.abs(clickNormal) / (Math.abs(clickNormal) + Math.abs(normal - clickNormal) + 0.00001);
      }
      for (let channel = 0; channel < 3; channel++) {
        const base = light ? 255 : tint[channel];
        const lavender = pigment?.tint[channel] ?? base;
        const accent = light ? lavender + (255 - lavender) * 0.6 : lavender;
        pixels[offset + channel] = base + (accent - base) * blend;
      }
      pixels[offset + 3] = Math.min(0.62, Math.abs(normal) * 0.45) * opacity * 255;
    }
  }
}
