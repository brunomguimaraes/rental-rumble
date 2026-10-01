import { useRef, useState, type FormEvent } from 'react';
import {
  TRAINER_NAME_MAX, DEFAULT_PORTRAIT_ID, cleanTrainerName,
  findTrainerPortrait, type TrainerIdentity, type TrainerPortraitId,
} from '../game/trainer-identity';
import { TrainerPortrait } from './TrainerPortrait';
import { SKIN_TONES, HAIR_COLORS, ORIGINAL_COLORS } from '../game/trainer-colors';
import { TrainerAppearanceDialog, type AppearanceCategory } from './TrainerAppearanceDialog';

export function TrainerIdentityPicker({ initialName, initialIdentity, onContinue }: {
  initialName: string;
  initialIdentity: TrainerIdentity | null;
  onContinue: (identity: TrainerIdentity) => void;
}) {
  const [name, setName] = useState(initialIdentity?.displayName ?? initialName);
  const [avatarId, setAvatarId] = useState<TrainerPortraitId>(initialIdentity?.avatarId ?? DEFAULT_PORTRAIT_ID);
  const [colors, setColors] = useState(initialIdentity?.colors ?? { ...ORIGINAL_COLORS });
  const [category, setCategory] = useState<AppearanceCategory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const portrait = findTrainerPortrait(avatarId)!;
  const skin = SKIN_TONES.find((tone) => tone.id === colors.skinTone);
  const hair = HAIR_COLORS.find((tone) => tone.id === colors.hairColor);
  const adjustments: { id: AppearanceCategory; label: string; value?: string; color?: string }[] = [
    { id: 'face', label: 'Face', value: portrait.name },
    { id: 'skin', label: 'Skin tone', color: skin?.color },
    { id: 'hair', label: 'Hair color', color: hair?.color },
  ];

  function submit(event: FormEvent) {
    event.preventDefault();
    const displayName = cleanTrainerName(name);
    if (!displayName) {
      setError('Use 1–24 characters, without control characters or < >.');
      nameInput.current?.focus();
      return;
    }
    onContinue({ displayName, avatarId, colors });
  }

  return (
    <>
      <form onSubmit={submit} className="flex flex-1 flex-col gap-5">
        <header>
          <p className="font-label text-[9px] uppercase tracking-wide text-info">01 / 03 · Welcome to Hearthvale</p>
          <h1 className="mt-2 text-2xl font-bold leading-tight sm:text-3xl">Create your trainer.</h1>
        </header>

        <div>
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="trainer-name" className="font-label text-[9px] uppercase text-info">Trainer name</label>
            <span className="text-xs text-ink-dim">{name.length}/{TRAINER_NAME_MAX}</span>
          </div>
          <input ref={nameInput} id="trainer-name" name="displayName" autoComplete="nickname" maxLength={TRAINER_NAME_MAX}
            value={name} onChange={(event) => { setName(event.target.value); setError(null); }}
            placeholder="Your trainer name" aria-invalid={Boolean(error)} aria-describedby={error ? 'trainer-name-error' : undefined}
            className="ui-focus mt-2 block min-h-11 w-full rounded-sm border-2 border-edge bg-slot px-3 font-pixel text-xl text-ink placeholder:text-ink-dim" />
          {error && <p id="trainer-name-error" role="alert" className="mt-2 text-sm text-accent">{error}</p>}
        </div>

        <section aria-label="Trainer appearance" className="my-auto">
          <div className="ui-window flex items-center gap-2 p-2 sm:gap-5 sm:p-4">
            <div className="flex w-32 shrink-0 flex-col items-center self-stretch justify-center bg-slot sm:w-64">
              <TrainerPortrait avatarId={avatarId} colors={colors} size={128} className="sm:h-64 sm:w-64" alt={`${portrait.name} trainer preview`} />
              <p className="max-w-full px-1 pb-2 text-center text-xs text-ink-dim sm:text-sm">{portrait.name}</p>
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-2" aria-label="Appearance adjustments">
              {adjustments.map((adjustment) => (
                <button key={adjustment.id} type="button" onClick={() => setCategory(adjustment.id)}
                  aria-label={`Change ${adjustment.label.toLowerCase()}${adjustment.value ? `: ${adjustment.value}` : ''}`} aria-haspopup="dialog"
                  className="ui-button ui-focus flex min-h-16 items-center gap-1 px-2 py-2 text-left sm:min-h-20 sm:px-3">
                  <span className="min-w-0 flex-1">
                    <span className="block font-label text-[8px] uppercase text-info sm:text-[10px]">{adjustment.label}</span>
                    <span className="mt-1 flex items-center gap-1 text-sm leading-4 sm:text-lg">
                      {adjustment.value ? <span>{adjustment.value}</span> : <span aria-hidden="true"
                        className="grid h-6 w-6 shrink-0 place-items-center border border-ink-dim text-ink-dim"
                        style={{ backgroundColor: adjustment.color }}>{adjustment.color ? '' : '↺'}</span>}
                    </span>
                  </span>
                  <span aria-hidden="true" className="text-xs text-accent">▶</span>
                </button>
              ))}
            </div>
          </div>
          <p className="mt-3 text-center text-sm text-ink-dim">Pick a face. Make it yours.</p>
        </section>

        <footer>
          <button type="submit" className="ui-button-primary ui-focus min-h-12 w-full px-4 font-label text-[10px] uppercase">
            Continue →
          </button>
          <p className="mt-2 text-center text-xs text-ink-dim">Next: choose your first Pokémon.</p>
        </footer>
      </form>
      {category && <TrainerAppearanceDialog key={category} category={category} avatarId={avatarId} colors={colors}
        onAvatarChange={setAvatarId} onColorsChange={setColors} onClose={() => setCategory(null)} />}
    </>
  );
}
