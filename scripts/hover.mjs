// Plays N bot turns, then hovers each neighbor of the player and screenshots.
import { createRequire } from 'module';
const { chromium } = createRequire(import.meta.url)('playwright');
const [seed = '3', turns = '3', out = 'hover', depth = '0'] = process.argv.slice(2);
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
p.on('pageerror', (e) => errors.push(String(e.stack || e)));
await p.goto('http://localhost:5173/');
await p.waitForTimeout(400);
await p.evaluate(([s, d]) => {
  const n = window.__nawia;
  n.app.startRun(Number(s), false);
  for (let i = 0; i < Number(d); i++) {
    const g = n.scene;
    g.run.state.outcome = 'descended';
    g.state = g.run.state;
    g.mode = 'fadeout'; g.fade = 0.99;
    g.update(0.1);
  }
}, [seed, depth]);
await p.waitForTimeout(1200);
for (let i = 0; i < Number(turns); i++) {
  await p.evaluate(() => window.__nawia.bot());
  await p.waitForTimeout(900);
}
const nbrs = await p.evaluate(() => {
  const g = window.__nawia.scene;
  const pos = g.state.units[0].pos;
  const D = [[0, -1], [1, -1], [1, 0], [0, 1], [-1, 1], [-1, 0]];
  return D.map(([dq, dr]) => window.__nawia.hexClient(pos + dq * 128 + dr));
});
for (let i = 0; i < nbrs.length; i++) {
  await p.mouse.move(nbrs[i].x, nbrs[i].y);
  await p.waitForTimeout(150);
  await p.screenshot({ path: `shots/${out}_${i}.png` });
}
if (errors.length) console.log('ERRORS:\n' + errors.join('\n'));
await b.close();
