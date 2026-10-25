// Screenshots of every screen on emulated phones.
// Usage: node scripts/mobile.mjs [deviceName] [landscape]
import { createRequire } from 'module';
const { chromium, devices } = createRequire(import.meta.url)('playwright');
const name = process.argv[2] ?? 'iPhone 13';
const landscape = process.argv[3] === 'landscape';
const dev = devices[landscape ? `${name} landscape` : name] ?? devices[name];
const tag = (name + (landscape ? '-l' : '')).replace(/\s+/g, '_');
const b = await chromium.launch();
const ctx = await b.newContext({ ...dev, defaultBrowserType: undefined });
const p = await ctx.newPage();
const errors = [];
p.on('pageerror', (e) => errors.push(String(e.stack || e)));
p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await p.goto('http://localhost:5173/');
await p.waitForTimeout(600);
const tapInternal = async (x, y) => {
  const c = await p.evaluate(([x, y]) => window.__nawia.internalToClient(x, y), [x, y]);
  await p.touchscreen.tap(c.x, c.y);
};
await tapInternal(10, 10); // marks input as touch
await p.waitForTimeout(200);
await p.screenshot({ path: `shots/m_${tag}_title.png` });
const info = await p.evaluate(() => ({ w: window.__nawia.app.screen.w, h: window.__nawia.app.screen.h, scale: window.__nawia.app.screen.scale, dpr: window.__nawia.app.screen.dpr }));
console.log(tag, JSON.stringify(info));
// Tap "Nowa wyprawa".
const item = await p.evaluate(() => { const s = window.__nawia.scene; return { x: s.w / 2, y: s.items[0].y + 3 }; });
await tapInternal(item.x, item.y);
await p.waitForTimeout(1600);
for (let i = 0; i < 3; i++) { await p.evaluate(() => window.__nawia.bot()); await p.waitForTimeout(900); }
await p.screenshot({ path: `shots/m_${tag}_game.png` });
// Late game with gifts and a boss.
await p.evaluate(() => {
  const g = window.__nawia.scene;
  g.state.hero.gifts = ['lancuch', 'zar', 'domino', 'wicher', 'cien', 'woda', 'hart', 'kuznia', 'reka', 'lekkie'];
  g.state.hero.maxHp = 5;
});
await p.waitForTimeout(300);
await p.screenshot({ path: `shots/m_${tag}_gifts_hud.png` });
await p.evaluate(() => { const g = window.__nawia.scene; g.offer = ['lancuch', 'wicher', 'kuznia']; g.mode = 'gift'; g.overlayT = 0; g.giftDelay = 0; });
await p.waitForTimeout(900);
await p.screenshot({ path: `shots/m_${tag}_giftpick.png` });
await p.evaluate(() => { const g = window.__nawia.scene; g.mode = 'play'; g.showHelp = true; });
await p.waitForTimeout(300);
await p.screenshot({ path: `shots/m_${tag}_help.png` });
await p.evaluate(() => { const g = window.__nawia.scene; g.showHelp = false; g.paused = true; });
await p.waitForTimeout(300);
await p.screenshot({ path: `shots/m_${tag}_pause.png` });
await p.evaluate(() => { const g = window.__nawia.scene; g.paused = false; g.state.killedBy = 'Strzyga'; g.mode = 'dead'; g.overlayT = 0; });
await p.waitForTimeout(1500);
await p.screenshot({ path: `shots/m_${tag}_dead.png` });
await p.evaluate(() => { const g = window.__nawia.scene; g.mode = 'won'; g.overlayT = 0; });
await p.waitForTimeout(1500);
await p.screenshot({ path: `shots/m_${tag}_won.png` });
if (errors.length) console.log('ERRORS:\n' + errors.join('\n'));
await b.close();
