import {test, expect} from '@playwright/test';
const wav = Buffer.alloc(44 + 8000 * 2 * 3);
wav.write('RIFF',0); wav.writeUInt32LE(wav.length-8,4); wav.write('WAVEfmt ',8);
wav.writeUInt32LE(16,16); wav.writeUInt16LE(1,20); wav.writeUInt16LE(1,22);
wav.writeUInt32LE(8000,24); wav.writeUInt32LE(16000,28); wav.writeUInt16LE(2,32); wav.writeUInt16LE(16,34);
wav.write('data',36); wav.writeUInt32LE(wav.length-44,40);
test('player repeats a song and shuffles to another library song', async ({page, request}) => {
  const songs = [];
  for (const name of ['Queue A', 'Queue B']) {
    const response = await request.post('/api/songs/import', {multipart: {
      title: `${name} ${Date.now()}`, lyrics: 'An invented line',
      original: {name:'original.wav',mimeType:'audio/wav',buffer:wav},
    }});
    expect(response.ok()).toBeTruthy(); songs.push(await response.json());
  }
  await page.goto('/');
  await page.getByRole('button').filter({hasText:songs[0].title}).first().click();
  await page.getByRole('button',{name:'Repeat off',exact:true}).click();
  await page.getByRole('button',{name:'Repeat all',exact:true}).click();
  await page.getByRole('button',{name:'Play',exact:true}).click();
  await expect(page.getByRole('button',{name:'Pause',exact:true})).toBeVisible();
  const scrub = page.getByRole('slider',{name:'Song position'});
  await expect.poll(async () => Number(await scrub.inputValue())).toBeGreaterThan(2);
  await expect.poll(async () => Number(await scrub.inputValue())).toBeLessThan(1);
  await expect(page.locator('.player-title')).toContainText(songs[0].title);
  await page.getByRole('button',{name:'Repeat one',exact:true}).click();
  await page.getByRole('button',{name:'Shuffle off',exact:true}).click();
  await expect(page.locator('.player-title')).not.toContainText(songs[0].title);
  await expect(page.getByRole('button',{name:'Pause',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Previous song',exact:true}).click();
  await expect(page.locator('.player-title')).toContainText(songs[0].title);
  await page.setViewportSize({width:390,height:844});
  await expect(page.getByRole('button',{name:'Shuffle on',exact:true})).toBeVisible();
  await page.screenshot({path:'/tmp/lyric-pins-qa/queue-mobile.png'});
  await page.reload();
  await page.getByRole('button').filter({hasText:songs[0].title}).first().click();
  await expect(page.getByRole('button',{name:'Shuffle on',exact:true})).toHaveAttribute('aria-pressed','true');
});
