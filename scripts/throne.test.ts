/**
 * Stand-alone sanity check for the Throne Challenge logic. No Redis / network:
 * it exercises the genuinely-new pieces — the one-shot token, the PvP verifier
 * (client/server parity + determinism), and the rank-swap score math.
 *
 *   npx --yes tsx scripts/throne.test.ts
 */
import {
  verifyThroneWin,
  throneBattleSeed,
  boardScore,
  teamFromMons,
  type SubmissionMon,
} from '../src/game/leaderboard.js';
import { simulateBattle, PLAYER_STAT_MULT } from '../src/game/battle.js';
import {
  signThroneToken,
  verifyThroneToken,
  type ThroneTokenClaims,
} from '../api/_token.js';

let passed = 0;
let failed = 0;
function check(label: string, cond: boolean) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.log(`  ✗ ${label}`);
  }
}

// Six heavy hitters vs. six early-route fodder. With an equal stat edge on both
// sides, the legendary squad should run over the bug/normal team.
const STRONG: SubmissionMon[] = [
  { id: '150', sign: 'leo' }, // Mewtwo
  { id: '384', sign: 'leo' }, // Rayquaza
  { id: '493', sign: 'leo' }, // Arceus
  { id: '249', sign: 'leo' }, // Lugia
  { id: '250', sign: 'leo' }, // Ho-Oh
  { id: '643', sign: 'leo' }, // Reshiram
];
const WEAK: SubmissionMon[] = [
  { id: '10', sign: 'pisces' }, // Caterpie
  { id: '13', sign: 'pisces' }, // Weedle
  { id: '129', sign: 'pisces' }, // Magikarp
  { id: '19', sign: 'pisces' }, // Rattata
  { id: '16', sign: 'pisces' }, // Pidgey
  { id: '11', sign: 'pisces' }, // Metapod
];

console.log('\n[1] Throne token round-trip + tamper detection');
{
  const secret = 'sk_pkm_2266_pikachu_mewtwo';
  const claims: ThroneTokenClaims = {
    name: 'Ash',
    date: '2026-06-24',
    bracket: 'all',
    difficulty: 'master',
    seed: 'abc123seed',
    n: 'nonce-xyz',
    iat: Date.now(),
  };
  const token = signThroneToken(claims, secret);

  const good = verifyThroneToken(token, secret);
  check('valid token verifies', good.ok === true);
  check(
    'claims survive the round-trip',
    good.ok === true &&
      good.claims.name === 'Ash' &&
      good.claims.seed === 'abc123seed' &&
      good.claims.difficulty === 'master',
  );

  const wrongSecret = verifyThroneToken(token, 'totally-different-secret-1234');
  check('rejects a token signed with another secret', wrongSecret.ok === false);

  const [body] = token.split('.');
  const tampered = `${body}.deadbeefdeadbeefdeadbeef`;
  check('rejects a tampered signature', verifyThroneToken(tampered, secret).ok === false);

  // Flip a byte of the (signed) body — signature must no longer match.
  const forgedBody = Buffer.from(
    JSON.stringify({ ...claims, name: 'Gary' }),
  ).toString('base64url');
  const forged = `${forgedBody}.${token.split('.')[1]}`;
  check('rejects an altered payload', verifyThroneToken(forged, secret).ok === false);
}

console.log('\n[2] PvP verifier — determinism + client/server parity');
{
  const seed = 'serverSeed#42';

  const a = verifyThroneWin({ challengerTeam: STRONG, kingTeam: WEAK, seed });
  const b = verifyThroneWin({ challengerTeam: STRONG, kingTeam: WEAK, seed });
  check('same inputs → same verdict (deterministic)', a.ok === b.ok);

  // The client (App.tsx) runs exactly this before posting. It must agree with
  // what the server's verifyThroneWin concludes, or a player could "win" on
  // screen yet be rejected.
  const clientSim = simulateBattle(
    teamFromMons(STRONG),
    teamFromMons(WEAK),
    throneBattleSeed(seed),
    { playerStatMult: PLAYER_STAT_MULT, foeStatMult: PLAYER_STAT_MULT },
  );
  check(
    'client sim winner matches server verdict (parity)',
    (clientSim.winner === 'player') === a.ok,
  );

  check('strong challenger beats weak king → ok', a.ok === true);

  const reversed = verifyThroneWin({
    challengerTeam: WEAK,
    kingTeam: STRONG,
    seed,
  });
  check('weak challenger loses to strong king → not ok', reversed.ok === false);

  const empty = verifyThroneWin({ challengerTeam: [], kingTeam: WEAK, seed });
  check('empty challenger team is rejected', empty.ok === false);
}

console.log('\n[3] Rank-swap math — winner takes #1, old king drops to #2');
{
  // A realistic mixed board (epoch ms ≈ today). Lower score = better rank.
  const now = 1_750_000_000_000;
  type Row = { name: string; score: number; at: number; diff: 'master' | 'hard' | 'normal' };
  const rows: Row[] = [
    { name: 'KingMaster', at: now + 1000, diff: 'master', score: boardScore('master', now + 1000) },
    { name: 'OtherMaster', at: now + 5000, diff: 'master', score: boardScore('master', now + 5000) },
    { name: 'Challenger', at: now + 9000, diff: 'master', score: boardScore('master', now + 9000) },
    { name: 'HardAce', at: now + 200, diff: 'hard', score: boardScore('hard', now + 200) },
    { name: 'NormalJoe', at: now + 50, diff: 'normal', score: boardScore('normal', now + 50) },
  ];

  const ordered = [...rows].sort((a, b) => a.score - b.score).map((r) => r.name);
  check(
    'before: KingMaster is #1, Challenger is last Master',
    ordered[0] === 'KingMaster' && ordered.indexOf('Challenger') > ordered.indexOf('OtherMaster'),
  );
  check(
    'every Master outranks every lower tier',
    ordered.slice(0, 3).every((n) => rows.find((r) => r.name === n)!.diff === 'master'),
  );

  // Apply the exact promotion the handler does: challenger's score becomes
  // boardScore('master', kingAt - 1).
  const king = rows.find((r) => r.name === 'KingMaster')!;
  const challenger = rows.find((r) => r.name === 'Challenger')!;
  challenger.at = king.at - 1;
  challenger.score = boardScore('master', king.at - 1);

  const after = [...rows].sort((a, b) => a.score - b.score).map((r) => r.name);
  check('after: Challenger is now #1', after[0] === 'Challenger');
  check('after: old king drops to #2', after[1] === 'KingMaster');
  check(
    'after: lower tiers still sit below all Masters',
    after.indexOf('HardAce') >= 3 && after.indexOf('NormalJoe') >= 3,
  );
}

console.log(`\n${failed === 0 ? '✅ ALL PASS' : '❌ FAILURES'} — ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
