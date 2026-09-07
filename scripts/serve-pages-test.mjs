// An isolated static server that can simulate the origin being unavailable.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
const root = resolve('docs');
let offline = false;
const types = {'.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.png':'image/png', '.webmanifest':'application/manifest+json'};
createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1:5175');
  if (url.pathname === '/__offline' && req.method === 'POST') { offline = url.searchParams.get('enabled') === 'true'; res.end('OK'); return; }
  if (offline) { res.writeHead(503); res.end('Offline test'); return; }
  const path = resolve(root, '.' + decodeURIComponent(url.pathname.replace(/^\/docs/, '')).replace(/\/$/, '/index.html'));
  if (!path.startsWith(root + '/')) { res.writeHead(404); res.end(); return; }
  try { const body = await readFile(path); res.writeHead(200, {'Content-Type': types[extname(path)] || 'application/octet-stream'}); res.end(body); }
  catch { res.writeHead(404); res.end(); }
}).listen(5175, '127.0.0.1');
