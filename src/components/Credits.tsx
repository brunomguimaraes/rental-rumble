import { useState } from 'react';
import { SPRITE_CREDITS, SPRITE_CREDIT_SOURCE } from '../game/spriteCredits.gen';

const isUrl = (s: string) => /^https?:\/\//.test(s);

const OTHER_SOURCES: { label: string; detail: string; href?: string }[] = [
  {
    label: 'Battle sprites & team icons',
    detail: 'Gen 9 Pokémon Essentials sprite pack',
  },
  {
    label: 'Gym / League badges',
    detail: 'Paldea badges, Bulbagarden Archives',
    href: 'https://archives.bulbagarden.net/wiki/Category:Badges',
  },
  {
    label: 'Pokémon data',
    detail: 'PokeAPI',
    href: 'https://pokeapi.co/',
  },
];

/** A self-contained "Credits & thanks" button + modal acknowledging the artists
 *  and projects whose assets this fan game relies on — chiefly the PMDCollab
 *  sprite artists, whose work powers the battle animations and portraits. */
export function Credits() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs font-semibold text-white/45 underline-offset-4 transition hover:text-white/80 hover:underline"
      >
        Credits & thanks
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-6"
          onClick={() => setOpen(false)}
        >
          <div
            className="max-h-[88dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-white/10 bg-[#0e0e15] p-5 text-left sm:rounded-3xl sm:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-xl font-black">Credits & thanks</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="shrink-0 rounded-full border border-white/20 px-3 py-1 text-xs font-semibold transition hover:bg-white/10"
              >
                Close
              </button>
            </div>

            <p className="mt-3 text-sm leading-relaxed text-white/65">
              This is a non-commercial fan project. Its character comes almost
              entirely from the incredible, freely-shared work of the{' '}
              <a
                href={SPRITE_CREDIT_SOURCE.site}
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-white underline underline-offset-2"
              >
                {SPRITE_CREDIT_SOURCE.project}
              </a>{' '}
              community — the animated battle sprites and the emotion portraits
              are theirs. Endless thanks to every artist below. 💛
            </p>

            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <a
                href={SPRITE_CREDIT_SOURCE.site}
                target="_blank"
                rel="noreferrer"
                className="rounded-full border border-white/15 px-3 py-1 font-semibold text-white/80 transition hover:bg-white/10"
              >
                Sprite repository ↗
              </a>
              <a
                href={SPRITE_CREDIT_SOURCE.repo}
                target="_blank"
                rel="noreferrer"
                className="rounded-full border border-white/15 px-3 py-1 font-semibold text-white/80 transition hover:bg-white/10"
              >
                SpriteCollab on GitHub ↗
              </a>
              <a
                href={SPRITE_CREDIT_SOURCE.licenseUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-full border border-white/15 px-3 py-1 font-semibold text-white/80 transition hover:bg-white/10"
              >
                {SPRITE_CREDIT_SOURCE.license} ↗
              </a>
            </div>

            {SPRITE_CREDITS.length > 0 && (
              <>
                <h3 className="mt-5 text-xs font-bold uppercase tracking-widest text-white/40">
                  Sprite artists ({SPRITE_CREDITS.length})
                </h3>
                <ul className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
                  {SPRITE_CREDITS.map((a) => (
                    <li
                      key={a.name}
                      className="flex items-baseline justify-between gap-2 text-sm"
                    >
                      {isUrl(a.contact) ? (
                        <a
                          href={a.contact}
                          target="_blank"
                          rel="noreferrer"
                          className="truncate text-white/85 underline-offset-2 hover:underline"
                        >
                          {a.name}
                        </a>
                      ) : (
                        <span className="truncate text-white/85">{a.name}</span>
                      )}
                      <span className="shrink-0 text-[11px] text-white/35">
                        {a.count}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}

            <h3 className="mt-5 text-xs font-bold uppercase tracking-widest text-white/40">
              Other assets & data
            </h3>
            <ul className="mt-2 space-y-1 text-sm text-white/70">
              {OTHER_SOURCES.map((s) => (
                <li key={s.label}>
                  <span className="text-white/85">{s.label}</span> —{' '}
                  {s.href ? (
                    <a
                      href={s.href}
                      target="_blank"
                      rel="noreferrer"
                      className="underline underline-offset-2 hover:text-white"
                    >
                      {s.detail}
                    </a>
                  ) : (
                    s.detail
                  )}
                </li>
              ))}
            </ul>

            <p className="mt-5 text-xs leading-relaxed text-white/40">
              Pokémon and all related sprites, names, and trademarks are ©
              Nintendo / Game Freak. No copyright infringement intended; this
              project is not for sale and earns nothing.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
