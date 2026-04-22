import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig(async () => ({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  clearScreen: false,
  // Two entry HTML files: the main window and the lightweight Quick Capture
  // floating window. Keeping them separate keeps the floating window's bundle
  // free of AppShell, routing, watcher subscriptions, etc.
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, "index.html"),
        "quick-capture": path.resolve(__dirname, "quick-capture.html"),
      },
    },
  },
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
}));
