import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import pathModule from 'node:path';
import { zipSync, strToU8 } from 'fflate';

test('Mac exports multiple songs; phone imports once, preserves edits and plays offline after reopening', async ({page, request, browser}) => {
  const ids: string[] = [];
  const stamp = Date.now();
  for (const suffix of ['A', 'B']) {
    const response = await request.post('/api/songs/import', {multipart: {
      title: `Bundle ${stamp} ${suffix}`, artist: 'Synthetic test', lyrics: '[Verse]\nFirst invented line\nSecond invented line',
      original: {name: 'original.wav', mimeType: 'audio/wav', buffer: fs.readFileSync('fixtures/demo/original.wav')},
    }});
    expect(response.ok()).toBeTruthy();
    const song = await response.json(); ids.push(song.id);
    const aligned = await request.put(`/api/songs/${song.id}/alignment`, {data: {revision: song.alignmentRevision ?? 0, lines: song.lines.map((line: object, i: number) => ({...line, start: i * 4, end: i * 4 + 4, verified: true, tokens: []}))}});
    expect(aligned.ok(), await aligned.text()).toBeTruthy();
  }
  await page.goto('/');
  await page.getByText('Take songs to your phone', {exact: true}).click();
  for (const suffix of ['A', 'B']) await page.locator('.bundle-songs label').filter({hasText: `Bundle ${stamp} ${suffix}`}).getByRole('checkbox').check();
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', {name: 'Export selected songs (2)'}).click();
  const download = await downloadEvent;
  const path = await download.path(); expect(path).toBeTruthy();
  const profile = fs.mkdtempSync(pathModule.join(os.tmpdir(), 'lyric-phone-test-'));
  const context = await browser.browserType().launchPersistentContext(profile, {viewport: {width: 390, height: 844}});
  const phone = await context.newPage();
  const errors: string[] = []; const apiRequests: string[] = [];
  phone.on('pageerror', e => errors.push(e.message));
  phone.on('request', r => { if (r.url().includes('/api/')) apiRequests.push(r.url()); });
  await phone.goto('http://127.0.0.1:5175/docs/');
  await phone.getByLabel('Import song bundle', {exact: true}).setInputFiles(path!);
  await expect(phone.locator('.bundle-panel [role=status]')).toContainText('2 songs imported');
  await expect(phone.locator('.song-card')).toHaveCount(2);
  const ready = phone.locator('.song-card').first().getByRole('button', {name: /^Concert ready:/});
  await ready.click();
  await expect(ready).toHaveAttribute('aria-pressed', 'true');
  await phone.getByLabel('Import song bundle', {exact: true}).setInputFiles(path!);
  await expect(phone.locator('.bundle-panel [role=status]')).toContainText('0 songs imported. 2 already');
  await expect(ready).toHaveAttribute('aria-pressed', 'true');
  await phone.evaluate(async () => { await navigator.serviceWorker.ready; });
  await expect.poll(() => phone.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  // WebKit's offline emulation fails navigations internally. Make the actual
  // origin unavailable instead, so an uncached app request receives HTTP 503.
  await request.post('http://127.0.0.1:5175/__offline?enabled=true');
  if (browser.browserType().name() !== 'webkit') await context.setOffline(true);
  await phone.reload();
  await expect(phone.locator('.song-card')).toHaveCount(2);
  await expect(ready).toHaveAttribute('aria-pressed', 'true');
  await phone.locator('.song-card-main').first().click();
  await phone.getByRole('button', {name: 'Play', exact: true}).click();
  await expect(phone.getByRole('button', {name: 'Pause', exact: true})).toBeVisible();
  await phone.getByRole('button', {name: /^Go to line 2:/}).click();
  await expect(phone.locator('.listening-line.is-current')).toContainText('Second invented line');
  await phone.getByRole('button', {name: 'Pause', exact: true}).click();
  await phone.locator('.listening-map .section-loop').click();
  await expect(phone.locator('.listening-map .section-loop')).toHaveAttribute('aria-pressed', 'true');
  await phone.getByRole('button', {name: 'Play', exact: true}).click();
  const box = await phone.locator('.listening-center').boundingBox(); expect(box!.width).toBeGreaterThan(370);
  const mapName = await phone.locator('.map-name').first().boundingBox(); expect(mapName!.width).toBeGreaterThan(50);
  expect(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await phone.screenshot({path: 'test-results/bundle-player-phone.png'});
  await phone.getByRole('button', {name: 'Back to library'}).click();
  await phone.screenshot({path: 'test-results/bundle-library-phone.png'});
  expect(errors).toEqual([]); expect(apiRequests).toEqual([]);
  await context.close();
  const reopened = await browser.browserType().launchPersistentContext(profile, {viewport: {width: 390, height: 844}});
  const returned = await reopened.newPage();
  await returned.goto('http://127.0.0.1:5175/docs/');
  await expect(returned.locator('.song-card')).toHaveCount(2);
  await expect(returned.locator('.song-card').first().getByRole('button', {name: /^Concert ready:/})).toHaveAttribute('aria-pressed', 'true');
  await reopened.close();
  await request.post('http://127.0.0.1:5175/__offline?enabled=false');
  fs.rmSync(profile, {recursive: true, force: true});
  for (const id of ids) await request.delete(`/api/songs/${id}`);
});

test('invalid bundle does not partially import songs', async ({page}) => {
  await page.request.post('http://127.0.0.1:5175/__offline?enabled=false');
  await page.goto('http://127.0.0.1:5175/docs/');
  await page.getByLabel('Import song bundle', {exact: true}).setInputFiles({name: 'bad.zip', mimeType: 'application/zip', buffer: Buffer.from(zipSync({'manifest.json': strToU8(JSON.stringify({format:'lyric-memorizer-bundle',version:1,songs:[{song:{id:'bad'}}]}))}))});
  await expect(page.getByRole('alert')).toContainText('Invalid song metadata');
  await expect(page.locator('.song-card')).toHaveCount(0);
});
