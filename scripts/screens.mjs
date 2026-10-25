import { createRequire } from 'module';
const { chromium } = createRequire(import.meta.url)('playwright');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
p.on('pageerror', (e) => errors.push(String(e.stack || e)));
await p.goto('http://localhost:5173/');
await p.waitForTimeout(400);
await p.evaluate(() => window.__nawia.app.startRun(11, false));
await p.waitForTimeout(1000);
await p.keyboard.press('KeyH');
await p.waitForTimeout(300);
await p.screenshot({ path: 'shots/scr_help.png' });
await p.keyboard.press('Escape');
// Gift overlay.
await p.evaluate(() => { const g = window.__nawia.scene; g.state.stats.score = 420; g.offer = ['lancuch', 'wicher', 'kuznia']; g.mode = 'gift'; g.overlayT = 0; g.giftDelay = 0; });
await p.waitForTimeout(800);
await p.mouse.move(720, 470);
await p.waitForTimeout(200);
await p.screenshot({ path: 'shots/scr_gift.png' });
// Death.
await p.evaluate(() => { const g = window.__nawia.scene; g.state.killedBy = 'Strzyga'; g.state.depth = 12; g.state.hero.gifts = ['lancuch', 'zar', 'domino', 'wicher', 'cien', 'woda']; g.mode = 'dead'; g.overlayT = 0; });
await p.waitForTimeout(1500);
await p.screenshot({ path: 'shots/scr_dead.png' });
await p.evaluate(() => { const g = window.__nawia.scene; g.mode = 'won'; g.overlayT = 0; });
await p.waitForTimeout(1500);
await p.screenshot({ path: 'shots/scr_won.png' });
if (errors.length) console.log('ERRORS:\n' + errors.join('\n'));
await b.close();
