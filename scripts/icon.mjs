// Renders the home-screen icons into public/ (needs the dev server).
import { createRequire } from 'module';
import { mkdirSync } from 'fs';
const { chromium } = createRequire(import.meta.url)('playwright');
mkdirSync('public', { recursive: true });
const b = await chromium.launch();
for (const size of [192, 512]) {
  const p = await b.newPage({ viewport: { width: size, height: size } });
  await p.goto(`http://localhost:5173/dev/icon.html?size=${size}`);
  await p.waitForFunction(() => document.title === 'ready');
  await (await p.$('#c')).screenshot({ path: `public/icon-${size}.png` });
  await p.close();
}
await b.close();
console.log('icons written');
