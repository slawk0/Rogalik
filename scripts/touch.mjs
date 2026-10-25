// Touch controls test on an emulated phone.
import { createRequire } from 'module';
const { chromium, devices } = createRequire(import.meta.url)('playwright');
const b = await chromium.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'] });
const p = await ctx.newPage();
const cdp = await ctx.newCDPSession(p);
const errors = [];
p.on('pageerror', (e) => errors.push(String(e.stack || e)));
await p.goto('http://localhost:5173/');
await p.waitForTimeout(600);
let fails = 0;
const ok = (name, cond) => { if (!cond) fails++; console.log((cond ? 'OK   ' : 'FAIL ') + name); };
const client = (x, y) => p.evaluate(([x, y]) => window.__nawia.internalToClient(x, y), [x, y]);
const tapI = async (x, y) => { const c = await client(x, y); await p.touchscreen.tap(c.x, c.y); };
const tapHex = async (k) => { const c = await p.evaluate((k) => window.__nawia.hexClient(k), k); await p.touchscreen.tap(c.x, c.y); };
const tapBtn = async (id) => {
  const bt = await p.evaluate((id) => window.__nawia.scene.btns.find((b) => b.id === id), id);
  if (!bt) throw new Error('no button ' + id);
  await tapI(bt.x + bt.w / 2, bt.y + bt.h / 2);
};
const longPress = async (k, ms = 600) => {
  const c = await p.evaluate((k) => window.__nawia.hexClient(k), k);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: c.x, y: c.y }] });
  await p.waitForTimeout(ms);
  const held = await p.evaluate(() => window.__nawia.scene.pressK);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  return held;
};
const st = () => p.evaluate(() => { const g = window.__nawia.scene; return { turn: g.state.turn, pos: g.state.units[0].pos, mode: g.mode, paused: g.paused, selected: g.selected, pressK: g.pressK, cd: g.state.hero.leapCd }; });

// Start a run from the title by touch.
await tapI(5, 5);
const item = await p.evaluate(() => { const s = window.__nawia.scene; return { x: s.w / 2, y: s.items[0].y + 3 }; });
await tapI(item.x, item.y);
await p.waitForTimeout(1600);
ok('tap on menu starts a run', await p.evaluate(() => !!window.__nawia.scene.state));

// Arrange: one wolf placed so that stepping in direction d gets the hero bitten.
const setup = await p.evaluate(() => {
  const g = window.__nawia.scene; const s = g.state; const P = s.units[0].pos;
  const D = [[0, -1], [1, -1], [1, 0], [0, 1], [-1, 1], [-1, 0]];
  const stp = (k, d) => k + D[((d % 6) + 6) % 6][0] * 128 + D[((d % 6) + 6) % 6][1];
  const floor = (k) => s.tiles.get(k)?.t === 'floor';
  for (let d = 0; d < 6; d++) {
    const dest = stp(P, d); const W = stp(dest, d + 1);
    if (floor(dest) && floor(W)) {
      const wolf = s.units.find((u) => u.kind !== 'player');
      wolf.kind = 'wilk'; wolf.hp = 1; wolf.maxHp = 1; wolf.pos = W; wolf.intent = null;
      s.units = [s.units[0], wolf];
      g.previews.clear(); g.view.sync(s); g.introT = 1000;
      return { dest };
    }
  }
  return null;
});
ok('setup found', !!setup);
await p.waitForTimeout(300);
let a = await st();
const held = await longPress(setup.dest);
let c1 = await st();
ok('long press previews without moving', held === setup.dest && c1.turn === a.turn && c1.pressK === -1);
await tapHex(setup.dest);
await p.waitForTimeout(250);
let b1 = await st();
ok('risky move: first tap only selects', b1.turn === a.turn && b1.selected === setup.dest);
await p.screenshot({ path: 'shots/touch_confirm.png' });
await tapHex(setup.dest);
await p.waitForTimeout(1200);
let d1 = await st();
ok('second tap confirms risky move', d1.turn === a.turn + 1 && d1.pos === setup.dest);

// Safe move: one tap. Pick a free neighbour with no damage in preview.
const safeK = await p.evaluate(() => {
  const g = window.__nawia.scene; const s = g.state; const P = s.units[0].pos;
  const D = [[0, -1], [1, -1], [1, 0], [0, 1], [-1, 1], [-1, 0]];
  for (let d = 0; d < 6; d++) {
    const k = P + D[d][0] * 128 + D[d][1];
    if (s.tiles.get(k)?.t !== 'floor' || s.units.some((u) => u.pos === k)) continue;
    const pv = g.previewFor({ t: 'move', dir: d });
    if (pv.valid && !pv.playerDamage && !pv.clears) return k;
  }
  return -1;
});
if (safeK >= 0) {
  const t0 = (await st()).turn;
  await tapHex(safeK);
  await p.waitForTimeout(1200);
  ok('safe move runs on one tap', (await st()).turn === t0 + 1);
} else console.log('SKIP safe move (no safe hex)');

// Leap via button.
await p.evaluate(() => { const g = window.__nawia.scene; g.state.hero.leapCd = 0; });
await p.waitForTimeout(100);
await tapBtn('leap');
await p.waitForTimeout(150);
ok('SKOK button enters leap mode', await p.evaluate(() => window.__nawia.scene.leapMode));
const leapK = await p.evaluate(() => {
  const g = window.__nawia.scene; const s = g.state;
  for (const k of s.tiles.keys()) {
    const pv = g.previewFor({ t: 'leap', to: k });
    if (pv.valid && !pv.playerDamage && !pv.clears) return k;
  }
  return -1;
});
const t1 = (await st()).turn;
await tapHex(leapK);
await p.waitForTimeout(1200);
let e1 = await st();
ok('tap on a hex in leap mode leaps', e1.turn === t1 + 1 && e1.pos === leapK && e1.cd > 0);

// Menu and pause buttons.
await tapBtn('menu');
await p.waitForTimeout(200);
ok('menu button pauses', (await st()).paused);
await p.screenshot({ path: 'shots/touch_pause.png' });
await tapBtn('resume');
await p.waitForTimeout(200);
ok('"Wróć do gry" resumes', !(await st()).paused);

// Gift pick by tap.
await p.evaluate(() => { const g = window.__nawia.scene; g.offer = ['lancuch', 'wicher', 'kuznia']; g.mode = 'gift'; g.overlayT = 0; g.giftDelay = 0; });
await p.waitForTimeout(900);
const r = await p.evaluate(() => window.__nawia.scene.giftRects[1]);
await tapI(r.x + r.w / 2, r.y + r.h / 2);
await p.waitForTimeout(200);
ok('tap picks a gift', await p.evaluate(() => window.__nawia.scene.state.hero.gifts.includes('wicher')));
await p.waitForTimeout(2500);

// Death screen buttons.
const before = await p.evaluate(() => { window.__oldScene = window.__nawia.scene; const g = window.__nawia.scene; g.mode = 'dead'; g.overlayT = 0; return 1; });
await p.waitForTimeout(1500);
await tapBtn('again');
await p.waitForTimeout(500);
ok('"Nowa wyprawa" starts a new run', await p.evaluate(() => window.__nawia.scene !== window.__oldScene && window.__nawia.scene.state.depth === 0));
if (errors.length) { console.log('ERRORS:\n' + errors.join('\n')); fails++; }
await b.close();
process.exit(fails ? 1 : 0);
