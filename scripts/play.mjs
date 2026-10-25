// Plays the game in a real browser with the bot, taking periodic screenshots.
// Usage: node scripts/play.mjs <steps> <shotEvery> [seed]
import { createRequire } from 'module';
const { chromium, devices } = createRequire(import.meta.url)('playwright');
const [steps = '200', every = '25', seed = '7', device] = process.argv.slice(2);
const b = await chromium.launch();
const p = device ? await (await b.newContext({ ...devices[device] })).newPage() : await b.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
p.on('pageerror', (e) => errors.push(String(e.stack || e)));
p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await p.goto('http://localhost:5173/');
await p.waitForTimeout(500);
await p.evaluate((s) => window.__nawia.app.startRun(Number(s), false), seed);
await p.waitForTimeout(900);
let shot = 0;
for (let i = 0; i < Number(steps); i++) {
  const mode = await p.evaluate(() => window.__nawia.bot());
  if (i % Number(every) === 0) {
    await p.waitForTimeout(120);
    await p.screenshot({ path: `shots/play_${String(shot++).padStart(2, '0')}.png` });
  }
  await p.waitForTimeout(mode === 'play' ? 350 : 250);
  const st = await p.evaluate(() => ({ mode: window.__nawia.scene.mode, depth: window.__nawia.scene.state.depth, hp: window.__nawia.scene.state.units[0].hp }));
  if (st.mode === 'dead' || st.mode === 'won') { console.log('end', JSON.stringify(st), 'at step', i); await p.waitForTimeout(1500); await p.screenshot({ path: `shots/play_end.png` }); break; }
  if (i % 50 === 0) console.log(i, JSON.stringify(st));
}
if (errors.length) console.log('ERRORS:\n' + [...new Set(errors)].join('\n'));
await b.close();
