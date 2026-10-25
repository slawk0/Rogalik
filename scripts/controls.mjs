import { createRequire } from 'module';
const { chromium } = createRequire(import.meta.url)('playwright');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
p.on('pageerror', (e) => errors.push(String(e.stack || e)));
await p.goto('http://localhost:5173/');
await p.waitForTimeout(500);
const ok = (name, cond) => console.log((cond ? 'OK   ' : 'FAIL ') + name);
// Click "Nowa wyprawa" (menu item at h*0.64 internal -> 0.64*900 css).
const item = await p.evaluate(() => { const s = window.__nawia.scene; const sc = window.__nawia.app.screen; return { x: (s.w / 2) * sc.scale / sc.dpr, y: (s.items[0].y + 3) * sc.scale / sc.dpr }; });
await p.mouse.click(item.x, item.y);
await p.waitForTimeout(1500);
ok('menu click starts a run', await p.evaluate(() => !!window.__nawia.scene.state));
const st = () => p.evaluate(() => { const g = window.__nawia.scene; return { pos: g.state.units[0].pos, turn: g.state.turn, cd: g.state.hero.leapCd, mode: g.mode, paused: g.paused, help: g.showHelp }; });
let a = await st();
// Find a free direction to move.
const dirKey = await p.evaluate(() => {
  const g = window.__nawia.scene; const s = g.state; const pos = s.units[0].pos;
  const D = [[0, -1, 'KeyW'], [1, -1, 'KeyE'], [1, 0, 'KeyD'], [0, 1, 'KeyS'], [-1, 1, 'KeyA'], [-1, 0, 'KeyQ']];
  for (const [dq, dr, k] of D) { const n = pos + dq * 128 + dr; const t = s.tiles.get(n); if (t && t.t === 'floor' && !s.units.some(u => u.pos === n)) return k; }
  return null;
});
await p.keyboard.press(dirKey);
await p.waitForTimeout(900);
let b2 = await st();
ok(`key ${dirKey} moves the hero`, b2.pos !== a.pos && b2.turn === a.turn + 1);
await p.keyboard.press('Space');
await p.waitForTimeout(900);
let c = await st();
ok('space waits a turn', c.turn === b2.turn + 1 && c.pos === b2.pos);
// Leap with F + direction (try all directions).
await p.keyboard.press('KeyF');
await p.waitForTimeout(100);
ok('F enters leap mode', await p.evaluate(() => window.__nawia.scene.leapMode));
for (const k of ['KeyW', 'KeyE', 'KeyD', 'KeyS', 'KeyA', 'KeyQ']) {
  await p.keyboard.press(k);
  await p.waitForTimeout(150);
  if ((await st()).turn > c.turn) break;
}
await p.waitForTimeout(900);
let d = await st();
ok('F + direction leaps', d.turn === c.turn + 1 && d.cd > 0);
// Right click on a leap target should be denied now (cooldown).
await p.keyboard.press('Escape');
await p.waitForTimeout(100);
ok('Esc pauses', (await st()).paused);
await p.keyboard.press('KeyX');
await p.waitForTimeout(100);
ok('any key resumes', !(await st()).paused);
await p.keyboard.press('KeyH');
await p.waitForTimeout(100);
ok('H opens help', (await st()).help);
await p.mouse.click(700, 450);
await p.waitForTimeout(100);
ok('click closes help', !(await st()).help);
// Mouse click on an adjacent free hex moves.
const target = await p.evaluate(() => {
  const g = window.__nawia.scene; const s = g.state; const pos = s.units[0].pos;
  const D = [[0, -1], [1, -1], [1, 0], [0, 1], [-1, 1], [-1, 0]];
  for (const [dq, dr] of D) { const n = pos + dq * 128 + dr; const t = s.tiles.get(n); if (t && t.t === 'floor' && !s.units.some(u => u.pos === n)) return window.__nawia.hexClient(n); }
  return null;
});
await p.mouse.move(target.x, target.y);
await p.waitForTimeout(100);
await p.mouse.click(target.x, target.y);
await p.waitForTimeout(900);
let e = await st();
ok('left click on neighbor moves', e.turn === d.turn + 1 && e.pos !== d.pos);
if (errors.length) console.log('ERRORS:\n' + errors.join('\n'));
await b.close();
