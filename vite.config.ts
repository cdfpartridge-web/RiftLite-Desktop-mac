import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react()],
  root: ".",
  base: "./",
  build: {
    outDir: "dist/renderer",
    // Only renderer output is cleared; Electron and preload builds are siblings.
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, "index.html")
    }
  },
  server: {
    port: 5173,
    strictPort: true
  }
});
