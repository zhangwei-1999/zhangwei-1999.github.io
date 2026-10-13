import assert from "node:assert/strict";
import test from "node:test";
import { WaterSurface } from "../src/lib/waterSurface.ts";
import { WaveField } from "../src/lib/waveField.ts";
import { appearance } from "../src/data/appearance.ts";

const tint = [128, 166, 190];
const lavender = appearance.water.click.tint;
const render = (surface: WaterSurface) => {
  const pixels = new Uint8ClampedArray(surface.field.height.length * 4);
  surface.shade(pixels, tint, 0.38, lavender);
  return pixels;
};
const normal = (field: WaveField, i: number) =>
  (field.height[i - 1] - field.height[i + 1]) * 0.7 +
  (field.height[i - field.width] - field.height[i + field.width]) * 0.9;

test("ambient-only rendering preserves the existing background exactly", () => {
  const surface = new WaterSurface(100, 80, 0.16);
  const original = new WaveField(100, 80, 0.16, 0.035);
  surface.disturbAmbient(45, 35, 4, 8);
  original.disturb(45, 35, 4, 8);
  for (let i = 0; i < 35; i++) { surface.step(); original.step(); }
  const expected = new Uint8ClampedArray(100 * 80 * 4);
  original.shade(expected, tint, 0.38);
  assert.deepEqual(render(surface), expected);
});

test("clicks are translucent lavender while destructive interference stays transparent", () => {
  const single = new WaterSurface(80, 60, 0.16);
  const cancelled = new WaterSurface(80, 60, 0.16);
  single.disturbClick(40, 30, 2, 2.4);
  cancelled.disturbAmbient(40, 30, 2, -2.4);
  cancelled.disturbClick(40, 30, 2, 2.4);
  for (let i = 0; i < 12; i++) { single.step(); cancelled.step(); }
  const pixels = render(single);
  let visible = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] < 2) continue;
    visible++;
    assert.ok(pixels[i + 2] > pixels[i] && pixels[i] > pixels[i + 1], "Both crests and troughs retain a lavender hue");
    assert.ok(pixels[i + 3] <= 61, "The wave remains translucent");
  }
  assert.ok(visible > 0);
  assert.ok(render(cancelled).every((value, i) => i % 4 !== 3 || value === 0),
    "A colour attribution field must never paint a cancelled wave");
});

test("a click entering an already moving ambient surface reinforces and cancels its existing waves", () => {
  const shared = new WaterSurface(120, 80, 0.16);
  const ambient = new WaterSurface(120, 80, 0.16);
  const click = new WaterSurface(120, 80, 0.16);
  shared.disturbAmbient(45, 40, 3, 6);
  ambient.disturbAmbient(45, 40, 3, 6);
  for (let i = 0; i < 25; i++) { shared.step(); ambient.step(); }
  shared.disturbClick(59, 40, 1.5, 2.4);
  click.disturbClick(59, 40, 1.5, 2.4);
  for (let i = 0; i < 35; i++) { shared.step(); ambient.step(); click.step(); }
  const combinedPixels = render(shared);
  const ambientPixels = render(ambient);
  const clickPixels = render(click);
  let reinforced = 0;
  let cancelled = 0;
  for (let y = 1; y < 79; y++) for (let x = 1; x < 119; x++) {
    const i = y * 120 + x;
    assert.ok(Math.abs(shared.field.height[i] - ambient.field.height[i] - click.field.height[i]) < 0.00003);
    const a = normal(ambient.field, i);
    const c = normal(click.field, i);
    if (Math.min(Math.abs(a), Math.abs(c)) < 0.02) continue;
    const combinedAlpha = combinedPixels[i * 4 + 3];
    const separateAlpha = Math.max(ambientPixels[i * 4 + 3], clickPixels[i * 4 + 3]);
    if (a * c > 0 && combinedAlpha > separateAlpha) reinforced++;
    if (a * c < 0 && combinedAlpha < separateAlpha) cancelled++;
  }
  assert.ok(reinforced > 0, "Meeting crests become brighter in the rendered surface");
  assert.ok(cancelled > 0, "Opposing phases reduce the rendered light instead of alpha-compositing it");
  shared.clear();
  shared.step();
  assert.ok(render(shared).every((value, i) => i % 4 !== 3 || value === 0));
});
