import { test, expect } from "@playwright/test";
import fs from "node:fs";

test("library readiness persists and delete can be cancelled or confirmed", async ({ page, request }) => {
  const title = `Library fixture ${Date.now()}`;
  const response = await request.post("/api/songs/import", { multipart: {
    title, artist: "Test", lyrics: "An invented line",
    original: { name: "original.wav", mimeType: "audio/wav", buffer: fs.readFileSync("fixtures/demo/original.wav") },
  }});
  expect(response.ok()).toBeTruthy();
  const song = await response.json();
  await page.goto("/");
  const card = page.locator(".song-card").filter({ hasText: title });
  const ready = card.getByRole("button", {name: /^Concert ready:/});
  await ready.hover();
  await expect(card.locator(".readiness-tooltip").last()).toBeVisible();
  await ready.click();
  await expect(ready).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(ready).toHaveAttribute("aria-pressed", "true");
  await expect(card.locator('[aria-pressed="true"]')).toHaveCount(1);
  await page.setViewportSize({width: 390, height: 844});
  await expect(ready).toBeVisible();
  await page.screenshot({path: "test-results/library-readiness-mobile.png"});
  page.once("dialog", dialog => dialog.dismiss());
  await card.getByRole("button", {name: `Delete ${title}`, exact: true}).click();
  await expect(card).toBeVisible();
  page.once("dialog", dialog => dialog.accept());
  await card.getByRole("button", {name: `Delete ${title}`, exact: true}).click();
  await expect(card).toHaveCount(0);
  expect((await request.get(`/api/songs/${song.id}`)).status()).toBe(404);
});
