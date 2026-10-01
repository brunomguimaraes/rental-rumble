/**
 * Battle replay board: the pure fold from a server event log to what the
 * battle screen shows (who is out, HP, status, volatiles, faints, lines).
 *
 *   npx --yes tsx scripts/battle-board.test.ts
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BattleEvent } from '../src/game/battle.js';
import { boardAt, combatantFromCreature, wildCombatant, type CombatantView, type Narration } from '../src/game/battle-board.js';
import { type OwnedMon } from '../src/game/box.js';
import { ownedMaxHp } from '../src/game/health.js';
import { CREATURES_BY_ID } from '../src/game/pokemon.js';
import { starterFromOffer } from '../src/game/professions.js';
import { rollRouteFind, simulateRouteBattle } from '../src/game/route-rules.js';
import type { InventoryState } from '../src/game/route-actions.js';
import type { Side } from '../src/game/types.js';
import { PMD_SCALE, pmdBody, pmdFrameBox, resolvePmdAnim } from '../src/game/pmd.js';
import { PMD_SPRITES } from '../src/game/pmdSprites.gen.js';

let passed = 0;
let failed = 0;
function check(label: string, ok: boolean): void {
  if (ok) passed++;
  else { failed++; console.error(`FAIL: ${label}`); }
}

const view = (dexId: number): CombatantView => {
  const c = CREATURES_BY_ID[String(dexId)];
  if (!c) throw new Error(`fixture species ${dexId} missing`);
  return combatantFromCreature(c);
};
const bulbasaur = view(1);
const charmander = view(4);
const squirtle = view(7);
const wild: Narration = { foeName: 'Squirtle', guardian: false };

// A hand-built log: lead out, foe out, burn, poison + volatile on, lead faints,
// second member switches in, foe transforms, burn clears.
const log: BattleEvent[] = [
  { kind: 'sendout', text: 'Go! Bulbasaur!', affected: 'player', index: 0, hp: 45, maxHp: 45 },
  { kind: 'sendout', text: '', affected: 'foe', index: 0, hp: 44, maxHp: 44, name: 'Squirtle' },
  { kind: 'status', text: 'Foe Squirtle was burned!', affected: 'foe', status: 'burn' },
  { kind: 'status', text: 'Bulbasaur was poisoned and weighed down!', affected: 'player', status: 'poison', volatile: 'weight', volatileOn: true },
  { kind: 'hit', text: '', actor: 'foe', affected: 'player', damage: 45, hp: 0, maxHp: 45, mult: 2, moveType: 'fire' },
  { kind: 'faint', text: 'Bulbasaur fainted!', affected: 'player' },
  { kind: 'sendout', text: 'Go! Charmander!', affected: 'player', index: 1, hp: 39, maxHp: 39 },
  { kind: 'transform', text: 'Foe Squirtle transformed!', actor: 'foe', transform: { dexId: 4, name: 'Charmander', types: ['fire'], sign: 'leo', sprite: 's', back: 'b' } },
  { kind: 'statusTick', text: 'Foe Squirtle’s burn faded.', affected: 'foe', status: null },
  { kind: 'status', text: 'Charmander is no longer weighed down.', affected: 'player', volatile: 'weight', volatileOn: false },
  { kind: 'sendout', text: '', affected: 'player', index: 9, hp: 1, maxHp: 1 },
];
const at = (upTo: number) => boardAt({ events: log, upTo, player: [bulbasaur, charmander], foe: [squirtle], narration: wild });

check('nothing is out before the first send-out', at(-1).player.view === null && at(-1).foe.view === null);
check('send-out puts the indexed member out with its HP', at(0).player.view?.dexId === 1 && at(0).player.hp === 45 && at(0).player.spawnAt === 0);
check('a status event sets the main status', at(2).foe.status === 'burn');
check('a volatile toggles on', at(3).player.volatiles.includes('weight'));
check('the same event can set the player\'s main status', at(3).player.status === 'poison');
check('a super-effective hit raises the banner with its type', at(4).banner === 'Super effective!' && at(4).bannerType === 'fire');
check('the killing hit alone does not mark the side fainted', at(4).player.fainted === false);
check('faint zeroes HP and counts the faint', at(5).player.hp === 0 && at(5).player.faints === 1);
check('the faint event marks the side fainted', at(5).player.fainted === true);
check('switch-in follows sendout.index, clears status and volatiles, and re-keys the spawn', at(6).player.view?.dexId === 4 && at(6).player.index === 1 && at(6).player.volatiles.length === 0 && at(6).player.status === null && at(6).player.spawnAt === 6);
check('switch-in keeps the faint count', at(6).player.faints === 1);
check('switch-in clears fainted', at(6).player.fainted === false);
check('transform swaps species, types and sign in place', at(7).foe.view?.dexId === 4 && at(7).foe.view?.types.join() === 'fire' && at(7).foe.view?.sign === 'leo' && at(7).foe.spawnAt === 1);
check('status: null clears the main status', at(8).foe.status === null);
check('a volatile toggles off', at(9).player.volatiles.length === 0);
check('an out-of-range send-out index keeps the current member', at(10).player.view?.dexId === 4);
check('earlier boards are not mutated by later events', at(3).player.volatiles.includes('weight') && at(10).player.volatiles.length === 0 && at(1).foe.view?.dexId === 7);

check('a wild foe announces itself', at(1).line === 'A wild Squirtle appeared!');
check('a trainer foe is sent out by name', boardAt({ events: log, upTo: 1, player: [bulbasaur], foe: [squirtle], narration: { foeName: 'Squirtle', guardian: false, trainerName: 'Youngster Joey' } }).line === 'Youngster Joey sends out Squirtle!');

// Foe views from the public WildView, with and without the sign.
const withSign = wildCombatant({ dexId: 7, level: 3, shiny: true, altColor: false, rare: false, guardian: false, sign: 'pisces' });
const legacy = wildCombatant({ dexId: 7, level: 3, shiny: false, altColor: false, rare: false, guardian: false });
check('a wild foe view carries its sign and shiny identity', withSign?.sign === 'pisces' && withSign.shiny === true);
check('a stored foe without a sign renders with no sign', legacy !== null && legacy.sign === null);
check('an unknown species has no foe view', wildCombatant({ dexId: 99_999, level: 1, shiny: false, altColor: false, rare: false, guardian: false }) === null);

// A real seeded route battle: the final board agrees with the log.
const stocked: InventoryState = { revision: 1, stacks: [{ itemId: 'poke', quantity: 20 }] };
const find = rollRouteFind({ knownLandmarks: [], questClaimed: false, inventory: stocked, seed: 'test-0', kind: 'wild' });
const starterMint = starterFromOffer('route-balance:10:0:4', 10);
if (!starterMint || !find.foe) throw new Error('Pinned battle fixture is unavailable');
const mon: OwnedMon = { ...starterMint, id: 'starter', exp: 0, origin: 'starter', caughtAt: 0 };
const battle = simulateRouteBattle({ party: [mon], foe: find.foe, seed: 'rules-battle' });
const foeView = wildCombatant(find.foe.view);
const starterView = view(mon.dexId);
if (!foeView) throw new Error('Pinned foe view is unavailable');
const last = battle.events.length - 1;
const final = boardAt({ events: battle.events, upTo: last, player: [starterView], foe: [foeView], narration: { foeName: foeView.name, guardian: false } });
const lastHp = (side: Side): number => {
  for (let i = last; i >= 0; i--) {
    const e = battle.events[i];
    if (e.affected === side && e.kind === 'faint') return 0;
    if (e.affected === side && typeof e.hp === 'number') return e.hp;
  }
  return -1;
};
check('seeded final board shows the last HP the log reported for each side', final.player.hp === lastHp('player') && final.foe.hp === lastHp('foe'));
check('seeded final board names the winner', final.line === (battle.won ? 'You won the battle!' : 'Your party was defeated.'));
check('seeded final board counts the loser’s faint', (battle.won ? final.foe.faints : final.player.faints) === 1);
check('seeded battle shows the foe’s sign from the view', final.foe.view?.sign === find.foe.mint.sign);

// Persistent HP: a hurt member is sent out at its stored HP, so the replay never draws it at full.
const hurt: OwnedMon = { ...mon, hpLost: ownedMaxHp(mon) - 3 };
const hurtBattle = simulateRouteBattle({ party: [hurt], foe: find.foe, seed: 'rules-battle' });
const hurtOut = hurtBattle.events.findIndex((e) => e.kind === 'sendout' && e.affected === 'player');
const hurtBoard = boardAt({ events: hurtBattle.events, upTo: hurtOut, player: [starterView], foe: [foeView], narration: { foeName: foeView.name, guardian: false } });
check('a hurt member enters the replay board at its stored HP out of its full max', hurtOut >= 0 && hurtBoard.player.hp === 3 && hurtBoard.player.maxHp === ownedMaxHp(mon));


// PMD frames stand on a ground anchor (Charizard, real resting and hurt
// geometry): every frame is centred on the same point, shifted by the side's
// resting shadow centre, so that shadow lands on the anchor and a larger hurt
// canvas never jumps.
const charizard = pmdBody(6);
const idle = resolvePmdAnim(6, 'idle');
const hurtAnim = resolvePmdAnim(6, 'hurt');
if (!charizard || !idle || !hurtAnim) throw new Error('Charizard PMD fixture is unavailable');
const centre = (box: { left: number; top: number; width: number; height: number }) => [box.left + box.width / 2, box.top + box.height / 2];
check('idle and hurt frames share one centre, shifted by each side\'s own ground point', (['player', 'foe'] as const).every((side) => {
  const ground = charizard.ground[side];
  const centres = [idle, hurtAnim].map((anim) => centre(pmdFrameBox({ fw: anim.fw, fh: anim.fh, ground })));
  return centres.every(([x, y]) => x === -ground.x * PMD_SCALE && y === -ground.y * PMD_SCALE);
}));
const unmeasured = Object.keys(PMD_SPRITES).map(Number).filter((id) => {
  const body = pmdBody(id);
  return !(body && body.top > 0 && (['player', 'foe'] as const).every((side) => Number.isFinite(body.ground?.[side]?.x) && Number.isFinite(body.ground?.[side]?.y)));
});
check(`every bundled PMD sprite has a measured body with both ground points (rerun scripts/build-pmd-bodies.py): ${unmeasured.slice(0, 5).join(', ')}`, unmeasured.length === 0);

// PmdSprite draws <sheet>-Shadow.png with the sheet's own frame offsets, so
// every sheet a species can render needs a shadow sheet of the same size.
const pngSize = (path: string): string | null => {
  if (!existsSync(path)) return null;
  const head = readFileSync(path).subarray(16, 24);
  return `${head.readUInt32BE(0)}x${head.readUInt32BE(4)}`;
};
const pmdDir = fileURLToPath(new URL('../public/sprites/pmd/', import.meta.url));
const unshadowed = Object.entries(PMD_SPRITES).flatMap(([id, entry]) => [...new Set(Object.values(entry).map((anim) => anim.sheet))]
  .filter((sheet) => {
    const size = pngSize(join(pmdDir, id, `${sheet}-Shadow.png`));
    return size === null || size !== pngSize(join(pmdDir, id, `${sheet}-Anim.png`));
  })
  .map((sheet) => `${id}/${sheet}`));
check(`every bundled PMD sheet has a ground shadow on its own grid (rerun scripts/build-pmd-shadows.py): ${unshadowed.slice(0, 5).join(', ')}`, unshadowed.length === 0);
console.log(`Battle board: ${passed} passed, ${failed} failed.`);
process.exit(failed ? 1 : 0);
