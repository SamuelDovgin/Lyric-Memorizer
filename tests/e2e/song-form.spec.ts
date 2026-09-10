import {test, expect} from '@playwright/test';

test('shared add/edit form protects drafts, previews lyrics, and fits mobile', async ({page}) => {
  let song = {id: 'cards-form', title: 'Cards', artist: 'Doja Cat', lyrics: 'Original words', duration: 224,
    status: 'READY_NEEDS_REVIEW', statusMessage: 'Ready', originalUrl: '/audio.wav', vocalsUrl: null,
    instrumentalUrl: null, sourceUrl: 'https://www.youtube.com/watch?v=test', lines: [], alignmentRevision: 0};
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    let body: unknown = song;
    if (path === '/api/songs') body = [song];
    else if (path.endsWith('/refresh-preview')) body = {title: 'Cards', artist: 'Doja Cat', lyrics: 'Fresh words'};
    else if (path.endsWith('/edit')) { song = {...song, ...route.request().postDataJSON(), alignmentRevision: 1}; body = song; }
    await route.fulfill({json: body});
  });
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await page.getByRole('button', {name: 'Edit Cards', exact: true}).click();
  await expect(page.getByRole('heading', {name: 'Edit your song.'})).toBeVisible();
  await expect(page.getByLabel('YouTube source')).toHaveAttribute('readonly', '');
  await page.getByRole('button', {name: 'Pull lyrics from YouTube source'}).click();
  await expect(page.getByLabel('Exact lyrics')).toHaveValue('Fresh words');
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', {name: 'Library', exact: true}).last().click();
  await expect(page.getByLabel('Exact lyrics')).toHaveValue('Fresh words');
  await page.screenshot({path: 'test-results/song-edit-desktop.png', fullPage: true});
  await page.setViewportSize({width: 390, height: 844});
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({path: 'test-results/song-edit-mobile.png', fullPage: true});
  await page.getByRole('button', {name: 'Save changes', exact: true}).click();
  await expect(page.getByText('All changes saved')).toBeVisible();
  await page.getByRole('button', {name: 'Library', exact: true}).last().click();
  await page.getByRole('button', {name: 'Add song', exact: true}).first().click();
  await expect(page.getByRole('heading', {name: 'Bring in a song.'})).toBeVisible();
  await expect(page.getByLabel('Song title')).toHaveValue('');
  await expect(page.getByRole('button', {name: 'Import song', exact: true})).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({path: 'test-results/song-add-mobile.png', fullPage: true});
  expect(errors).toEqual([]);
});
