/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";

const version = readFileSync(new URL("./VERSION", import.meta.url), "utf8").trim();

// Relative base so the same build works on GitHub Pages, in Tauri, and inside Steam's in-game browser.
export default defineConfig({
  base: "./",
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(version) },
  clearScreen: false,
  server: { port: 5173, strictPort: true },
  build: { target: "es2021", outDir: "dist" },
  test: { environment: "node" },
});
