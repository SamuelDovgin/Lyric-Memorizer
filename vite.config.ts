import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    proxy: {
      "/api": process.env.LYRIC_WORKER_URL ?? "http://127.0.0.1:8765",
      "/media": process.env.LYRIC_WORKER_URL ?? "http://127.0.0.1:8765",
    },
  },
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
  },
});
