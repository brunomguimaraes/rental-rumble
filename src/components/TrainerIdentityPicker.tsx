import { useState, type FormEvent } from 'react';
import {
  TRAINER_PORTRAITS, TRAINER_NAME_MAX, DEFAULT_PORTRAIT_ID, cleanTrainerName,
  findTrainerPortrait, type TrainerIdentity, type TrainerPortraitId, type PortraitStyle,
} from '../game/trainer-identity';
import { TrainerPortrait } from './TrainerPortrait';
import { SKIN_TONES, HAIR_COLORS, ORIGINAL_COLORS } from '../game/trainer-colors';

export function TrainerIdentityPicker({ initialName, initialIdentity, onContinue }: {
  initialName: string;
  initialIdentity: TrainerIdentity | null;
  onContinue: (identity: TrainerIdentity) => void;
}) {
  const [name, setName] = useState(initialIdentity?.displayName ?? initialName);
  const [avatarId, setAvatarId] = useState<TrainerPortraitId>(initialIdentity?.avatarId ?? DEFAULT_PORTRAIT_ID);
  const [filter, setFilter] = useState<PortraitStyle | 'all'>('all');
  const [colors, setColors] = useState(initialIdentity?.colors ?? { ...ORIGINAL_COLORS });
  const [error, setError] = useState<string | null>(null);
  const portrait = findTrainerPortrait(avatarId)!;
  const visible = TRAINER_PORTRAITS.filter((p) => filter === 'all' || p.gender === filter);

  function submit(event: FormEvent) {
    event.preventDefault();
    const displayName = cleanTrainerName(name);
    if (!displayName) {
      setError('Choose a name of 1–24 characters, without special control characters or < >.');
      return;
    }
    onContinue({ displayName, avatarId, colors });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      <header>
        <p className="font-label text-[10px] uppercase tracking-wider text-info">Welcome to Hearthvale</p>
        <h1 className="mt-2 font-pixel text-3xl font-bold text-ink">Every journey starts with you.</h1>
        <p className="mt-2 text-base text-ink-dim">Choose your trainer name and a face for your adventure.</p>
      </header>

      <section className="ui-window flex items-center gap-3 p-3" aria-label="Trainer card preview">
        <div className="shrink-0 bg-slot"><TrainerPortrait avatarId={avatarId} colors={colors} size={128} /></div>
        <div className="min-w-0">
          <p className="font-label text-[9px] uppercase text-info">Trainer card</p>
          <p className="mt-2 break-words text-2xl font-bold leading-tight">{name.trim() || 'Your name'}</p>
          <p className="mt-2 text-sm text-ink-dim">Your story is about to begin.</p>
          <p className="mt-2 font-label text-[9px] uppercase text-accent">{portrait.name}</p>
        </div>
      </section>

      <div>
        <label htmlFor="trainer-name" className="font-label text-[10px] uppercase text-info">What should we call you?</label>
        <input id="trainer-name" name="displayName" autoComplete="nickname" maxLength={TRAINER_NAME_MAX}
          value={name} onChange={(event) => { setName(event.target.value); setError(null); }}
          placeholder="Your trainer name" aria-invalid={Boolean(error)} aria-describedby={error ? 'trainer-name-error' : 'trainer-name-help'}
          className="ui-focus mt-2 block min-h-12 w-full rounded-sm border-2 border-edge bg-slot px-3 font-pixel text-xl text-ink placeholder:text-ink-dim" />
        <div id="trainer-name-help" className="mt-2 flex justify-between gap-2 text-sm text-ink-dim">
          <span>This name appears on your trainer card.</span><span>{name.length}/{TRAINER_NAME_MAX}</span>
        </div>
        {error && <p id="trainer-name-error" role="alert" className="mt-2 text-sm text-accent">{error}</p>}
      </div>

      <div className="ui-window flex flex-col gap-4 p-3">
        <fieldset>
          <legend className="font-label text-[10px] uppercase text-info">Skin tone</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" aria-pressed={colors.skinTone === 'original'} onClick={() => setColors({ ...colors, skinTone: 'original' })}
              className={`ui-button ui-focus min-h-11 px-2 text-sm ${colors.skinTone === 'original' ? 'text-accent' : 'text-ink'}`}>Original</button>
            {SKIN_TONES.map((tone) => <button key={tone.id} type="button" aria-label={tone.label} title={tone.label}
              aria-pressed={colors.skinTone === tone.id} onClick={() => setColors({ ...colors, skinTone: tone.id })}
              className={`ui-focus grid h-11 w-11 place-items-center border-2 ${colors.skinTone === tone.id ? 'border-accent' : 'border-edge'}`}>
              <span className="h-7 w-7 border border-ink-dim" style={{ backgroundColor: tone.color }} />
            </button>)}
          </div>
        </fieldset>
        <fieldset>
          <legend className="font-label text-[10px] uppercase text-info">Hair color</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" aria-pressed={colors.hairColor === 'original'} onClick={() => setColors({ ...colors, hairColor: 'original' })}
              className={`ui-button ui-focus min-h-11 px-2 text-sm ${colors.hairColor === 'original' ? 'text-accent' : 'text-ink'}`}>Original</button>
            {HAIR_COLORS.map((color) => <button key={color.id} type="button" aria-label={`${color.label} hair`} title={color.label}
              aria-pressed={colors.hairColor === color.id} onClick={() => setColors({ ...colors, hairColor: color.id })}
              className={`ui-focus grid h-11 w-11 place-items-center border-2 ${colors.hairColor === color.id ? 'border-accent' : 'border-edge'}`}>
              <span className="h-7 w-7 border border-ink-dim" style={{ backgroundColor: color.color }} />
            </button>)}
          </div>
        </fieldset>
        <p className="text-sm text-ink-dim">Your colors carry across portraits. Hats, scarves and clothes keep their original colors.</p>
      </div>

      <fieldset>
        <legend className="font-label text-[10px] uppercase text-info">Choose your portrait</legend>
        <p className="mt-2 text-sm text-ink-dim">40 faces. Pick whichever feels like you.</p>
        <div className="my-3 flex flex-wrap gap-2" aria-label="Portrait styles">
          {(['all', 'masculine', 'feminine'] as const).map((style) => (
            <button key={style} type="button" aria-pressed={filter === style} onClick={() => setFilter(style)}
              className={`ui-button ui-focus min-h-11 px-3 font-label text-[9px] uppercase ${filter === style ? 'text-accent' : 'text-ink-dim'}`}>
              {style === 'all' ? 'All · 40' : `${style} · 20`}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(72px,1fr))] gap-2">
          {visible.map((option) => (
            <label key={option.id} title={option.name} className="relative cursor-pointer">
              <input type="radio" name="avatar" value={option.id} checked={avatarId === option.id}
                onChange={() => setAvatarId(option.id)} className="peer sr-only"
                aria-label={option.name} />
              <span className="flex h-full flex-col items-center border-2 border-edge bg-slot px-1 pb-2 pt-1 peer-checked:border-accent peer-checked:bg-button peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent">
                <TrainerPortrait avatarId={option.id} colors={colors} />
                <span className="mt-1 text-center text-xs leading-4">{option.name}</span>
                <span className={`mt-1 h-3 font-label text-[8px] uppercase ${avatarId === option.id ? 'text-accent' : 'text-ink-dim'}`} aria-hidden="true">
                  {avatarId === option.id ? 'Selected' : ''}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="sticky bottom-0 -mx-2 border-t-2 border-edge bg-field px-2 py-3">
        <button type="submit" className="ui-button ui-focus min-h-12 w-full px-4 font-label text-[11px] uppercase text-accent">
          Continue with this trainer →
        </button>
        <p className="mt-2 text-center text-sm text-ink-dim">Next: meet your professor and choose a partner.</p>
      </div>
    </form>
  );
}
