import { test, expect } from '@playwright/test';

test('native practice repeats across several boundaries with the page timers stopped', async ({page}) => {
  await page.goto('/');
  await page.evaluate(async () => {
    const {ListeningTransport} = await import('/src/audio/listeningTransport.ts');
    const {practiceWav} = await import('/src/audio/practiceAudio.ts');
    const context = new AudioContext();
    const buffer = context.createBuffer(1, context.sampleRate * 4, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.sin(i / context.sampleRate * 440 * Math.PI * 2) * .05;
    const url = URL.createObjectURL(practiceWav([buffer], 0, 4));
    const audio = document.createElement('audio');
    document.body.append(audio);
    const transport = new ListeningTransport([url], () => audio);
    transport.setTransition({id: 'chunk', start: 1, exit: 2, gap: 0, clicks: []});
    await transport.play(1);
    Object.assign(window, {testTransport: transport, testAudio: audio});
    await context.close();
  });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setScriptExecutionDisabled', {value: true});
  // Media loops run without JavaScript. This wait covers multiple whole passages.
  await new Promise(resolve => setTimeout(resolve, 3500));
  await cdp.send('Emulation.setScriptExecutionDisabled', {value: false});
  const state = await page.evaluate(() => {
    const {testAudio: audio, testTransport: transport} = window as any;
    return {duration: audio.duration, loop: audio.loop, paused: audio.paused, ended: audio.ended, position: transport.getSnapshot().position};
  });
  expect(state.duration).toBeCloseTo(1, 2);
  expect(state).toMatchObject({loop: true, paused: false, ended: false});
  expect(state.position).toBeGreaterThanOrEqual(1);
  expect(state.position).toBeLessThan(2);
  await page.evaluate(() => (window as any).testTransport.dispose());
});

test('phone player opens a lyrics video and keeps it when returning to the library', async ({page, request}) => {
  const wav = Buffer.alloc(44 + 8000 * 4 * 2);
  wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write('data', 36); wav.writeUInt32LE(wav.length - 44, 40);
  const response = await request.post('/api/songs/import', {multipart: {
    title: `Background practice ${Date.now()}`, artist: 'Test', lyrics: '[Verse 1]\nCarry the light\nBring it home',
    original: {name: 'background.wav', mimeType: 'audio/wav', buffer: wav},
  }});
  expect(response.ok()).toBeTruthy();
  const song = await response.json();
  song.lines.forEach((line: any, index: number) => { line.start = index + .5; line.end = index + 1.5; line.verified = true; line.tokens = []; });
  expect((await request.put(`/api/songs/${song.id}/alignment`, {data: {lines: song.lines, revision: song.alignmentRevision ?? 0}})).ok()).toBeTruthy();
  await page.setViewportSize({width: 390, height: 844});
  await page.goto('/');
  await page.getByRole('button').filter({hasText: song.title}).first().click();
  await page.getByRole('button', {name: 'Play', exact: true}).click();
  await page.getByRole('button', {name: 'Floating lyrics', exact: true}).click();
  await expect(page.getByRole('button', {name: 'Close floating lyrics', exact: true})).toBeVisible();
  expect(await page.evaluate(() => !!document.pictureInPictureElement)).toBe(true);
  await page.screenshot({path: 'test-results/background-lyrics-phone.png'});
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.getByRole('button', {name: 'Back to library', exact: true}).click();
  await expect(page.locator('.mini-player')).toBeVisible();
  expect(await page.evaluate(() => !!document.pictureInPictureElement)).toBe(true);
  await page.getByRole('button', {name: 'Close floating lyrics', exact: true}).click();
  await expect.poll(() => page.evaluate(() => !!document.pictureInPictureElement)).toBe(false);
});
