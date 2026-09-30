import { useEffect, useMemo, useState } from 'react';
import {
  ROUTES,
  IDLE_CAP_MS,
  encountersFor,
  isLevelInRoute,
  isPartyEligible,
  isRouteUnlocked,
  routeById,
  type Route,
  type RouteId,
} from '../game/routes';
import { ownedMonToCreature, type OwnedMon } from '../game/box';
import type { IdleSession } from '../game/idle-client';
import { MiniSprite } from './MiniSprite';
import { formatElapsed } from './formatElapsed';

// Send the trainer out (pick a route + party), or, while a session is open,
// watch the clock and claim. Elapsed time uses the server clock offset the
// caller measured so a wrong device clock can't show more than was earned.

function PartyMon({ mon, selected, eligible, onToggle }: { mon: OwnedMon; selected: boolean; eligible: boolean; onToggle: () => void }) {
  const creature = useMemo(() => ownedMonToCreature(mon), [mon]);
  if (!creature) return null;
  return (
    <button
      type="button"
      disabled={!eligible}
      onClick={onToggle}
      aria-pressed={selected}
      className={`flex w-[68px] shrink-0 flex-col items-center gap-1 rounded-2xl border px-1.5 py-2 transition ${
        selected ? 'border-emerald-400/70 bg-emerald-400/10' : eligible ? 'border-white/10 bg-white/[0.03] hover:bg-white/[0.07]' : 'border-white/5 bg-white/[0.01] opacity-40'
      }`}
    >
      <MiniSprite creature={creature} className="h-9 w-9" />
      <span className="w-full truncate text-center text-[10px] text-white/70" title={creature.name}>{creature.name}</span>
      <span className="text-[10px] font-bold text-white/50">Lv {mon.level}</span>
    </button>
  );
}

export function RouteScreen({
  box,
  session,
  serverOffsetMs,
  busy = false,
  onStart,
  onClaim,
  onBack,
}: {
  box: OwnedMon[];
  session: IdleSession | null;
  /** serverNow - Date.now() at the last sync. */
  serverOffsetMs: number;
  busy?: boolean;
  onStart: (routeId: RouteId, partyIds: string[]) => void;
  onClaim: (sessionId: string) => void;
  onBack: () => void;
}) {
  const [routeId, setRouteId] = useState<RouteId>('r1');
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [, tick] = useState(0);
  useEffect(() => {
    if (!session) return;
    const t = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, [session]);

  const route = routeById(routeId) ?? ROUTES[0];
  const partyIds = [...selected];
  const partyLevels = box.filter((m) => selected.has(m.id)).map((m) => m.level);
  const canStart = !busy && isPartyEligible(partyLevels, route);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < 6) next.add(id);
      return next;
    });

  const pickRoute = (r: Route) => {
    setRouteId(r.id);
    setSelected((prev) => new Set([...prev].filter((id) => {
      const m = box.find((x) => x.id === id);
      return m ? isLevelInRoute(m.level, r) : false;
    })));
  };

  if (session) {
    const r = routeById(session.routeId) ?? ROUTES[0];
    const elapsed = Math.min(Date.now() + serverOffsetMs - session.startedAt, IDLE_CAP_MS);
    const atCap = elapsed >= IDLE_CAP_MS;
    const party = session.partyIds.map((id) => box.find((m) => m.id === id)).filter((m): m is OwnedMon => Boolean(m));
    return (
      <div className="mx-auto flex min-h-[100dvh] max-w-md flex-col items-center justify-center px-5 py-10 text-center">
        <span className="text-5xl">{atCap ? '🏕️' : '🚶'}</span>
        <h1 className="mt-4 text-2xl font-black text-white">{atCap ? 'Your trainer is resting' : `Walking ${r.name}`}</h1>
        <p className="mt-2 text-white/60">
          {atCap ? 'The 8-hour cap is reached. Claim to see what happened.' : `Out for ${formatElapsed(elapsed)} · about ${encountersFor(elapsed, r)} encounters so far`}
        </p>
        <div className="mt-6 flex gap-2">
          {party.map((m) => {
            const c = ownedMonToCreature(m);
            return c ? <MiniSprite key={m.id} creature={c} className="h-8 w-8" /> : null;
          })}
        </div>
        <button type="button" disabled={busy} onClick={() => onClaim(session.id)} className="mt-8 rounded-full bg-white px-8 py-3 text-sm font-bold text-black transition hover:scale-[1.02] active:scale-95 disabled:opacity-60">
          {busy ? '…' : 'Claim'}
        </button>
        <button type="button" onClick={onBack} className="mt-4 text-sm text-white/50 hover:text-white">Back to hub</button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-2xl flex-col px-5 py-8">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-black text-white">Send out</h1>
        <button type="button" onClick={onBack} className="text-sm text-white/50 hover:text-white">Back</button>
      </header>

      <section className="mt-6">
        <div className="mb-2 text-xs font-bold uppercase tracking-widest text-white/40">Choose a route</div>
        <div className="grid gap-2 sm:grid-cols-2">
          {ROUTES.map((r) => {
            const unlocked = isRouteUnlocked(r, []);
            const active = r.id === routeId;
            return (
              <button
                key={r.id}
                type="button"
                disabled={!unlocked}
                onClick={() => pickRoute(r)}
                aria-pressed={active}
                className={`rounded-2xl border px-4 py-3 text-left transition ${
                  !unlocked ? 'cursor-not-allowed border-white/5 opacity-40' : active ? 'border-emerald-400/70 bg-emerald-400/10' : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06]'
                }`}
              >
                <div className="flex items-baseline justify-between">
                  <span className="font-bold text-white">{r.name}</span>
                  <span className="text-xs font-semibold text-white/50">Lv {r.min}-{r.max}</span>
                </div>
                <div className="mt-1 text-xs text-white/50">{unlocked ? r.blurb : 'Locked'}</div>
              </button>
            );
          })}
        </div>
      </section>

      <section className="mt-6">
        <div className="mb-2 flex items-baseline justify-between">
          <div className="text-xs font-bold uppercase tracking-widest text-white/40">Your party ({partyIds.length}/6)</div>
          <div className="text-xs text-white/40">{route.name} · Lv {route.min}-{route.max}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          {box.map((m) => (
            <PartyMon key={m.id} mon={m} selected={selected.has(m.id)} eligible={isLevelInRoute(m.level, route)} onToggle={() => toggle(m.id)} />
          ))}
        </div>
      </section>

      <div className="mt-auto pt-8">
        <button
          type="button"
          disabled={!canStart}
          onClick={() => onStart(route.id, partyIds)}
          className="w-full rounded-full bg-white px-6 py-3 text-sm font-bold text-black transition hover:scale-[1.01] active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? '…' : partyIds.length === 0 ? 'Pick at least one Pokémon' : `Walk ${route.name}`}
        </button>
      </div>
    </div>
  );
}
