import { type Ctx, heal } from './rules';
import { type GameState, giftCount, player } from './state';
import { Rng } from './rng';

export type God = 'perun' | 'swarog' | 'strzybog' | 'weles' | 'mokosz';

export interface Gift {
  id: string;
  god: God;
  name: string;
  desc: string;
  /** Can be taken more than once. */
  stack?: number;
  weight?: number;
  when?: (s: GameState) => boolean;
  apply?: (c: Ctx) => void;
}

export const GODS: Record<God, { name: string; color: number }> = {
  perun: { name: 'Perun', color: 11 },
  swarog: { name: 'Swaróg', color: 9 },
  strzybog: { name: 'Strzybóg', color: 18 },
  weles: { name: 'Weles', color: 28 },
  mokosz: { name: 'Mokosz', color: 12 },
};

export const GIFTS: Gift[] = [
  { id: 'lancuch', god: 'perun', name: 'Łańcuch piorunów', desc: 'Każde zabójstwo razi piorunem najbliższego wroga w zasięgu 2.' },
  { id: 'gromwypad', god: 'perun', name: 'Gromowy wypad', desc: 'Wypad razi też wroga stojącego za celem.' },
  { id: 'reka', god: 'perun', name: 'Ręka Peruna', desc: 'Lądowanie skoku zadaje 1 obrażenie wszystkim sąsiadom.' },
  {
    id: 'kuznia', god: 'swarog', name: 'Kuźnia Swaroga', desc: '+1 maksymalne serce i leczy 1 serce.', stack: 3,
    apply: (c) => { c.s.hero.maxHp++; heal(c, 1); },
  },
  { id: 'zar', god: 'swarog', name: 'Żarliwe cięcie', desc: 'Cięcie zadaje 2 obrażenia zamiast 1.' },
  { id: 'ognskok', god: 'swarog', name: 'Ognisty skok', desc: 'Lądowanie skoku podpala pola wokół na 2 tury.' },
  { id: 'hart', god: 'swarog', name: 'Hartowanie', desc: 'Pierwszy cios na każdej planszy jest blokowany.' },
  { id: 'wicher', god: 'strzybog', name: 'Wicher', desc: 'Pchnięcie odrzuca wroga o 2 pola.' },
  { id: 'domino', god: 'strzybog', name: 'Domino', desc: 'Wróg trafiony pchniętym wrogiem też leci dalej.' },
  { id: 'lekkie', god: 'strzybog', name: 'Lekkie nogi', desc: 'Skok: zasięg 3 i odnowienie krótsze o 1 turę.' },
  { id: 'szal', god: 'strzybog', name: 'Szał wichru', desc: 'Każde zabójstwo skraca odnowienie skoku o 1 turę.' },
  { id: 'huragan', god: 'strzybog', name: 'Huragan', desc: 'Pchnięcie odrzuca też wrogów stojących po bokach celu.' },
  { id: 'zniwiarz', god: 'weles', name: 'Żniwiarz', desc: 'Co 8 zabójstw odzyskujesz 1 serce.' },
  { id: 'cien', god: 'weles', name: 'Cienisty krok', desc: 'Odejście od wroga też go tnie.' },
  {
    id: 'pakt', god: 'weles', name: 'Pakt z Welesem', desc: 'Cięcie i wypad zadają +1 obrażenie, ale tracisz 1 maksymalne serce.',
    when: (s) => s.hero.maxHp >= 3,
    apply: (c) => { c.s.hero.maxHp--; const p = player(c.s); p.hp = Math.min(p.hp, c.s.hero.maxHp); },
  },
  { id: 'odrodzenie', god: 'weles', name: 'Odrodzenie', desc: 'Raz w wyprawie przeżyjesz śmiertelny cios z 1 sercem.' },
  {
    id: 'woda', god: 'mokosz', name: 'Woda żywa', desc: 'Leczy 1 serce.', stack: 99, weight: 1.5,
    when: (s) => player(s).hp < s.hero.maxHp,
    apply: (c) => heal(c, 1),
  },
  {
    id: 'korzen', god: 'mokosz', name: 'Korzeń Mokoszy', desc: 'Leczy do pełna i daje +1 maksymalne serce.', stack: 1, weight: 0.4,
    when: (s) => player(s).hp < s.hero.maxHp,
    apply: (c) => { c.s.hero.maxHp++; heal(c, 99); },
  },
];

export function giftById(id: string): Gift {
  return GIFTS.find((g) => g.id === id)!;
}

export function offerGifts(s: GameState, rng: Rng, n = 3): string[] {
  const pool = GIFTS.filter((g) => {
    if (g.when && !g.when(s)) return false;
    const owned = giftCount(s, g.id);
    return owned < (g.stack ?? 1);
  });
  const out: string[] = [];
  const bag = pool.slice();
  while (out.length < n && bag.length) {
    const total = bag.reduce((a, g) => a + (g.weight ?? 1), 0);
    let r = rng.next() * total;
    let i = 0;
    for (; i < bag.length - 1; i++) {
      r -= bag[i].weight ?? 1;
      if (r <= 0) break;
    }
    out.push(bag[i].id);
    // Do not offer two gifts from the same god when avoidable.
    const god = bag[i].god;
    bag.splice(i, 1);
    const others = bag.filter((g) => g.god !== god);
    if (others.length >= n - out.length) {
      bag.length = 0;
      bag.push(...others);
    }
  }
  return out;
}

export function takeGift(c: Ctx, id: string): void {
  const g = giftById(id);
  c.s.hero.gifts.push(id);
  g.apply?.(c);
}
