/**
 * Nickname cleaning — the one validation both client and server run.
 *
 *   npx --yes tsx scripts/profile.test.ts
 */
import { cleanNickname, onboard } from '../src/game/profile.js';
import { cleanTrainerName } from '../src/game/trainer-identity.js';
import { parseTrainerColors, recolorTrainerPixels, ORIGINAL_COLORS } from '../src/game/trainer-colors.js';

let passed = 0;
let failed = 0;
function check(label: string, ok: boolean) {
  if (ok) passed++;
  else {
    failed++;
    console.error(`FAIL: ${label}`);
  }
}

console.log('[1] cleanNickname');
check('trims', cleanNickname('  Cat ') === 'Cat');
check('empty rejected', cleanNickname('') === null);
check('whitespace rejected', cleanNickname('   ') === null);
check('12 chars accepted', cleanNickname('abcdefghijkl') === 'abcdefghijkl');
check('13 chars rejected', cleanNickname('abcdefghijklm') === null);
check('non-string rejected', cleanNickname(42) === null);
check('control chars rejected', cleanNickname('a\u0000b') === null);

console.log('[2] trainer identity validation');
check('trainer name trims without losing accents', cleanTrainerName('  André Oak  ') === 'André Oak');
for (const raw of ['', '   ', 3, null, 'a'.repeat(25), 'A\nB', '<Trainer>']) {
  check(`invalid trainer name: ${String(raw)}`, cleanTrainerName(raw) === null);
}
check('24-character name accepted', cleanTrainerName('a'.repeat(24)) === 'a'.repeat(24));
check('old profile colors default to original', parseTrainerColors(undefined)?.hairColor === 'original');
for (const raw of [[], 'blue', { skinTone: 'peach' }, { skinTone: 'invented', hairColor: 'black' }, { skinTone: 'tan', hairColor: ['blue'] }]) {
  check('invalid palette rejected', parseTrainerColors(raw) === null);
}
console.log('[3] independent material colors');
const pixels = new Uint8ClampedArray([240, 200, 170, 255, 20, 30, 40, 255, 120, 80, 60, 255, 255, 255, 255, 0]);
const mask = new Uint8ClampedArray([128, 0, 0, 255, 0, 128, 0, 255, 0, 0, 0, 0, 128, 0, 0, 255]);
check('original is byte-for-byte unchanged', String(recolorTrainerPixels(pixels, mask, ORIGINAL_COLORS)) === String(pixels));
const skin = recolorTrainerPixels(pixels, mask, { skinTone: 'deep', hairColor: 'original' });
check('skin color changes only skin and keeps alpha', skin[0] === 89 && skin[1] === 55 && skin[2] === 39 && skin[3] === 255 && String(skin.slice(4)) === String(pixels.slice(4)));
const hair = recolorTrainerPixels(pixels, mask, { skinTone: 'original', hairColor: 'blonde' });
check('dark hair can become blonde without affecting skin or clothes', hair[4] === 224 && hair[5] === 187 && hair[6] === 119 && String(hair.slice(0, 4)) === String(pixels.slice(0, 4)) && String(hair.slice(8)) === String(pixels.slice(8)));
const litSkin = recolorTrainerPixels(new Uint8ClampedArray([255, 225, 190, 255]), new Uint8ClampedArray([224, 0, 0, 255]), { skinTone: 'ebony', hairColor: 'original' });
check('dark skin highlights stay warm instead of bleaching toward white', litSkin[0] <= 110 && litSkin[0] - litSkin[1] >= 20 && litSkin[1] - litSkin[2] >= 10);

console.log('[4] onboarding client contract');
const realFetch = globalThis.fetch;
let sent: RequestInit | undefined;
globalThis.fetch = (async (_url, options) => {
  sent = options;
  return new Response(JSON.stringify({ ok: true, displayName: 'André', profile: { avatarId: 'f01', avatarColors: { skinTone: 'tan', hairColor: 'blue' } } }));
}) as typeof fetch;
const created = await onboard({ starter: 1, displayName: 'André', avatarId: 'f01', colors: { skinTone: 'tan', hairColor: 'blue' } });
check('client sends identity and starter together with session', sent?.credentials === 'include' && JSON.parse(String(sent.body)).colors.hairColor === 'blue' && JSON.parse(String(sent.body)).starter === 1);
check('client preserves saved identity and normalizes missing party', created.displayName === 'André' && created.profile?.avatarId === 'f01' && created.profile.avatarColors?.skinTone === 'tan' && created.profile.party.length === 0);
globalThis.fetch = (async () => new Response(JSON.stringify({ ok: false, error: 'Choose a portrait from the gallery.' }), { status: 400 })) as typeof fetch;
check('server validation sentence reaches picker', (await onboard({ starter: 1, displayName: 'A', avatarId: 'm01', colors: ORIGINAL_COLORS })).error === 'Choose a portrait from the gallery.');
globalThis.fetch = (async () => { throw new Error('offline'); }) as typeof fetch;
check('offline onboarding returns a retryable error', !(await onboard({ starter: 1, displayName: 'A', avatarId: 'm01', colors: ORIGINAL_COLORS })).ok);
globalThis.fetch = realFetch;

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
