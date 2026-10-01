import { useState } from 'react';
import { ownedMonToCreature, type OwnedMon } from '../game/box';
import { PARTY_MAX, partyMembers, sameParty, saveParty } from '../game/party';
import { PixelSprite } from './ui/PixelSprite';
import { ExpBar } from './ui/ExpBar';
import { POKEBALL, monName } from './world/scene';

// The saved party: up to six of the trainer's Pokémon, lead first. A menu
// cursor (▶) picks a member; one action row moves, promotes or removes it.
// Nothing changes on the server until Save.

function VariantMarks({ mon }: { mon: OwnedMon }) {
  if (mon.shiny) {
    return (
      <span className="text-xs text-caught-shiny">
        <span aria-hidden="true">✦</span>
        <span className="sr-only">Shiny</span>
      </span>
    );
  }
  if (mon.altColor) {
    return (
      <span className="text-xs text-caught-alt">
        <span aria-hidden="true">◆</span>
        <span className="sr-only">Alt colour</span>
      </span>
    );
  }
  return null;
}

function Portrait({ mon, size = 40 }: { mon: OwnedMon; size?: number }) {
  const creature = ownedMonToCreature(mon);
  return <PixelSprite src={creature?.portrait ?? POKEBALL} fallback={POKEBALL} size={size} alt="" />;
}

export function PartyScreen({
  box,
  party,
  activityRunning,
  onSaved,
  onBack,
  onExpired,
}: {
  box: OwnedMon[];
  party: string[];
  activityRunning: boolean;
  onSaved: (party: string[]) => void;
  onBack: () => void;
  onExpired: () => void;
}) {
  const owned = new Set(box.map((m) => m.id));
  const [draft, setDraft] = useState<string[]>(() => party.filter((id) => owned.has(id)).slice(0, PARTY_MAX));
  const [cursor, setCursor] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const members = partyMembers(draft, box);
  const dirty = !sameParty(draft, party);
  const full = draft.length >= PARTY_MAX;
  const selected = members[cursor] ?? null;

  const edit = (next: string[], nextCursor: number) => {
    setDraft(next);
    setCursor(Math.max(0, Math.min(nextCursor, next.length - 1)));
    setSaved(false);
    setError(null);
  };
  const move = (from: number, to: number) => {
    if (to < 0 || to >= draft.length) return;
    const next = [...draft];
    [next[from], next[to]] = [next[to], next[from]];
    edit(next, to);
  };
  const makeLead = (from: number) => {
    const next = [...draft];
    const [id] = next.splice(from, 1);
    edit([id, ...next], 0);
  };
  const remove = (at: number) => edit(draft.filter((_, i) => i !== at), at);
  const add = (id: string) => edit([...draft, id], draft.length);

  const save = async () => {
    setSaving(true);
    setError(null);
    const res = await saveParty(draft);
    setSaving(false);
    if (res.expired) return onExpired();
    if (!res.ok || !res.party) {
      setError(res.error ?? 'Couldn’t save your party.');
      return;
    }
    onSaved(res.party);
    setSaved(true);
  };

  return (
    <div className="mx-auto min-h-[100dvh] max-w-[430px] px-4 pb-32 pt-4 font-pixel text-ink">
      <header className="mb-3 flex items-center gap-3">
        <button type="button" onClick={onBack} className="ui-button ui-focus min-h-11 px-3 font-label text-[10px] uppercase">
          ◀ Back
        </button>
        <h1 className="font-label text-sm uppercase text-accent [text-shadow:2px_2px_0_#000]">Your party</h1>
      </header>

      {activityRunning && (
        <p className="ui-window m-2 p-3 text-sm text-ink-dim">
          Your current encounter keeps its starting party. Changes here apply to the next search.
        </p>
      )}

      <section aria-labelledby="party-heading" className="ui-window m-2 p-2">
        <div className="mb-2 flex items-center justify-between px-1">
          <h2 id="party-heading" className="font-label text-[11px] uppercase text-info">
            Party
          </h2>
          <span className="font-label text-[9px] uppercase text-ink-dim">
            {draft.length} / {PARTY_MAX}
          </span>
        </div>
        <ol className="flex flex-col gap-1">
          {Array.from({ length: PARTY_MAX }, (_, i) => {
            const mon = members[i];
            if (!mon) {
              return (
                <li key={`empty-${i}`} className="flex min-h-12 items-center gap-2 rounded-[3px] border border-dashed border-window-frame px-2 text-sm text-ink-dim">
                  <span className="w-3 font-label text-[9px]">{i + 1}</span>
                  Empty slot
                </li>
              );
            }
            const active = i === cursor;
            return (
              <li key={mon.id}>
                <button
                  type="button"
                  onClick={() => setCursor(i)}
                  aria-pressed={active}
                  className={`ui-focus flex min-h-12 w-full items-center gap-2 rounded-[3px] px-1.5 py-1 text-left ${active ? 'bg-button' : 'bg-slot'}`}
                >
                  <span aria-hidden="true" className={`w-3 font-label text-[10px] ${active ? 'text-accent' : 'text-transparent'}`}>
                    ▶
                  </span>
                  <Portrait mon={mon} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1 text-sm">
                      <span className="truncate">{monName(mon)}</span>
                      <VariantMarks mon={mon} />
                    </span>
                    {i === 0 && <span className="block font-label text-[9px] uppercase text-accent">Lead</span>}
                    <span className="mt-0.5 flex">
                      <ExpBar level={mon.level} exp={mon.exp} />
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>

        {selected && (
          <div role="group" aria-label={`Actions for ${monName(selected)}`} className="mt-2 grid grid-cols-4 gap-1.5 border-t border-window-frame px-1 pt-2">
            <button type="button" disabled={cursor === 0} onClick={() => move(cursor, cursor - 1)} className="ui-button ui-focus min-h-11 font-label text-[9px] uppercase">
              ▲ Up
            </button>
            <button type="button" disabled={cursor >= draft.length - 1} onClick={() => move(cursor, cursor + 1)} className="ui-button ui-focus min-h-11 font-label text-[9px] uppercase">
              ▼ Down
            </button>
            <button type="button" disabled={cursor === 0} onClick={() => makeLead(cursor)} className="ui-button ui-focus min-h-11 font-label text-[9px] uppercase">
              Lead
            </button>
            <button
              type="button"
              disabled={draft.length <= 1}
              onClick={() => remove(cursor)}
              title={draft.length <= 1 ? 'A party needs at least one Pokémon' : undefined}
              className="ui-button ui-focus min-h-11 font-label text-[9px] uppercase"
            >
              ✕ Out
            </button>
          </div>
        )}
      </section>

      <section aria-labelledby="box-heading" className="ui-window m-2 mt-4 p-2">
        <div className="mb-2 flex items-center justify-between px-1">
          <h2 id="box-heading" className="font-label text-[11px] uppercase text-info">
            Box
          </h2>
          <span className="font-label text-[9px] uppercase text-ink-dim">{full ? 'Party full' : 'Tap to add'}</span>
        </div>
        {box.length === 0 ? (
          <p className="px-1 py-3 text-sm text-ink-dim">No Pokémon yet.</p>
        ) : (
          <ul className="grid grid-cols-3 gap-1.5 min-[400px]:grid-cols-4">
            {box.map((mon) => {
              const inParty = draft.includes(mon.id);
              const name = monName(mon);
              return (
                <li key={mon.id}>
                  <button
                    type="button"
                    disabled={inParty || full}
                    onClick={() => add(mon.id)}
                    aria-label={inParty ? `${name}, in your party` : full ? `${name}, party is full` : `Add ${name}`}
                    className="ui-focus flex w-full flex-col items-center gap-0.5 rounded-[3px] bg-slot px-1 pb-1.5 pt-1 disabled:cursor-not-allowed"
                  >
                    <Portrait mon={mon} />
                    <span className="flex w-full items-center justify-center gap-0.5 text-xs">
                      <span className="truncate">{name}</span>
                      <VariantMarks mon={mon} />
                    </span>
                    {inParty ? (
                      <span className="font-label text-[8px] uppercase text-accent">In party</span>
                    ) : (
                      <ExpBar level={mon.level} exp={mon.exp} />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t-2 border-window-frame bg-window pb-[max(12px,env(safe-area-inset-bottom))] pt-3">
        <div className="mx-auto flex max-w-[430px] items-center gap-3 px-4">
          <p aria-live="polite" className={`min-w-0 flex-1 text-sm ${error ? 'text-accent' : 'text-ink-dim'}`}>
            {error ?? (saving ? 'Saving…' : saved && !dirty ? 'Party saved.' : dirty ? 'Unsaved changes.' : 'Up to six Pokémon.')}
          </p>
          {dirty && (
            <button type="button" onClick={() => edit(party.filter((id) => owned.has(id)), 0)} className="ui-button ui-focus min-h-11 px-3 font-label text-[10px] uppercase">
              Reset
            </button>
          )}
          <button
            type="button"
            disabled={!dirty || saving || draft.length === 0}
            onClick={() => void save()}
            className="ui-button-primary ui-focus min-h-11 px-4 font-label text-[11px] uppercase"
          >
            Save party
          </button>
        </div>
      </div>
    </div>
  );
}
