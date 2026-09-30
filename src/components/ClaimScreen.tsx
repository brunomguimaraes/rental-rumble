import { useMemo } from 'react';
import { ownedMonToCreature, type OwnedMon } from '../game/box';
import type { ClaimResult } from '../game/idle-client';
import { CREATURES_BY_ID } from '../game/pokemon';
import { MiniSprite } from './MiniSprite';
import { formatElapsed } from './formatElapsed';

// What happened while you were away: the encounter log, EXP, level-ups and
// evolutions (all server-authoritative), plus the met list that slice 2 turns
// into the throw phase.

export function ClaimScreen({ result, box, onDone, onAgain }: { result: ClaimResult; box: OwnedMon[]; onDone: () => void; onAgain: () => void }) {
  const source = result.box ?? box;
  const boxById = useMemo(() => new Map(source.map((m) => [m.id, m] as [string, OwnedMon])), [source]);
  const log = result.log;

  if (!result.ok || !log) {
    return (
      <div className="mx-auto flex min-h-[100dvh] max-w-md flex-col items-center justify-center px-5 py-10 text-center">
        <span className="text-5xl">💫</span>
        <h1 className="mt-4 text-2xl font-black text-white">Nothing to claim</h1>
        <p className="mt-2 max-w-sm text-white/60">{result.error ?? 'Try again in a moment.'}</p>
        <button type="button" onClick={onDone} className="mt-8 rounded-full bg-white px-6 py-2.5 text-sm font-bold text-black">Back to hub</button>
      </div>
    );
  }

  const title = log.encounters.length === 0 ? 'Back so soon?' : log.stoppedBy === 'loss' ? 'Your party fainted' : log.stoppedBy === 'cap' ? 'A full day on the road' : 'Welcome back';
  const name = (m: OwnedMon | undefined, dexId: number) => m?.nickname ?? CREATURES_BY_ID[String(m?.dexId ?? dexId)]?.name ?? 'Pokémon';

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-2xl flex-col px-5 py-8">
      <h1 className="text-2xl font-black text-white">{title}</h1>
      <p className="mt-1 text-sm text-white/60">
        Out for {formatElapsed(log.elapsedMs)} · {log.encounters.length} encounters · {log.wins} wins · {log.wins * log.expPerWin} EXP each
      </p>

      {(result.levelUps?.length || result.evolutions?.length) ? (
        <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <div className="mb-3 text-xs font-bold uppercase tracking-widest text-white/40">Growth</div>
          <ul className="space-y-2">
            {result.levelUps?.map((lu) => {
              const m = boxById.get(lu.id);
              const c = m ? ownedMonToCreature(m) : null;
              return (
                <li key={lu.id} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-white/80">{c && <MiniSprite creature={c} className="h-6 w-6" />}{name(m, 0)}</span>
                  <span className="font-bold text-emerald-300">Lv {lu.fromLevel} → {lu.toLevel}</span>
                </li>
              );
            })}
            {result.evolutions?.map((ev, i) => (
              <li key={`${ev.id}-${i}`} className="flex items-center justify-between text-sm">
                <span className="text-white/80">{CREATURES_BY_ID[String(ev.fromDexId)]?.name} evolved!</span>
                <span className="font-bold text-amber-300">→ {CREATURES_BY_ID[String(ev.toDexId)]?.name}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-6">
        <div className="mb-2 text-xs font-bold uppercase tracking-widest text-white/40">Met on the road</div>
        {log.encounters.length === 0 ? (
          <p className="text-sm text-white/50">Nobody yet. Encounters happen every few minutes; give it time.</p>
        ) : (
          <ul className="grid gap-1 sm:grid-cols-2">
            {log.encounters.map((e) => {
              const c = CREATURES_BY_ID[String(e.dexId)];
              return (
                <li key={e.slot} className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] px-3 py-1.5 text-sm">
                  <span className="flex items-center gap-2 text-white/80">{c && <MiniSprite creature={c} className="h-6 w-6" />}{c?.name ?? 'Wild'} <span className="text-white/40">Lv {e.level}</span></span>
                  <span className={e.won ? 'text-emerald-300' : 'text-rose-300'}>{e.won ? 'won' : 'lost'} · {e.turns}t</span>
                </li>
              );
            })}
          </ul>
        )}
        {log.encounters.length > 0 && <p className="mt-2 text-xs text-white/40">Catching the Pokémon you meet arrives in the next update.</p>}
      </section>

      <div className="mt-auto flex gap-3 pt-8">
        <button type="button" onClick={onAgain} className="flex-1 rounded-full border border-white/15 bg-white/[0.04] px-6 py-2.5 text-sm font-bold text-white hover:bg-white/[0.08]">Send out again</button>
        <button type="button" onClick={onDone} className="flex-1 rounded-full bg-white px-6 py-2.5 text-sm font-bold text-black">Back to hub</button>
      </div>
    </div>
  );
}
