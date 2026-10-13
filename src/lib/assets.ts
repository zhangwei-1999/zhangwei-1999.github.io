export function assetUrl(path: string) {
  if (/^(https?:|mailto:|data:|blob:|#)/.test(path)) return path;
  const base = import.meta.env?.BASE_URL ?? process.env.PAGES_BASE_PATH ?? "/";
  return `${base}${path.replace(/^\//, "")}`;
}
