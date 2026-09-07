import { test, expect, type APIRequestContext } from "@playwright/test";
import fs from "node:fs";
async function seed(request: APIRequestContext) {
  const title = `Evening Light ${Date.now()}`;
  const response = await request.post("/api/songs/import", {
    multipart: {
      title,
      artist: "Rehearsal fixture",
      lyrics:
        "[Verse 1]\nCarry the light with me\nEvery word arrives in time\n[Chorus]\nI know the line before it comes\n[Verse 2]\nLet the rhythm bring me home\nFollow where the melody goes\n[Chorus]\nI know the line before it comes",
      original: {
        name: "original.wav",
        mimeType: "audio/wav",
        buffer: fs.readFileSync("fixtures/demo/original.wav"),
      },
    },
  });
  expect(response.ok()).toBeTruthy();
  const song = await response.json();
  song.lines.forEach((line: any, i: number) => {
    line.start = 1 + i * 2.5;
    line.end = line.start + 2;
    line.verified = true;
    line.tokens.forEach((token: any, j: number) => {
      token.start = line.start + (j * 2) / line.tokens.length;
      token.end = line.start + ((j + 1) * 2) / line.tokens.length;
    });
  });
  const timing = await request.put(`/api/songs/${song.id}/alignment`, {
    data: { lines: song.lines, revision: 0 },
  });
  expect(timing.ok()).toBeTruthy();
  return { ...song, title };
}


test("choose a section, repeat, rate without stopping, switch at the boundary, and restore ratings", async ({page, request}) => {
  const song = await seed(request);
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.goto("/");
  await page.getByRole("button").filter({hasText: song.title}).first().click();
  await expect(page.locator(".lyric-stage")).toBeVisible();
  await page.screenshot({path:"test-results/section-picker-desktop.png"});
  await page.getByRole("button", {name:"Practice Verse 1", exact:true}).click();
  await expect(page.getByRole("button", {name:"Pause", exact:true})).toBeVisible();
  await expect(page.locator(".feedback-target")).toContainText("Verse 1");
  await page.keyboard.press("j");
  await expect(page.locator(".focus-panel")).toContainText("Needs practice");
  await expect(page.locator(".focus-panel")).toContainText("1 repeats completed", {timeout:10000});
  await page.keyboard.press("k");
  await expect(page.locator(".focus-panel")).toContainText("Ready");
  await expect(page.getByRole("button", {name:"Pause", exact:true})).toBeVisible();
  await expect(page.locator(".feedback-target")).toContainText("Verse 1");
  await page.getByRole("button", {name:"Choose / change section",exact:true}).click();
  await page.getByRole("button", {name:"Practice Verse 2",exact:true}).click();
  await expect(page.locator(".next-passage")).toContainText("Finish this section");
  await expect(page.locator(".feedback-target")).toContainText("Verse 2", {timeout:10000});
  await expect(page.getByRole("button", {name:"Loop 4–5",exact:true})).toBeVisible();
  await page.getByRole("button", {name:"Getting there",exact:true}).click();
  await page.getByRole("button", {name:"Pause",exact:true}).click();
  await page.screenshot({path:"test-results/section-rehearsal-desktop.png"});
  await expect.poll(async () => (await request.get("/api/songs/"+song.id+"/session")).json().then(s => Object.keys(s.rehearsal?.ratings ?? {}).length)).toBe(2);
  await page.getByRole("button", {name:"User guide",exact:true}).click();
  await expect(page.getByRole("dialog")).toContainText("Choose a section");
  await page.getByRole("button", {name:"Close drawer"}).click();
  await page.reload();
  await page.getByRole("button").filter({hasText:song.title}).first().click();
  await expect(page.getByRole("button",{name:"Practice Verse 1",exact:true})).toContainText("Ready");
  await expect(page.getByRole("button",{name:"Practice Verse 2",exact:true})).toContainText("Getting there");
  expect(errors).toEqual([]);
});

test("mobile section choice and ratings fit the screen", async ({page,request}) => {
  const song=await seed(request);
  await page.setViewportSize({width:390,height:844});
  await page.goto("/");
  await page.getByRole("button").filter({hasText:song.title}).first().click();
  await expect(page.locator(".lyric-stage")).toBeVisible();
  await page.screenshot({path:"test-results/section-picker-mobile.png"});
  await page.getByRole("button",{name:"Practice Chorus 1",exact:true}).click();
  await expect(page.locator(".feedback-target")).toContainText("Chorus 1");
  await page.getByRole("button",{name:"Getting there",exact:true}).click();
  await page.getByRole("button",{name:"Pause",exact:true}).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.screenshot({path:"test-results/section-rehearsal-mobile.png"});
  await page.getByRole("button",{name:"Timing",exact:true}).click();
  await expect(page.getByRole("dialog")).toContainText("Mark start here");
});

test("Freeplay starts at the beginning and direct lyric navigation preserve ordinary playback", async ({page,request}) => {
  const song=await seed(request);
  await page.goto("/");
  await page.getByRole("button").filter({hasText:song.title}).first().click();
  await page.locator(".mode-switch").getByRole("button",{name:"Freeplay",exact:true}).click();
  await expect(page.getByRole("button", {name:"Pause", exact:true})).toBeVisible();
  await expect.poll(async () => Number(await page.getByRole("slider", {name:"Song position"}).inputValue())).toBeLessThan(2);
  await page.getByRole("button", {name:"Pause", exact:true}).click();
  await page.getByRole("button",{name:"Go to line 4: Let the rhythm bring me home",exact:true}).click();
  await expect(page.getByRole("slider",{name:"Song position"})).toHaveValue("8.4");
  await page.getByRole("button",{name:"Play",exact:true}).click();
  await expect(page.locator(".stage-line.is-current")).toContainText("Follow where the melody goes",{timeout:6500});
  await page.getByRole("button",{name:"Back to library"}).click();
  await expect(page.locator(".mini-player")).toBeVisible();
});

test("pausing a counted section switch resumes the chosen section and its loop", async ({page,request}) => {
  const song=await seed(request);
  await request.put("/api/songs/"+song.id+"/beat-map",{data:{bpm:120,anchor:1}});
  await page.goto("/");
  await page.getByRole("button").filter({hasText:song.title}).first().click();
  await page.getByRole("button",{name:"Practice Verse 1",exact:true}).click();
  await page.getByRole("button",{name:"Choose / change section",exact:true}).click();
  await page.getByRole("button",{name:"Practice Verse 2",exact:true}).click();
  await expect(page.locator(".count-overlay")).toBeVisible({timeout:10000});
  await page.getByRole("button",{name:"Pause",exact:true}).click();
  await expect(page.locator(".feedback-target")).toContainText("Verse 2");
  await page.getByRole("button",{name:"Play",exact:true}).click();
  await expect(page.locator(".count-overlay")).not.toBeVisible({timeout:4000});
  await expect(page.getByRole("button",{name:"Loop 4–5",exact:true})).toBeVisible();
  await expect(page.locator(".focus-panel")).toContainText("1 repeats completed",{timeout:10000});
});

test("unlabeled imports show every lyric and suggested sections can be renamed", async ({page, request}) => {
  const song = await seed(request);
  const current = await (await request.get(`/api/songs/${song.id}`)).json();
  current.lines.forEach((line: any) => { line.section = "Song"; line.sectionId = "unlabeled"; });
  const update = await request.put(`/api/songs/${song.id}/alignment`, {
    data: {lines: current.lines, revision: current.alignmentRevision},
  });
  expect(update.ok()).toBeTruthy();
  await page.goto("/");
  await page.getByRole("button").filter({hasText:song.title}).first().click();
  await expect(page.locator(".lyric-stage .lyric-text")).toHaveCount(song.lines.length);
  await expect(page.getByRole("button", {name:"Practice Section", exact:true})).toBeVisible();
  await page.getByRole("button", {name:"Timing", exact:true}).click();
  await page.getByRole("textbox", {name:"Section name"}).fill("Opening verse");
  await page.getByRole("button", {name:"Save section", exact:true}).click();
  await expect.poll(async () => (await (await request.get(`/api/songs/${song.id}`)).json()).lines[0].section).toBe("Opening verse");
  await page.getByRole("button", {name:"Close drawer"}).click();
  await expect(page.getByRole("button", {name:"Practice Opening verse", exact:true})).toBeVisible();
});
