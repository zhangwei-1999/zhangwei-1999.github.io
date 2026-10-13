import assert from "node:assert/strict";
import test from "node:test";
import { WaveField } from "../src/lib/waveField.ts";

const advance = (field: WaveField, steps: number) => {
  for (let i = 0; i < steps; i++) field.step();
};
const peak = (field: WaveField) => field.height.reduce((largest, height) => Math.max(largest, Math.abs(height)), 0);

test("opposite water disturbances cancel while matching waves reinforce", () => {
  const single = new WaveField(90, 70);
  const doubled = new WaveField(90, 70);
  const cancelled = new WaveField(90, 70);
  single.disturb(45, 35, 3, 6);
  doubled.disturb(45, 35, 3, 6);
  doubled.disturb(45, 35, 3, 6);
  cancelled.disturb(45, 35, 3, 6);
  cancelled.disturb(45, 35, 3, -6);
  for (const field of [single, doubled, cancelled]) advance(field, 45);
  assert.ok(peak(single) > 0.02);
  assert.ok(Math.abs(peak(doubled) / peak(single) - 2) < 0.0001);
  assert.ok(peak(cancelled) < 0.00001, "Destructive interference removes the surface displacement");
});

test("separate moving waves share their signed displacement when they meet", () => {
  const left = new WaveField(100, 80);
  const right = new WaveField(100, 80);
  const combined = new WaveField(100, 80);
  left.disturb(37, 40, 3, 6);
  right.disturb(63, 40, 3, -4);
  combined.disturb(37, 40, 3, 6);
  combined.disturb(63, 40, 3, -4);
  for (const field of [left, right, combined]) advance(field, 42);
  const middle = 40 * 100 + 50;
  assert.ok(Math.abs(left.height[middle]) > 0.001);
  assert.ok(left.height[middle] * right.height[middle] < 0);
  for (let i = 0; i < combined.height.length; i++) {
    assert.ok(Math.abs(combined.height[i] - left.height[i] - right.height[i]) < 0.00003);
  }
});

test("surface waves propagate, dissipate and stay stable at the maximum speed", () => {
  const field = new WaveField(100, 80, 0.45);
  field.disturb(50, 40, 2, 8);
  const initial = peak(field);
  advance(field, 24);
  assert.ok(Math.abs(field.height[40 * 100 + 62]) > 0.001);
  assert.ok(peak(field) < initial);
  advance(field, 800);
  assert.ok(field.height.every(Number.isFinite));
  assert.ok(peak(field) < initial * 0.01);
  field.clear();
  advance(field, 2);
  assert.equal(peak(field), 0);
});
