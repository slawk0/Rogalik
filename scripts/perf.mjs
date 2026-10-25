import { createRequire } from 'module';
const { chromium } = createRequire(import.meta.url)('playwright');
const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
const errors = [];
p.on('pageerror', (e) => errors.push(String(e.stack || e)));
p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
await p.goto('http://localhost:5173/');
await p.waitForTimeout(500);
await p.mouse.click(960, 700); // "Nowa wyprawa" area or anywhere -> inits audio
await p.keyboard.press('Enter');
await p.waitForTimeout(1500);
await p.evaluate(() => {
  window.__frames = [];
  let last = performance.now();
  const f = (t) => { window.__frames.push(t - last); last = t; requestAnimationFrame(f); };
  requestAnimationFrame(f);
});
for (let i = 0; i < 80; i++) {
  await p.evaluate(() => window.__nawia.bot());
  await p.waitForTimeout(300);
}
const stats = await p.evaluate(() => {
  const fr = window.__frames.slice(5);
  const avg = fr.reduce((a, b) => a + b, 0) / fr.length;
  const worst = Math.max(...fr);
  const ctxState = window.__nawia.scene.mode;
  return { n: fr.length, avg: avg.toFixed(2), worst: worst.toFixed(1), over33: fr.filter((x) => x > 33).length, mode: ctxState, depth: window.__nawia.scene.state.depth };
});
console.log(JSON.stringify(stats));
if (errors.length) console.log('ERRORS:\n' + [...new Set(errors)].join('\n'));
await b.close();
