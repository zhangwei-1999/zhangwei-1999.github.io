import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";

const [input, output, width = "1600"] = process.argv.slice(2);
if (
  !input ||
  !output ||
  !output.endsWith(".webp") ||
  !Number.isInteger(Number(width)) ||
  Number(width) < 1
) {
  console.error(
    "Usage: npm run optimize:image -- input.jpg public/gallery/photo.webp [max-width]",
  );
  process.exit(1);
}
await mkdir(dirname(output), { recursive: true });
const result = await sharp(input)
  .rotate()
  .resize({ width: Number(width), withoutEnlargement: true })
  .webp({ quality: 82 })
  .toFile(output);
console.info(
  `${output}: ${result.width} × ${result.height}, ${Math.round(result.size / 1024)} KB`,
);
