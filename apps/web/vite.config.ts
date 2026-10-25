/// <reference types="vitest/config" />
import { fileURLToPath, URL } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // game-content stays the canonical home for level data (see the spec),
      // so the client imports it from the repo root instead of a copy.
      "@content": fileURLToPath(new URL("../../game-content", import.meta.url)),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    fs: {
      // Level JSON lives outside apps/web by design.
      allow: [fileURLToPath(new URL("../..", import.meta.url))],
    },
  },
  build: {
    // Phaser is a ~1.5 MB engine loaded lazily behind the lab button; it is
    // deliberately split into its own vendor chunk rather than shrunk.
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        manualChunks: {
          phaser: ["phaser"],
        },
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    exclude: ["tests/e2e/**", "node_modules/**", "dist/**"],
  },
});