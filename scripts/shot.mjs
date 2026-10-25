// Usage: node scripts/shot.mjs <url> <out.png> [waitMs] [width] [height] [jsToEval]
import { createRequire } from 'module';
const { chromium } = createRequire(import.meta.url)('playwright');
const [url, out, wait = '800', w = '1400', h = '820', js] = process.argv.slice(2);
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: Number(w), height: Number(h) } });
const errors = [];
p.on('pageerror', (e) => errors.push(String(e)));
p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await p.goto(url);
await p.waitForTimeout(Number(wait));
if (js) { await p.evaluate(js); await p.waitForTimeout(600); }
await p.screenshot({ path: out });
if (errors.length) console.log('ERRORS:\n' + errors.join('\n'));
await b.close();
