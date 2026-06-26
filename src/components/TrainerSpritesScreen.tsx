import { useMemo, useState } from 'react';
import { DEV } from '../game/dev';
import {
  TRAINER_SPRITES,
  type TrainerCategory,
  type TrainerGender,
  type TrainerSprite,
} from '../game/trainers.gen';

const ASSET = import.meta.env?.BASE_URL ?? '/';
const artUrl = (key: string) => `${ASSET}sprites/trainers/${key}.png`;
const gifUrl = (key: string) => `${ASSET}sprites/trainers/${key}.gif`;

const CATEGORIES: TrainerCategory[] = ['random', 'gym', 'elite', 'champion', 'special'];

const CATEGORY_LABEL: Record<TrainerCategory, string> = {
  random: 'Roadside',
  gym: 'Gym leaders',
  elite: 'Elite Four',
  champion: 'Champions',
  special: 'Special',
};

const GENDER_LABEL: Record<TrainerGender, string> = {
  m: '♂',
  f: '♀',
  x: '—',
};

type FlatSprite = TrainerSprite & { category: TrainerCategory };

function flattenSprites(): FlatSprite[] {
  return CATEGORIES.flatMap((category) =>
    TRAINER_SPRITES[category].map((sprite) => ({ ...sprite, category })),
  );
}

function SpriteTile({ sprite }: { sprite: FlatSprite }) {
  const label = sprite.name ?? sprite.cls ?? sprite.key;

  return (
    <figure className="flex flex-col items-center gap-1.5 rounded-2xl border border-white/10 bg-white/[0.03] p-2 text-center">
      <div className="flex items-end justify-center gap-1">
        <div className="flex flex-col items-center gap-0.5">
          <img
            src={artUrl(sprite.key)}
            alt={`${label} (static)`}
            title={`${label} — PNG`}
            className="h-14 w-14 object-contain [image-rendering:pixelated]"
          />
          <span className="text-[8px] uppercase tracking-wide text-white/30">PNG</span>
        </div>
        <div className="flex flex-col items-center gap-0.5">
          <img
            src={gifUrl(sprite.key)}
            alt={`${label} (animated)`}
            title={`${label} — GIF`}
            onError={(e) => {
              const img = e.currentTarget;
              if (img.src.endsWith('.gif')) img.src = artUrl(sprite.key);
            }}
            className="h-14 w-14 object-contain [image-rendering:pixelated]"
          />
          <span className="text-[8px] uppercase tracking-wide text-white/30">GIF</span>
        </div>
      </div>
      <figcaption className="w-full min-w-0">
        <div className="truncate text-[11px] font-semibold leading-tight text-white/85">
          {label}
        </div>
        <div className="mt-0.5 truncate text-[9px] text-white/35">{sprite.key}</div>
        <div className="mt-0.5 flex items-center justify-center gap-1.5 text-[9px] text-white/45">
          <span>{CATEGORY_LABEL[sprite.category]}</span>
          <span aria-hidden>·</span>
          <span title={`Gender: ${sprite.gender}`}>{GENDER_LABEL[sprite.gender]}</span>
        </div>
      </figcaption>
    </figure>
  );
}

/**
 * Dev-only contact sheet for every overworld trainer sprite. Returns null in
 * production so the roster never ships to players.
 */
export function TrainerSpritesScreen({ onBack }: { onBack: () => void }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<TrainerCategory | 'all'>('all');

  const all = useMemo(() => flattenSprites(), []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all.filter((s) => {
      if (category !== 'all' && s.category !== category) return false;
      if (!q) return true;
      return (
        s.key.toLowerCase().includes(q) ||
        (s.name?.toLowerCase().includes(q) ?? false) ||
        (s.cls?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [all, query, category]);

  const counts = useMemo(() => {
    const byCat = Object.fromEntries(
      CATEGORIES.map((cat) => [cat, TRAINER_SPRITES[cat].length]),
    ) as Record<TrainerCategory, number>;
    return { total: all.length, byCat };
  }, [all.length]);

  if (!DEV) return null;

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-6xl flex-col px-3 py-4 sm:px-5 sm:py-6">
      <header className="mb-3 flex flex-wrap items-start gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 rounded-full border border-white/20 px-4 py-1.5 text-sm font-semibold text-white/75 transition hover:bg-white/10"
        >
          ← Back
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-black leading-tight">Trainer sprites</h1>
          <p className="text-[11px] text-white/40">
            Dev contact sheet — static PNG and idle GIF side by side ({counts.total} total).
          </p>
        </div>
      </header>

      <div className="mb-3 flex flex-col gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, class, or key…"
          className="w-full rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm text-white/85 placeholder:text-white/30 focus:border-white/40 focus:outline-none"
        />
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            onClick={() => setCategory('all')}
            className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition ${
              category === 'all'
                ? 'border-white/60 bg-white/15 text-white'
                : 'border-white/10 text-white/55 hover:bg-white/10'
            }`}
          >
            All ({counts.total})
          </button>
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategory(cat)}
              className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition ${
                category === cat
                  ? 'border-white/60 bg-white/15 text-white'
                  : 'border-white/10 text-white/55 hover:bg-white/10'
              }`}
            >
              {CATEGORY_LABEL[cat]} ({counts.byCat[cat]})
            </button>
          ))}
        </div>
        <div className="text-[11px] text-white/40">
          {filtered.length} {filtered.length === 1 ? 'sprite' : 'sprites'}
        </div>
      </div>

      {category === 'all' && !query.trim() ? (
        CATEGORIES.map((cat) => (
          <section key={cat} className="mb-6">
            <h2 className="mb-2 text-xs font-bold uppercase tracking-widest text-white/45">
              {CATEGORY_LABEL[cat]} ({counts.byCat[cat]})
            </h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {TRAINER_SPRITES[cat].map((sprite) => (
                <SpriteTile key={sprite.key} sprite={{ ...sprite, category: cat }} />
              ))}
            </div>
          </section>
        ))
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {filtered.map((sprite) => (
            <SpriteTile key={sprite.key} sprite={sprite} />
          ))}
        </div>
      )}

      {filtered.length === 0 && (
        <div className="mt-10 text-center text-sm text-white/40">No sprites match that search.</div>
      )}
    </div>
  );
}
