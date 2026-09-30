/**
 * The client fetch helpers' contract with the screens: a failed request is
 * `ok: false` (never an empty result), an ended session is `expired`, and a
 * 409 carries the activity or result to adopt. `fetch` is replaced by canned
 * responses; the helpers' own mapping is what runs.
 *
 *   npx --yes tsx scripts/world-client.test.ts
 */
import { fetchWorldState, startActivity, stepExpedition, finishActivity, dismissResult } from '../src/game/world-client.js';
import { fetchBox } from '../src/game/box.js';
import { fetchProfile } from '../src/game/profile.js';
import { saveParty } from '../src/game/party.js';

let passed = 0;
let failed = 0;
function check(label: string, ok: boolean) {
  if (ok) passed++;
  else {
    failed++;
    console.error(`FAIL: ${label}`);
  }
}

let reply: () => Promise<Response> = () => Promise.reject(new Error('unset'));
globalThis.fetch = (() => reply()) as typeof fetch;
const json = (status: number, body: unknown) => () =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
const offline = () => Promise.reject(new TypeError('Failed to fetch'));

const start = { mode: 'train' as const, locationId: 'r1' as const, partyIds: ['a'], requestId: 'q' };
const activity = { id: 'act', mode: 'train', locationId: 'r1', startedAt: 1, party: [], legacy: false, training: null, expedition: null };

console.log('[1] world state');
reply = json(200, { ok: true, serverNow: 5, places: [], activity: null, result: null, trainerAt: 'home' });
const s1 = await fetchWorldState();
check('a good state comes back whole', s1.ok && s1.state.serverNow === 5 && s1.state.trainerAt === 'home');
reply = json(401, { ok: false, error: 'Sign in to play.' });
const s2 = await fetchWorldState();
check('401 means the session expired', !s2.ok && s2.expired === true);
reply = json(503, { ok: false, error: 'The world map isn’t ready yet.' });
const s3 = await fetchWorldState();
check('503 surfaces the server’s sentence', !s3.ok && s3.error === 'The world map isn’t ready yet.' && !s3.expired);
reply = json(200, { ok: false, error: 'The world is unavailable right now.' });
check('ok:false with 200 is still a failure', !(await fetchWorldState()).ok);
reply = offline;
const s4 = await fetchWorldState();
check('offline is a failure with a retry sentence', !s4.ok && s4.error === 'Network error — please try again.');
reply = json(200, { ok: true, activity: null });
check('a malformed state is a failure, not an empty map', !(await fetchWorldState()).ok);

console.log('\n[2] activity writes');
reply = json(409, { ok: false, error: 'Your trainer is already out.', activity });
const a1 = await startActivity(start);
check('a busy start hands back the running activity', !a1.ok && a1.activity?.id === 'act');
reply = json(409, { ok: false, error: 'Your party changed. Check it and try again.', party: ['b', 'a'] });
const a2 = await startActivity(start);
check('a stale party hands back the saved one', !a2.ok && JSON.stringify(a2.party) === '["b","a"]');
reply = json(200, { ok: true, activity });
const a3 = await startActivity(start);
check('a started activity comes back', a3.ok && a3.activity.id === 'act');
reply = json(409, { ok: false, error: 'That checkpoint was already decided.', activity: null, result: { id: 'act' } });
const st = await stepExpedition({ activityId: 'act', step: 1, choice: 'a' });
check('a conflicting step hands back the stored result', !st.ok && (st.result as { id?: string } | null | undefined)?.id === 'act');
reply = json(200, { ok: true, result: { id: 'act' }, box: [] });
const f1 = await finishActivity('act');
check('a finish returns the result and box', f1.ok && f1.result.id === 'act' && Array.isArray(f1.box));
reply = json(401, {});
check('an expired session on finish is flagged', (await finishActivity('act')).ok === false);
reply = json(404, { ok: false, error: 'Nothing to dismiss.' });
const d1 = await dismissResult('act');
check('a failed dismiss reports the sentence', !d1.ok && d1.error === 'Nothing to dismiss.');

console.log('\n[3] box, profile, party');
reply = json(200, { ok: true, box: [{ id: 'm' }] });
const b1 = await fetchBox();
check('a loaded box is ok', b1.ok && b1.box.length === 1);
reply = json(503, { ok: false, error: 'Couldn’t load your box.' });
const b2 = await fetchBox();
check('a failed box is not an empty box', !b2.ok);
reply = json(401, { ok: false });
check('a box without a session is expired', (await fetchBox()).expired === true);
reply = json(401, { ok: false });
check('a profile without a session is expired', (await fetchProfile()).expired === true);
reply = json(200, { ok: true, profile: { profession: 'trainer', mentor: 'oak', starterId: 's', currentRoute: 'r1', createdAt: 1 } });
const p1 = await fetchProfile();
check('an older profile without a party reads an empty party', p1.ok && JSON.stringify(p1.profile?.party) === '[]');
reply = json(400, { ok: false, error: 'That party includes a Pokémon you don’t own.' });
const q1 = await saveParty(['x']);
check('a refused party save surfaces the sentence', !q1.ok && q1.error === 'That party includes a Pokémon you don’t own.');
reply = json(401, {});
check('a party save without a session is expired', (await saveParty(['x'])).expired === true);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
