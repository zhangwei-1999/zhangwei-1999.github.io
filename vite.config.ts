import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: process.env.PAGES_BASE_PATH || "/",
  server: {
    fs: { deny: [".env", ".env.*", "*.{crt,pem}", "**/.git/**", "**/.private/**", "**/.dev.vars*", "**/.wrangler/**"] },
  },
  build: { target: "es2022", assetsInlineLimit: 4096 },
});
