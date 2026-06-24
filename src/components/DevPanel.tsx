import { useState } from 'react';
import {
  DEV,
  autoWinEnabled,
  setAutoWin,
  allRareEnabled,
  setAllRare,
  allShinyEnabled,
  setAllShiny,
} from '../game/dev';

interface Toggle {
  label: string;
  hint: string;
  get: () => boolean;
  set: (on: boolean) => boolean;
  accent: string;
}

const TOGGLES: Toggle[] = [
  {
    label: 'Auto-win matches',
    hint: 'Every battle resolves instantly as a win.',
    get: autoWinEnabled,
    set: setAutoWin,
    accent: 'emerald',
  },
  {
    label: 'All rare/mythic',
    hint: "Next run's draft is all rare/mythic signs.",
    get: allRareEnabled,
    set: setAllRare,
    accent: 'violet',
  },
  {
    label: 'All shiny',
    hint: "Next run's draft is all shiny (where available).",
    get: allShinyEnabled,
    set: setAllShiny,
    accent: 'amber',
  },
];

const ACCENT: Record<string, { on: string; dot: string }> = {
  emerald: {
    on: 'border-emerald-400/50 bg-emerald-400/15 text-emerald-200',
    dot: 'bg-emerald-400',
  },
  violet: {
    on: 'border-violet-400/50 bg-violet-400/15 text-violet-200',
    dot: 'bg-violet-400',
  },
  amber: {
    on: 'border-amber-400/50 bg-amber-400/15 text-amber-200',
    dot: 'bg-amber-400',
  },
};

/**
 * Floating dev-cheat panel, reachable from every screen. Rendered only in dev:
 * the whole component early-returns null outside `import.meta.env.DEV`, and the
 * underlying flags read false in production regardless, so cheats can never leak
 * to a real build even if a flag lingers in localStorage.
 */
export function DevPanel() {
  const [open, setOpen] = useState(false);
  // Local mirror of the persisted flags so the toggles re-render on tap.
  const [state, setState] = useState(() => TOGGLES.map((t) => t.get()));

  if (!DEV) return null;

  const toggle = (i: number) => {
    const next = TOGGLES[i].set(!state[i]);
    setState((prev) => prev.map((v, j) => (j === i ? next : v)));
  };

  const anyOn = state.some(Boolean);

  return (
    <div className="fixed bottom-3 right-3 z-[100] flex flex-col items-end gap-2 text-left">
      {open && (
        <div className="w-60 rounded-2xl border border-white/15 bg-[#0c0c14]/95 p-3 shadow-2xl backdrop-blur-xl">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">
              Dev cheats
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-white/40 transition hover:text-white"
              aria-label="Close dev panel"
            >
              ✕
            </button>
          </div>
          <div className="flex flex-col gap-2">
            {TOGGLES.map((t, i) => {
              const accent = ACCENT[t.accent];
              return (
                <button
                  key={t.label}
                  type="button"
                  onClick={() => toggle(i)}
                  aria-pressed={state[i]}
                  className={`flex flex-col items-start rounded-xl border px-3 py-2 text-left transition ${
                    state[i]
                      ? accent.on
                      : 'border-white/10 bg-white/[0.03] text-white/70 hover:bg-white/[0.07]'
                  }`}
                >
                  <span className="flex items-center gap-2 text-xs font-semibold">
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        state[i] ? accent.dot : 'bg-white/20'
                      }`}
                    />
                    {t.label}
                    <span className="text-white/35">{state[i] ? 'ON' : 'OFF'}</span>
                  </span>
                  <span className="mt-0.5 text-[10px] leading-tight text-white/40">
                    {t.hint}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest shadow-lg backdrop-blur transition ${
          anyOn
            ? 'border-amber-300/50 bg-amber-300/15 text-amber-200'
            : 'border-white/15 bg-black/60 text-white/55 hover:bg-white/10'
        }`}
      >
        <span
          className={`h-1.5 w-1.5 rounded-full ${
            anyOn ? 'bg-amber-300' : 'bg-white/30'
          }`}
        />
        Dev
      </button>
    </div>
  );
}
