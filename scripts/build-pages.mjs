import { cp, readdir, readFile, writeFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
await rm('docs', {recursive: true, force: true});
await cp('dist', 'docs', {recursive: true});
async function walk(dir) { const result = []; for (const entry of await readdir(dir, {withFileTypes: true})) { const path = `${dir}/${entry.name}`; result.push(...(entry.isDirectory() ? await walk(path) : [path.replace(/^docs\//, '')])); } return result; }
const assets = await walk('docs');
const hash = createHash('sha256');
for (const path of assets) hash.update(await readFile(`docs/${path}`));
const version = hash.digest('hex').slice(0, 16);
await writeFile('docs/sw.js', `const ROOT = new URL('./', self.location.href);
const PREFIX = 'lyric-player-' + ROOT.pathname + '-';
const CACHE = PREFIX + '${version}';
const ASSETS = ${JSON.stringify(['./', ...assets])}.map(path => new URL(path, ROOT).href);
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS))));
self.addEventListener('activate', event => event.waitUntil((async () => {
  for (const key of await caches.keys()) if (key.startsWith(PREFIX) && key !== CACHE) await caches.delete(key);
  await self.clients.claim();
})()));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || !ASSETS.includes(event.request.url)) return;
  event.respondWith(caches.open(CACHE).then(async cache => (await cache.match(event.request)) || fetch(event.request)));
});
`);
await writeFile('docs/.nojekyll', '');
console.log('GitHub Pages ready in docs/. Select main /docs in Pages settings.');
