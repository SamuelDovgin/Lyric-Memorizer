import { defineConfig } from "@playwright/test";
import os from "node:os";
import path from "node:path";
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  use: {
    baseURL: "http://127.0.0.1:5174",
    viewport: { width: 1440, height: 960 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    launchOptions: { args: ["--autoplay-policy=no-user-gesture-required"] },
  },
  webServer: [
    { command: "node scripts/serve-pages-test.mjs", url: "http://127.0.0.1:5175/docs/", reuseExistingServer: false },
    {
      command: "python3 -m uvicorn services.audio_worker.app:app --port 8766",
      url: "http://127.0.0.1:8766/api/health",
      env: {
        LYRIC_MEMORIZER_DATA_DIR: path.join(
          os.tmpdir(),
          "lyric-rehearsal-browser-tests",
        ),
      },
      reuseExistingServer: false,
    },
    {
      command: "npm run dev:web -- --host 127.0.0.1 --port 5174",
      url: "http://127.0.0.1:5174",
      env: { LYRIC_WORKER_URL: "http://127.0.0.1:8766" },
      reuseExistingServer: false,
    },
  ],
});
