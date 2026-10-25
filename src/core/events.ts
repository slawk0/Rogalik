import type { Kind, Unit } from './state';

export type Cause = 'hit' | 'drown' | 'fall' | 'burn' | 'explode' | 'banish';

export type StrikeStyle = 'slash' | 'lunge' | 'shove' | 'bite' | 'throw' | 'sweep' | 'cast';
export type BeamStyle = 'fire' | 'arrow' | 'dark' | 'bolt' | 'roots';

export type Ev =
  | { t: 'phase'; p: 'player' | 'enemy' | 'end' }
  | { t: 'move'; id: number; from: number; to: number; style: 'step' | 'leap' | 'fly' | 'charge' | 'push' | 'teleport' }
  | { t: 'bump'; id: number; at: number; dir: number }
  | { t: 'strike'; id: number; at: number; style: StrikeStyle }
  | { t: 'hit'; id: number; dmg: number; hp: number; by: number }
  | { t: 'block'; id: number }
  | { t: 'immortal'; id: number }
  | { t: 'die'; id: number; cause: Cause; pos: number; kind: Kind }
  | { t: 'beam'; from: number; hexes: number[]; style: BeamStyle }
  | { t: 'boom'; at: number }
  | { t: 'intent'; id: number }
  | { t: 'spawn'; unit: Unit }
  | { t: 'ignite'; hexes: number[] }
  | { t: 'heal'; id: number; amount: number; hp: number }
  | { t: 'bones'; at: number }
  | { t: 'crush'; at: number }
  | { t: 'combo'; n: number; at: number }
  | { t: 'shockwave'; at: number }
  | { t: 'stun'; id: number }
  | { t: 'fuse'; id: number; timer: number }
  | { t: 'text'; at: number; text: string; color: number }
  | { t: 'eggbreak'; at: number }
  | { t: 'clear' };
