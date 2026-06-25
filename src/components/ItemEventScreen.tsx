import { useMemo, useState } from 'react';
import type { Creature, RelicId } from '../game/types';
import { itemUrl } from '../game/pokemon';
import {
  RELICS,
  rollRelicOffer,
  type RelicRarity,
} from '../game/relics';

// Per-rarity framing for an offered relic, mirroring the sign-rarity palette used
// elsewhere: commons stay neutral, rares glow fuchsia, legendaries blaze gold.
const RARITY: Record<RelicRarity, { ring: string; chip: string; glow: string; label: string }> = {
  common: {
    ring: 'border-white/10',
    chip: 'border-white/15 bg-white/10 text-white/70',
    glow: 'rgba(255,255,255,0.18)',
    label: 'Common',
  },
  rare: {
    ring: 'border-fuchsia-300/40',
    chip: 'border-fuchsia-300/45 bg-fuchsia-300/10 text-fuchsia-200',
    glow: 'rgba(232,121,249,0.45)',
    label: 'Rare',
  },
  legendary: {
    ring: 'border-amber-300/45',
    chip: 'border-amber-300/50 bg-amber-300/10 text-amber-200',
    glow: 'rgba(251,191,36,0.5)',
    label: 'Legendary',
  },
};

/**
 * A between-battles item event: the player is offered a few team-wide passive
 * "relics" (built from held-item art) and may take one — or skip it. Which relics
 * appear is pinned to the run seed + the stage this event sits before, so the
 * offer can't be re-fished by leaving and returning (see rollRelicOffer).
 */
export function ItemEventScreen({
  seed,
  stage,
  team,
  owned,
  nextLabel,
  onConfirm,
}: {
  seed: string;
  stage: number;
  team: Creature[];
  owned: RelicId[];
  nextLabel: string;
  onConfirm: (picked: RelicId | null) => void;
}) {
  const offer = useMemo(
    () => rollRelicOffer(seed, stage, team, owned),
    [seed, stage, team, owned],
  );
  const [selected, setSelected] = useState<RelicId | null>(null);
  // Skipping an offered relic throws away a free, downside-free team buff, so the
  // skip asks "are you sure?" first. Taking one — or pressing past an empty offer
  // with nothing to skip — commits immediately.
  const [confirmingSkip, setConfirmingSkip] = useState(false);

  const empty = offer.length === 0;
  const continueLabel = selected ? nextLabel : empty ? nextLabel : 'Skip — take nothing';

  const handlePrimary = () => {
    if (!empty && !selected) {
      setConfirmingSkip(true);
      return;
    }
    onConfirm(selected);
  };

  return (
    <div className="mx-auto max-w-5xl px-3 py-6 pb-28 sm:px-4 sm:py-8 sm:pb-28">
      <div className="text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-white/10 bg-white/5 text-3xl">
          🎁
        </div>
        <h2 className="mt-3 text-2xl font-black text-amber-200 sm:text-3xl">
          An item lies ahead
        </h2>
        <p className="mx-auto mt-1 max-w-lg text-sm text-white/55">
          {empty
            ? 'Nothing here suits your team right now. Press on.'
            : 'Take one relic to empower your whole team for the rest of the run — or leave it and move on.'}
        </p>
      </div>

      {owned.length > 0 && (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-white/35">
            Held relics
          </span>
          {owned.map((id, i) => (
            <img
              key={`${id}-${i}`}
              src={itemUrl(RELICS[id].icon)}
              alt={RELICS[id].name}
              title={`${RELICS[id].name} — ${RELICS[id].description}`}
              className="h-7 w-7 rounded-lg border border-white/10 bg-white/5 object-contain p-0.5 [image-rendering:pixelated]"
            />
          ))}
        </div>
      )}

      {!empty && (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {offer.map((id) => {
            const def = RELICS[id];
            const r = RARITY[def.rarity];
            const isPicked = selected === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setSelected(isPicked ? null : id);
                  setConfirmingSkip(false);
                }}
                className={`group flex flex-col items-center rounded-3xl border bg-white/[0.03] p-6 text-center transition-all hover:bg-white/[0.07] ${
                  isPicked
                    ? 'scale-[1.02] border-white/60'
                    : `${r.ring} hover:scale-[1.02] hover:border-white/30`
                }`}
                style={isPicked ? { boxShadow: `0 0 36px 4px ${r.glow}` } : undefined}
              >
                <div
                  className="grid h-20 w-20 place-items-center rounded-2xl border border-white/10 bg-black/30"
                  style={{ boxShadow: `inset 0 0 24px ${r.glow}` }}
                >
                  <img
                    src={itemUrl(def.icon)}
                    alt={def.name}
                    className="h-12 w-12 object-contain [image-rendering:pixelated]"
                  />
                </div>
                <span
                  className={`mt-3 rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${r.chip}`}
                >
                  {r.label}
                </span>
                <h3 className="mt-2 text-lg font-black text-white">{def.name}</h3>
                <p className="mt-1 max-w-xs text-sm text-white/55">{def.description}</p>
              </button>
            );
          })}
        </div>
      )}

      {/* Anchored action bar */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-white/10 bg-[#0c0c14]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center justify-center gap-3 px-3 py-3 sm:px-4">
          {confirmingSkip ? (
            <div className="flex w-full flex-col items-center justify-center gap-3 sm:w-auto sm:flex-row">
              <span className="text-center text-sm text-white/70">
                Relics buff your whole team for the rest of the run — no
                downside. Skip it?
              </span>
              <div className="flex w-full items-center gap-3 sm:w-auto">
                <button
                  type="button"
                  onClick={() => setConfirmingSkip(false)}
                  className="flex-1 rounded-full bg-white px-6 py-3 text-base font-bold text-black transition-transform hover:scale-105 active:scale-95 sm:flex-none"
                >
                  Go back
                </button>
                <button
                  type="button"
                  onClick={() => onConfirm(null)}
                  className="flex-1 rounded-full border border-amber-300/40 bg-amber-300/15 px-6 py-3 text-base font-bold text-amber-200 transition hover:bg-amber-300/25 sm:flex-none"
                >
                  Skip anyway →
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={handlePrimary}
              className="w-full rounded-full bg-white px-8 py-3 text-base font-bold text-black transition-transform hover:scale-105 active:scale-95 sm:w-auto sm:text-lg"
            >
              {selected ? `Take ${RELICS[selected].name}` : continueLabel} →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
