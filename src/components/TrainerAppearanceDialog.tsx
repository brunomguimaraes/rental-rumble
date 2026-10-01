import { useEffect, useId, useRef, useState } from 'react';
import { TRAINER_PORTRAITS, findTrainerPortrait, type TrainerPortraitId } from '../game/trainer-identity';
import { SKIN_TONES, HAIR_COLORS, type TrainerColors } from '../game/trainer-colors';
import { TrainerPortrait } from './TrainerPortrait';

export type AppearanceCategory = 'face' | 'skin' | 'hair';
const PAGE_SIZE = 9;

export function TrainerAppearanceDialog({ category, avatarId, colors, onAvatarChange, onColorsChange, onClose }: {
  category: AppearanceCategory;
  avatarId: TrainerPortraitId;
  colors: TrainerColors;
  onAvatarChange: (id: TrainerPortraitId) => void;
  onColorsChange: (colors: TrainerColors) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [page, setPage] = useState(() => Math.floor(TRAINER_PORTRAITS.findIndex((p) => p.id === avatarId) / PAGE_SIZE));
  const portrait = findTrainerPortrait(avatarId)!;
  const pageCount = Math.ceil(TRAINER_PORTRAITS.length / PAGE_SIZE);
  // Retired tones remain renderable for saved profiles, but are no longer offered.
  const choices = category === 'skin'
    ? SKIN_TONES.filter((tone) => tone.id !== 'deep' && tone.id !== 'ebony')
      .map((tone) => ({ ...tone, select: () => onColorsChange({ ...colors, skinTone: tone.id }) }))
    : HAIR_COLORS.map((tone) => ({ ...tone, select: () => onColorsChange({ ...colors, hairColor: tone.id }) }));
  const selectedColor = category === 'skin' ? colors.skinTone : colors.hairColor;
  const title = category === 'face' ? 'Choose your face' : category === 'skin' ? 'Skin tone' : 'Hair color';
  const colorChoices = [{ id: 'original', label: `Original ${title.toLowerCase()}`, color: undefined, select: () => onColorsChange(category === 'skin'
    ? { ...colors, skinTone: 'original' } : { ...colors, hairColor: 'original' }) },
    ...choices.map((tone, index) => ({ ...tone, label: `${title} ${index + 1}` }))];

  useEffect(() => {
    const node = dialog.current;
    node?.showModal();
    return () => node?.close();
  }, []);

  return (
    <dialog ref={dialog} aria-labelledby={titleId}
      onClose={(event) => { if (!event.currentTarget.open) onClose(); }}
      className="ui-window fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-y-auto p-3 font-pixel text-ink backdrop:bg-edge/90 sm:p-4">
      <header className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h2 id={titleId} className="text-xl font-bold leading-tight">{title}</h2>
          <p className="mt-1 text-xs text-ink-dim">{category === 'face' ? '40 faces. All yours to choose.' : 'Preview your colors as you choose.'}</p>
        </div>
        <button type="button" onClick={() => dialog.current?.close()}
          className="ui-button ui-focus min-h-11 shrink-0 px-3 font-label text-[9px] uppercase text-accent">Done</button>
      </header>

      {category === 'face' ? <>
        <fieldset>
          <legend className="sr-only">Trainer face</legend>
          <div className="grid min-h-[280px] grid-cols-3 auto-rows-[88px] gap-2">
            {TRAINER_PORTRAITS.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((option) => (
              <label key={option.id} className="relative cursor-pointer">
                <input type="radio" name="avatar" value={option.id} checked={avatarId === option.id}
                  onChange={() => onAvatarChange(option.id)} aria-label={option.name} className="peer sr-only" />
                <span className="flex h-full flex-col items-center justify-center border-2 border-edge bg-slot peer-checked:border-accent peer-checked:bg-button peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent">
                  <TrainerPortrait avatarId={option.id} colors={colors} />
                  <span className={`text-center text-xs leading-4 ${avatarId === option.id ? 'text-accent' : ''}`}>
                    {avatarId === option.id && <span aria-hidden="true">▶ </span>}{option.name}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <nav aria-label="Face pages" className="mt-3 flex items-center justify-between gap-2">
          <button type="button" disabled={page === 0} onClick={() => setPage(page - 1)} aria-label="Previous faces"
            className="ui-button ui-focus min-h-11 min-w-11 px-3 text-lg">←</button>
          <p aria-live="polite" className="text-center text-sm text-ink-dim">{page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, TRAINER_PORTRAITS.length)} of {TRAINER_PORTRAITS.length}</p>
          <button type="button" disabled={page === pageCount - 1} onClick={() => setPage(page + 1)} aria-label="Next faces"
            className="ui-button ui-focus min-h-11 min-w-11 px-3 text-lg">→</button>
        </nav>
      </> : <>
        <div className="mb-3 flex items-center gap-3 border-2 border-edge bg-slot px-2">
          <TrainerPortrait avatarId={avatarId} colors={colors} size={128} alt={`${portrait.name} color preview`} />
          <div className="min-w-0">
            <p className="font-label text-[9px] uppercase text-info">{title}</p>
            <p className="mt-2 text-xs leading-4 text-ink-dim">Hats and clothes keep their colors.</p>
          </div>
        </div>
        <fieldset>
          <legend className="sr-only">{title}</legend>
          <div className="grid grid-cols-4 gap-2">
            {colorChoices.map((tone) => (
              <label key={tone.id} className="relative cursor-pointer">
                <input type="radio" name="trainer-color" checked={selectedColor === tone.id} onChange={tone.select}
                  value={tone.id} aria-label={tone.label} className="peer sr-only" />
                <span className="flex min-h-16 items-center justify-center border-2 border-edge bg-slot peer-checked:border-accent peer-checked:bg-button peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent">
                  <span className="grid h-7 w-7 place-items-center border border-ink-dim text-lg text-ink-dim" style={{ backgroundColor: tone.color }} aria-hidden="true">{tone.color ? '' : '↺'}</span>
                  {selectedColor === tone.id && <span aria-hidden="true" className="absolute right-1 top-0 text-xs text-accent">✓</span>}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      </>}
    </dialog>
  );
}
